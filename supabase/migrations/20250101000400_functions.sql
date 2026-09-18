-- =============================================================================
-- WritePilot :: 0005 :: Server-side domain functions
-- -----------------------------------------------------------------------------
-- Every mutation of money-adjacent state (credits, plans, usage) lives here as a
-- SECURITY DEFINER function with EXECUTE revoked from anon/authenticated. The
-- browser cannot call them; only server-side code holding the service role can.
-- This is what makes the "users cannot manipulate their own balance" guarantee
-- structural rather than a matter of hiding buttons.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Account provisioning
-- -----------------------------------------------------------------------------

create or replace function public.provision_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans%rowtype;
  v_period_start timestamptz := public.month_start();
begin
  -- Wallet first: entitlement checks assume it exists.
  insert into public.credit_wallets (user_id, period_start)
  values (p_user_id, v_period_start)
  on conflict (user_id) do nothing;

  insert into public.user_roles (user_id, role)
  values (p_user_id, 'user'::public.app_role)
  on conflict (user_id, role) do nothing;

  -- Put every new account on the default free plan. If the catalogue has not
  -- been seeded yet the account is still usable; it simply has no entitlements
  -- until a plan is assigned.
  select * into v_plan
  from public.plans
  where key = 'free' and is_active
  limit 1;

  if not found then
    return;
  end if;

  insert into public.subscriptions (
    user_id, plan_id, status, billing_interval,
    current_period_start, current_period_end
  )
  values (
    p_user_id, v_plan.id, 'active'::public.subscription_status, 'month'::public.billing_interval,
    v_period_start, v_period_start + interval '1 month'
  )
  on conflict do nothing;

  -- Seed the wallet with the plan allowance exactly once.
  if v_plan.monthly_credits > 0 then
    perform public.grant_credits(
      p_user_id       => p_user_id,
      p_credits       => v_plan.monthly_credits,
      p_type          => 'signup_grant'::public.credit_transaction_type,
      p_reason        => 'Welcome credits (' || v_plan.name || ')',
      p_idempotency_key => 'signup_grant:' || p_user_id::text
    );
  end if;

  update public.credit_wallets
  set monthly_allowance = v_plan.monthly_credits,
      period_start = v_period_start,
      period_end = v_period_start + interval '1 month'
  where user_id = p_user_id;
end;
$$;

comment on function public.provision_user is
  'Idempotently creates wallet, role, free subscription and welcome credits.';

-- Fired by Supabase Auth on signup. Keeps profile creation strict (the app is
-- unusable without it) but never lets the rest of provisioning break a signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_user_type public.user_type;
begin
  begin
    v_user_type := (v_meta ->> 'user_type')::public.user_type;
  exception when others then
    v_user_type := 'student'::public.user_type;
  end;

  insert into public.profiles (id, email, full_name, avatar_url, country, timezone, user_type, marketing_opt_in)
  values (
    new.id,
    new.email,
    nullif(trim(coalesce(v_meta ->> 'full_name', v_meta ->> 'name')), ''),
    nullif(trim(coalesce(v_meta ->> 'avatar_url', v_meta ->> 'picture')), ''),
    nullif(upper(trim(coalesce(v_meta ->> 'country', ''))), ''),
    coalesce(nullif(trim(v_meta ->> 'timezone'), ''), 'UTC'),
    coalesce(v_user_type, 'student'::public.user_type),
    coalesce((v_meta ->> 'marketing_opt_in')::boolean, false)
  )
  on conflict (id) do nothing;

  begin
    perform public.provision_user(new.id);
  exception when others then
    -- Provisioning is repaired lazily on next sign-in rather than blocking it.
    raise warning 'provision_user failed for %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep the profile email in step with a verified change in auth.users.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- -----------------------------------------------------------------------------
-- Credit ledger
-- -----------------------------------------------------------------------------

