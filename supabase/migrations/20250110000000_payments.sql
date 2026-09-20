-- =============================================================================
-- WritePilot :: 0016 :: Payments
-- -----------------------------------------------------------------------------
-- Phase 10: turning the plan catalogue into something a person can actually buy.
--
-- The money itself is held by the payment provider. What lives here is the
-- record of what it told us and what we did about it: every webhook delivery,
-- exactly once, and the plan and credit changes that followed.
--
-- Two rules shape all of it.
--
-- First, a payment provider retries. The same event will arrive twice, out of
-- order, or long after the fact, and any of those double-granting a month of
-- credits would be a bug the user pays for. So the event log is the primary key
-- on provider delivery, and every state change underneath it is keyed on
-- something stable.
--
-- Second, the browser is never told what was bought. A checkout session's
-- success URL is a redirect a user can visit by hand; entitlements change when
-- the provider says so, over a signed webhook, and not before.
-- =============================================================================

do $$ begin
  create type public.payment_event_status as enum (
    'received',   -- stored, not yet handled
    'processed',  -- handled successfully
    'ignored',    -- a type we deliberately do not act on
    'failed'      -- handling raised; kept for retry and inspection
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_kind as enum ('subscription', 'credit_pack');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.payment_status as enum ('succeeded', 'refunded', 'failed');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- billing_customers
-- -----------------------------------------------------------------------------
-- The provider's customer record for a user. Created before any subscription
-- exists, because a one-off credit purchase needs one too.

create table if not exists public.billing_customers (
  user_id              uuid primary key references public.profiles (id) on delete cascade,
  provider             text not null default 'stripe',
  provider_customer_id text not null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  unique (provider, provider_customer_id)
);

comment on table public.billing_customers is
  'The payment provider''s customer id for a user. Server-written only.';

drop trigger if exists billing_customers_set_updated_at on public.billing_customers;
create trigger billing_customers_set_updated_at
  before update on public.billing_customers
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- payment_events
-- -----------------------------------------------------------------------------
-- Every webhook delivery, stored before it is acted on. The primary key is the
-- provider's own event id, which is what makes "exactly once" true rather than
-- aspirational: a redelivery collides here and is dropped.

create table if not exists public.payment_events (
  provider     text not null default 'stripe',
  event_id     text not null,
  type         text not null,
  status       public.payment_event_status not null default 'received',
  payload      jsonb not null default '{}'::jsonb,
  error        text,
  received_at  timestamptz not null default now(),
  processed_at timestamptz,

  primary key (provider, event_id)
);

comment on table public.payment_events is
  'Webhook deliveries, keyed by the provider''s event id so a retry is a no-op.';

create index if not exists payment_events_status_idx
  on public.payment_events (status, received_at desc);

-- -----------------------------------------------------------------------------
-- payments
-- -----------------------------------------------------------------------------

create table if not exists public.payments (
  id                 uuid primary key default extensions.gen_random_uuid(),
  user_id            uuid not null references public.profiles (id) on delete cascade,

  provider           text not null default 'stripe',
  -- The provider's id for the thing that was paid: an invoice, a payment
  -- intent, a checkout session. Unique, so a replayed webhook cannot record
  -- the same purchase twice.
  provider_reference text not null,

  kind               public.payment_kind not null,
  status             public.payment_status not null default 'succeeded',

  amount_cents       integer not null check (amount_cents >= 0),
  currency           text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  description        text,
  -- For a credit pack: how many credits this bought. Zero for a subscription
  -- invoice, whose allowance is granted by the plan machinery instead.
  credits_granted    integer not null default 0 check (credits_granted >= 0),

  created_at         timestamptz not null default now(),

  unique (provider, provider_reference)
);

comment on table public.payments is
  'What a user actually paid for. Their receipt history, and ours.';

create index if not exists payments_user_idx
  on public.payments (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
-- A user may read their own payment history and nothing else. Nobody writes
-- through a user session: entitlements change because the provider said so.

alter table public.billing_customers enable row level security;
alter table public.payment_events    enable row level security;
alter table public.payments          enable row level security;

revoke all on public.billing_customers from anon, authenticated;
revoke all on public.payment_events    from anon, authenticated;
revoke all on public.payments          from anon, authenticated;

grant select on public.payments to authenticated;

drop policy if exists "payments_select_own" on public.payments;
create policy "payments_select_own" on public.payments
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- No policies on billing_customers or payment_events: the tables are
-- server-side records, and a user has no reason to read either.

-- -----------------------------------------------------------------------------
-- record_payment_event
-- -----------------------------------------------------------------------------
-- Claims a delivery. Returns true when this call is the one that should act on
-- it; false when it has been seen before, which is the ordinary case for a
-- provider that retries.

create or replace function public.record_payment_event(
  p_provider text,
  p_event_id text,
  p_type     text,
  p_payload  jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inserted boolean := false;
begin
  insert into public.payment_events (provider, event_id, type, payload)
  values (p_provider, p_event_id, p_type, coalesce(p_payload, '{}'::jsonb))
  on conflict (provider, event_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

create or replace function public.complete_payment_event(
  p_provider text,
  p_event_id text,
  p_status   public.payment_event_status,
  p_error    text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.payment_events
  set status = p_status,
      error = p_error,
      processed_at = now()
  where provider = p_provider and event_id = p_event_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- apply_subscription_state
-- -----------------------------------------------------------------------------
-- The provider is the source of truth for what a user is subscribed to. This
-- makes our record match it, whatever it currently says.
--
-- Updating in place when the provider's subscription id is already known is
-- what makes a renewal a renewal rather than a new subscription every month.
-- The allowance grant underneath is keyed on the period, so a redelivered
-- invoice cannot pay a second month of credits.

create or replace function public.apply_subscription_state(
  p_user_id              uuid,
  p_plan_key             text,
  p_interval             public.billing_interval,
  p_status               public.subscription_status,
  p_period_start         timestamptz,
  p_period_end           timestamptz,
  p_cancel_at_period_end boolean default false,
  p_provider             text default 'stripe',
  p_customer_id          text default null,
  p_subscription_id      text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans%rowtype;
  v_sub  public.subscriptions%rowtype;
  v_now  timestamptz := now();
begin
  select * into v_plan from public.plans where key = p_plan_key and is_active;
  if not found then
    raise exception 'apply_subscription_state: unknown or inactive plan %', p_plan_key
      using errcode = 'P0002';
  end if;

  if p_subscription_id is not null then
    select * into v_sub
    from public.subscriptions
    where provider = p_provider and provider_subscription_id = p_subscription_id;
  end if;

  if found and v_sub.id is not null then
    update public.subscriptions
    set plan_id = v_plan.id,
        status = p_status,
        billing_interval = p_interval,
        current_period_start = coalesce(p_period_start, current_period_start),
        current_period_end = p_period_end,
        cancel_at_period_end = coalesce(p_cancel_at_period_end, false),
        canceled_at = case
          when p_status in ('canceled'::public.subscription_status,
                            'expired'::public.subscription_status)
          then coalesce(canceled_at, v_now)
          else null
        end,
        provider_customer_id = coalesce(p_customer_id, provider_customer_id)
    where id = v_sub.id;
  else
    -- No record of this provider subscription: close out whatever the user is
    -- on and start one, the same way an internal plan change would.
    update public.subscriptions
    set status = 'canceled'::public.subscription_status,
        canceled_at = v_now
    where user_id = p_user_id
      and status in ('trialing', 'active', 'past_due', 'paused');

    insert into public.subscriptions (
      user_id, plan_id, status, billing_interval,
      current_period_start, current_period_end, cancel_at_period_end,
      provider, provider_customer_id, provider_subscription_id
    )
    values (
      p_user_id, v_plan.id, p_status, p_interval,
      coalesce(p_period_start, v_now), p_period_end,
      coalesce(p_cancel_at_period_end, false),
      p_provider, p_customer_id, p_subscription_id
    )
    returning * into v_sub;
  end if;

  -- The wallet follows the plan, whichever branch ran.
  update public.credit_wallets
  set monthly_allowance = v_plan.monthly_credits,
      period_start = coalesce(p_period_start, v_now),
      period_end = p_period_end
  where user_id = p_user_id;

  -- Allowance is granted per period, and only while the subscription is one a
  -- user should be able to spend on. Keyed on the period start, so the same
  -- period can be delivered any number of times for one grant.
  if v_plan.monthly_credits > 0
     and p_status in ('trialing'::public.subscription_status,
                      'active'::public.subscription_status)
  then
    perform public.grant_credits(
      p_user_id => p_user_id,
      p_credits => v_plan.monthly_credits,
      p_type    => 'plan_grant'::public.credit_transaction_type,
      p_reason  => 'Plan allowance (' || v_plan.name || ')',
      p_idempotency_key =>
        'plan_grant:' || v_sub.id::text || ':' ||
        coalesce(p_period_start, v_now)::text,
      p_reference_type => 'subscription',
      p_reference_id => v_sub.id
    );
  end if;

  return v_sub.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- apply_credit_purchase
-- -----------------------------------------------------------------------------
-- A one-off pack. The payment row and the credit grant share the provider's
-- reference as their idempotency key, so a redelivered webhook records nothing
-- new and grants nothing twice.

create or replace function public.apply_credit_purchase(
  p_user_id            uuid,
  p_pack_key           text,
  p_provider           text default 'stripe',
  p_provider_reference text default null,
  p_amount_cents       integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pack public.credit_packs%rowtype;
  v_existing public.payments%rowtype;
  v_grant jsonb;
begin
  if p_provider_reference is null then
    raise exception 'apply_credit_purchase: a provider reference is required'
      using errcode = '22023';
  end if;

  select * into v_pack from public.credit_packs where key = p_pack_key and is_active;
  if not found then
    raise exception 'apply_credit_purchase: unknown or inactive pack %', p_pack_key
      using errcode = 'P0002';
  end if;

  select * into v_existing
  from public.payments
  where provider = p_provider and provider_reference = p_provider_reference;

  if found then
    return jsonb_build_object(
      'payment_id', v_existing.id,
      'credits', v_existing.credits_granted,
      'replayed', true
    );
  end if;

  v_grant := public.grant_credits(
    p_user_id => p_user_id,
    p_credits => v_pack.credits,
    p_type    => 'purchase'::public.credit_transaction_type,
    p_reason  => 'Credit pack (' || v_pack.name || ')',
    p_idempotency_key => 'pack:' || p_provider || ':' || p_provider_reference,
    p_reference_type => 'credit_pack',
    p_reference_id => v_pack.id
  );

  insert into public.payments (
    user_id, provider, provider_reference, kind, status,
    amount_cents, currency, description, credits_granted
  )
  values (
    p_user_id, p_provider, p_provider_reference,
    'credit_pack'::public.payment_kind, 'succeeded'::public.payment_status,
    coalesce(p_amount_cents, v_pack.price_cents), v_pack.currency,
    v_pack.name, v_pack.credits
  )
  returning * into v_existing;

  return jsonb_build_object(
    'payment_id', v_existing.id,
    'credits', v_pack.credits,
    'replayed', false,
    'grant', v_grant
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- record_invoice_payment
-- -----------------------------------------------------------------------------
-- A subscription invoice. Recorded for the user's receipt history; the credits
-- it entitles them to are granted by apply_subscription_state, not here.

create or replace function public.record_invoice_payment(
  p_user_id            uuid,
  p_provider           text,
  p_provider_reference text,
  p_amount_cents       integer,
  p_currency           text default 'USD',
  p_description        text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.payments (
    user_id, provider, provider_reference, kind, status,
    amount_cents, currency, description
  )
  values (
    p_user_id, p_provider, p_provider_reference,
    'subscription'::public.payment_kind, 'succeeded'::public.payment_status,
    greatest(coalesce(p_amount_cents, 0), 0), upper(coalesce(p_currency, 'USD')),
    p_description
  )
  on conflict (provider, provider_reference) do nothing
  returning id into v_id;

  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Execution rights
-- -----------------------------------------------------------------------------
-- None of these may be called from a user session. Entitlements change because
-- a signed webhook said so, and a user who could call them could buy nothing
-- and receive everything.

-- `public` is included because Postgres grants EXECUTE to it by default on a
-- new function: revoking only from anon and authenticated would leave the
-- inherited grant in place, and every one of these mints entitlements.
revoke execute on function public.record_payment_event(text, text, text, jsonb)
  from public, anon, authenticated;
revoke execute on function public.complete_payment_event(text, text, public.payment_event_status, text)
  from public, anon, authenticated;
revoke execute on function public.apply_subscription_state(
  uuid, text, public.billing_interval, public.subscription_status,
  timestamptz, timestamptz, boolean, text, text, text
) from public, anon, authenticated;
revoke execute on function public.apply_credit_purchase(uuid, text, text, text, integer)
  from public, anon, authenticated;
revoke execute on function public.record_invoice_payment(uuid, text, text, integer, text, text)
  from public, anon, authenticated;