create or replace function public.grant_credits(
  p_user_id         uuid,
  p_credits         integer,
  p_type            public.credit_transaction_type default 'admin_adjustment',
  p_reason          text default null,
  p_idempotency_key text default null,
  p_reference_type  text default null,
  p_reference_id    uuid default null,
  p_metadata        jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.credit_transactions%rowtype;
  v_wallet   public.credit_wallets%rowtype;
  v_tx_id    uuid;
  v_purchased boolean := p_type = 'purchase'::public.credit_transaction_type;
begin
  if p_credits is null or p_credits <= 0 then
    raise exception 'grant_credits: amount must be positive (got %)', p_credits
      using errcode = '22023';
  end if;

  if p_idempotency_key is not null then
    select * into v_existing
    from public.credit_transactions
    where user_id = p_user_id and idempotency_key = p_idempotency_key;

    if found then
      return jsonb_build_object(
        'transaction_id', v_existing.id,
        'credited', 0,
        'balance', v_existing.balance_after,
        'replayed', true
      );
    end if;
  end if;

  -- Lock the wallet so concurrent grants/consumption cannot interleave.
  select * into v_wallet
  from public.credit_wallets
  where user_id = p_user_id
  for update;

  if not found then
    insert into public.credit_wallets (user_id) values (p_user_id)
    returning * into v_wallet;
  end if;

  update public.credit_wallets
  set balance            = case when v_purchased then balance else balance + p_credits end,
      purchased_balance  = case when v_purchased then purchased_balance + p_credits else purchased_balance end,
      lifetime_granted   = case when v_purchased then lifetime_granted else lifetime_granted + p_credits end,
      lifetime_purchased = case when v_purchased then lifetime_purchased + p_credits else lifetime_purchased end
  where user_id = p_user_id
  returning * into v_wallet;

  insert into public.credit_transactions (
    user_id, type, amount, balance_after, reason,
    reference_type, reference_id, idempotency_key, metadata
  )
  values (
    p_user_id, p_type, p_credits,
    v_wallet.balance + v_wallet.purchased_balance,
    p_reason, p_reference_type, p_reference_id, p_idempotency_key,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_tx_id;

  return jsonb_build_object(
    'transaction_id', v_tx_id,
    'credited', p_credits,
    'balance', v_wallet.balance + v_wallet.purchased_balance,
    'replayed', false
  );
end;
$$;

comment on function public.grant_credits is
  'Adds credits and writes the matching ledger row atomically. Idempotent when
   an idempotency key is supplied.';

create or replace function public.consume_credits(
  p_user_id         uuid,
  p_feature_key     text,
  p_credits         integer,
  p_reason          text default null,
  p_idempotency_key text default null,
  p_reference_type  text default null,
  p_reference_id    uuid default null,
  p_metadata        jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing   public.credit_transactions%rowtype;
  v_wallet     public.credit_wallets%rowtype;
  v_from_allowance integer;
  v_from_purchased integer;
  v_tx_id      uuid;
begin
  if p_credits is null or p_credits < 0 then
    raise exception 'consume_credits: amount must be non-negative (got %)', p_credits
      using errcode = '22023';
  end if;

  if p_idempotency_key is not null then
    select * into v_existing
    from public.credit_transactions
    where user_id = p_user_id and idempotency_key = p_idempotency_key;

    if found then
      return jsonb_build_object(
        'transaction_id', v_existing.id,
        'charged', 0,
        'balance', v_existing.balance_after,
        'replayed', true
      );
    end if;
  end if;

  select * into v_wallet
  from public.credit_wallets
  where user_id = p_user_id
  for update;

  if not found then
    raise exception 'consume_credits: no wallet for user %', p_user_id
      using errcode = 'P0002';
  end if;

  if p_credits = 0 then
    return jsonb_build_object(
      'transaction_id', null,
      'charged', 0,
      'balance', v_wallet.balance + v_wallet.purchased_balance,
      'replayed', false
    );
  end if;

  if (v_wallet.balance + v_wallet.purchased_balance) < p_credits then
    -- Caught by name in the application layer and surfaced as an upgrade prompt.
    raise exception 'insufficient_credits: need %, have %',
      p_credits, v_wallet.balance + v_wallet.purchased_balance
      using errcode = 'P0001', hint = 'insufficient_credits';
  end if;

  -- Spend the expiring plan allowance before the credits the user paid for.
  v_from_allowance := least(v_wallet.balance, p_credits);
  v_from_purchased := p_credits - v_from_allowance;

  update public.credit_wallets
  set balance           = balance - v_from_allowance,
      purchased_balance = purchased_balance - v_from_purchased,
      lifetime_consumed = lifetime_consumed + p_credits
  where user_id = p_user_id
  returning * into v_wallet;

  insert into public.credit_transactions (
    user_id, type, amount, balance_after, feature_key, reason,
    reference_type, reference_id, idempotency_key, metadata
  )
  values (
    p_user_id, 'consumption'::public.credit_transaction_type, -p_credits,
    v_wallet.balance + v_wallet.purchased_balance,
    p_feature_key, p_reason, p_reference_type, p_reference_id, p_idempotency_key,
    coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object('from_allowance', v_from_allowance, 'from_purchased', v_from_purchased)
  )
  returning id into v_tx_id;

  return jsonb_build_object(
    'transaction_id', v_tx_id,
    'charged', p_credits,
    'balance', v_wallet.balance + v_wallet.purchased_balance,
    'replayed', false
  );
end;
$$;

comment on function public.consume_credits is
  'Debits credits under a row lock. Raises insufficient_credits when short.';

create or replace function public.refund_credits(
  p_user_id        uuid,
  p_transaction_id uuid,
  p_reason         text default 'Refund for failed operation'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tx     public.credit_transactions%rowtype;
  v_wallet public.credit_wallets%rowtype;
  v_new_tx uuid;
  v_amount integer;
begin
  select * into v_tx
  from public.credit_transactions
  where id = p_transaction_id and user_id = p_user_id;

  if not found then
    raise exception 'refund_credits: transaction % not found for user %',
      p_transaction_id, p_user_id using errcode = 'P0002';
  end if;

  if v_tx.type <> 'consumption'::public.credit_transaction_type then
    raise exception 'refund_credits: transaction % is not a consumption', p_transaction_id
      using errcode = '22023';
  end if;

  -- One refund per consumption, enforced by the idempotency index.
  if exists (
    select 1 from public.credit_transactions
    where user_id = p_user_id
      and idempotency_key = 'refund:' || p_transaction_id::text
  ) then
    return jsonb_build_object('refunded', 0, 'replayed', true);
  end if;

  v_amount := abs(v_tx.amount);

  select * into v_wallet from public.credit_wallets where user_id = p_user_id for update;

  update public.credit_wallets
  set balance = balance + v_amount,
      lifetime_consumed = greatest(0, lifetime_consumed - v_amount)
  where user_id = p_user_id
  returning * into v_wallet;

  insert into public.credit_transactions (
    user_id, type, amount, balance_after, feature_key, reason,
    reference_type, reference_id, idempotency_key
  )
  values (
    p_user_id, 'refund'::public.credit_transaction_type, v_amount,
    v_wallet.balance + v_wallet.purchased_balance,
    v_tx.feature_key, p_reason, 'credit_transaction', p_transaction_id,
    'refund:' || p_transaction_id::text
  )
  returning id into v_new_tx;

  return jsonb_build_object(
    'transaction_id', v_new_tx,
    'refunded', v_amount,
    'balance', v_wallet.balance + v_wallet.purchased_balance,
    'replayed', false
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Usage tracking
-- -----------------------------------------------------------------------------

create or replace function public.log_feature_usage(
  p_user_id       uuid,
  p_feature_key   text,
  p_status        public.usage_status default 'success',
  p_credits       integer default 0,
  p_words         integer default 0,
  p_characters    integer default 0,
  p_duration_ms   integer default null,
  p_provider      text default null,
  p_model         text default null,
  p_error_code    text default null,
  p_error_message text default null,
  p_reference_type text default null,
  p_reference_id  uuid default null,
  p_metadata      jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_log_id   uuid;
  v_plan_key text;
  v_period   timestamptz := public.month_start();
begin
  select p.key into v_plan_key
  from public.subscriptions s
  join public.plans p on p.id = s.plan_id
  where s.user_id = p_user_id
    and s.status in ('trialing', 'active', 'past_due', 'paused')
  limit 1;

  insert into public.usage_logs (
    user_id, feature_key, plan_key, status, credits_charged,
    words_processed, characters_processed, duration_ms, provider, model,
    error_code, error_message, reference_type, reference_id, metadata
  )
  values (
    p_user_id, p_feature_key, v_plan_key, p_status, greatest(coalesce(p_credits, 0), 0),
    greatest(coalesce(p_words, 0), 0), greatest(coalesce(p_characters, 0), 0),
    p_duration_ms, p_provider, p_model,
    p_error_code, p_error_message, p_reference_type, p_reference_id,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into v_log_id;

  -- Only successful work counts against a monthly allowance.
  if p_status = 'success'::public.usage_status then
    insert into public.usage_counters (user_id, feature_key, period_start, used_count, credits_used, words_used)
    values (p_user_id, p_feature_key, v_period, 1, greatest(coalesce(p_credits, 0), 0), greatest(coalesce(p_words, 0), 0))
    on conflict (user_id, feature_key, period_start) do update
      set used_count   = public.usage_counters.used_count + 1,
          credits_used = public.usage_counters.credits_used + greatest(coalesce(p_credits, 0), 0),
          words_used   = public.usage_counters.words_used + greatest(coalesce(p_words, 0), 0);
  end if;

  return v_log_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Entitlements
-- -----------------------------------------------------------------------------
-- A single authoritative answer to "what may this user do right now", assembled
-- in one round trip. Every feature route reads this rather than re-deriving the
-- rules locally.

create or replace function public.get_entitlements(p_user_id uuid default auth.uid())
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_plan   public.plans%rowtype;
  v_sub    public.subscriptions%rowtype;
  v_wallet public.credit_wallets%rowtype;
  v_period timestamptz := public.month_start();
  v_features jsonb;
begin
  if p_user_id is null then
    raise exception 'get_entitlements: user id is required' using errcode = '22023';
  end if;

  -- Callable by the owning user or an admin; the service role bypasses both.
  if auth.role() <> 'service_role'
     and p_user_id <> v_caller
     and not public.is_admin(v_caller) then
    raise exception 'get_entitlements: not authorised' using errcode = '42501';
  end if;

  select * into v_sub
  from public.subscriptions
  where user_id = p_user_id
    and status in ('trialing', 'active', 'past_due', 'paused')
  limit 1;

  if found then
    select * into v_plan from public.plans where id = v_sub.plan_id;
  else
    select * into v_plan from public.plans where key = 'free' and is_active limit 1;
  end if;

  select * into v_wallet from public.credit_wallets where user_id = p_user_id;

  select coalesce(
    jsonb_object_agg(
      f.key,
      jsonb_build_object(
        'key', f.key,
        'name', f.name,
        'category', f.category,
        'enabled', coalesce(pf.is_enabled, false) and f.is_active,
        'credit_cost', coalesce(pf.credit_cost_override, f.credit_cost),
        'max_words', coalesce(pf.max_words_override, f.max_words, v_plan.max_words_per_request),
        'monthly_limit', pf.monthly_limit,
        'used_this_period', coalesce(uc.used_count, 0),
        'remaining_this_period',
          case when pf.monthly_limit is null then null
               else greatest(0, pf.monthly_limit - coalesce(uc.used_count, 0)) end
      )
    ),
    '{}'::jsonb
  )
  into v_features
  from public.features f
  left join public.plan_features pf
    on pf.feature_key = f.key and pf.plan_id = v_plan.id
  left join public.usage_counters uc
    on uc.user_id = p_user_id and uc.feature_key = f.key and uc.period_start = v_period
  where f.is_active;

  return jsonb_build_object(
    'user_id', p_user_id,
    'plan', case when v_plan.id is null then null else jsonb_build_object(
      'id', v_plan.id,
      'key', v_plan.key,
      'name', v_plan.name,
      'max_documents', v_plan.max_documents,
      'max_file_size_mb', v_plan.max_file_size_mb,
      'max_words_per_request', v_plan.max_words_per_request,
      'max_document_versions', v_plan.max_document_versions,
      'priority_processing', v_plan.priority_processing,
      'monthly_credits', v_plan.monthly_credits
    ) end,
    'subscription', case when v_sub.id is null then null else jsonb_build_object(
      'id', v_sub.id,
      'status', v_sub.status,
      'billing_interval', v_sub.billing_interval,
      'current_period_end', v_sub.current_period_end,
      'cancel_at_period_end', v_sub.cancel_at_period_end,
      'trial_ends_at', v_sub.trial_ends_at
    ) end,
    'credits', jsonb_build_object(
      'balance', coalesce(v_wallet.balance, 0) + coalesce(v_wallet.purchased_balance, 0),
      'allowance_balance', coalesce(v_wallet.balance, 0),
      'purchased_balance', coalesce(v_wallet.purchased_balance, 0),
      'monthly_allowance', coalesce(v_wallet.monthly_allowance, 0),
      'period_start', v_wallet.period_start,
      'period_end', v_wallet.period_end,
      'lifetime_consumed', coalesce(v_wallet.lifetime_consumed, 0)
    ),
    'features', v_features,
    'roles', coalesce((
      select jsonb_agg(ur.role order by ur.role)
      from public.user_roles ur where ur.user_id = p_user_id
    ), '[]'::jsonb),
    'period_start', v_period
  );
end;
$$;

comment on function public.get_entitlements is
  'Single source of truth for plan, credits, roles and per-feature limits.';

-- -----------------------------------------------------------------------------
-- Plan assignment and period rollover
-- -----------------------------------------------------------------------------

create or replace function public.assign_plan(
  p_user_id  uuid,
  p_plan_key text,
  p_interval public.billing_interval default 'month',
  p_status   public.subscription_status default 'active',
  p_period_end timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans%rowtype;
  v_sub_id uuid;
  v_now timestamptz := now();
  v_end timestamptz;
begin
  select * into v_plan from public.plans where key = p_plan_key and is_active;
  if not found then
    raise exception 'assign_plan: unknown or inactive plan %', p_plan_key using errcode = 'P0002';
  end if;

  v_end := coalesce(
    p_period_end,
    v_now + case when p_interval = 'year'::public.billing_interval
                 then interval '1 year' else interval '1 month' end
  );

  -- Close out whatever the user is on today; history is preserved.
  update public.subscriptions
  set status = 'canceled'::public.subscription_status,
      canceled_at = v_now
  where user_id = p_user_id
    and status in ('trialing', 'active', 'past_due', 'paused');

  insert into public.subscriptions (
    user_id, plan_id, status, billing_interval,
    current_period_start, current_period_end
  )
  values (p_user_id, v_plan.id, p_status, p_interval, v_now, v_end)
  returning id into v_sub_id;

  update public.credit_wallets
  set monthly_allowance = v_plan.monthly_credits,
      period_start = v_now,
      period_end = v_end
  where user_id = p_user_id;

  if v_plan.monthly_credits > 0 then
    perform public.grant_credits(
      p_user_id => p_user_id,
      p_credits => v_plan.monthly_credits,
      p_type    => 'plan_grant'::public.credit_transaction_type,
      p_reason  => 'Plan allowance (' || v_plan.name || ')',
      p_idempotency_key => 'plan_grant:' || v_sub_id::text || ':' || v_now::text,
      p_reference_type => 'subscription',
      p_reference_id => v_sub_id
    );
  end if;

  return v_sub_id;
end;
$$;

-- Invoked by a scheduled job (pg_cron or an external scheduler). Expires the
-- unused allowance unless the plan rolls over, then grants the new period's.
create or replace function public.renew_credit_period(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan   public.plans%rowtype;
  v_sub    public.subscriptions%rowtype;
  v_wallet public.credit_wallets%rowtype;
  v_now    timestamptz := now();
  v_end    timestamptz;
  v_expired integer := 0;
begin
  select * into v_sub
  from public.subscriptions
  where user_id = p_user_id and status in ('trialing', 'active', 'past_due')
  limit 1;

  if not found then
    return jsonb_build_object('renewed', false, 'reason', 'no_active_subscription');
  end if;

  select * into v_plan from public.plans where id = v_sub.plan_id;
  select * into v_wallet from public.credit_wallets where user_id = p_user_id for update;

  if v_wallet.period_end is not null and v_wallet.period_end > v_now then
    return jsonb_build_object('renewed', false, 'reason', 'period_not_elapsed');
  end if;

  if not v_plan.credits_roll_over and v_wallet.balance > 0 then
    v_expired := v_wallet.balance;

    update public.credit_wallets set balance = 0 where user_id = p_user_id
    returning * into v_wallet;

    insert into public.credit_transactions (user_id, type, amount, balance_after, reason)
    values (
      p_user_id, 'expiry'::public.credit_transaction_type, -v_expired,
      v_wallet.balance + v_wallet.purchased_balance,
      'Unused allowance expired at period rollover'
    );
  end if;

  v_end := v_now + case when v_sub.billing_interval = 'year'::public.billing_interval
                        then interval '1 year' else interval '1 month' end;

  update public.credit_wallets
  set monthly_allowance = v_plan.monthly_credits,
      period_start = v_now,
      period_end = v_end
  where user_id = p_user_id;

  if v_plan.monthly_credits > 0 then
    perform public.grant_credits(
      p_user_id => p_user_id,
      p_credits => v_plan.monthly_credits,
      p_type    => 'plan_grant'::public.credit_transaction_type,
      p_reason  => 'Monthly allowance (' || v_plan.name || ')',
      p_idempotency_key => 'plan_grant:' || v_sub.id::text || ':' || public.month_start(v_now)::text,
      p_reference_type => 'subscription',
      p_reference_id => v_sub.id
    );
  end if;

  return jsonb_build_object('renewed', true, 'expired', v_expired, 'granted', v_plan.monthly_credits);
end;
$$;

-- -----------------------------------------------------------------------------
-- Execution grants
-- -----------------------------------------------------------------------------
-- Postgres grants EXECUTE to PUBLIC by default, so every mutating function is
-- explicitly revoked. Only get_entitlements is reachable from a user session,
-- and it authorises the caller internally.

revoke execute on function public.provision_user(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.handle_user_email_change() from public, anon, authenticated;
revoke execute on function public.grant_credits(uuid, integer, public.credit_transaction_type, text, text, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.consume_credits(uuid, text, integer, text, text, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.refund_credits(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.log_feature_usage(uuid, text, public.usage_status, integer, integer, integer, integer, text, text, text, text, text, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.assign_plan(uuid, text, public.billing_interval, public.subscription_status, timestamptz) from public, anon, authenticated;
revoke execute on function public.renew_credit_period(uuid) from public, anon, authenticated;

grant execute on function public.get_entitlements(uuid) to authenticated;
