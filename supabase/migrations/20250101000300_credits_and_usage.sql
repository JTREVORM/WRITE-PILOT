-- =============================================================================
-- WritePilot :: 0004 :: Credit ledger and usage tracking
-- -----------------------------------------------------------------------------
-- The wallet is a cached balance; credit_transactions is the append-only ledger
-- of record. Every balance change goes through a SECURITY DEFINER function that
-- writes both in one transaction, so the two can never drift.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- credit_wallets
-- -----------------------------------------------------------------------------

create table if not exists public.credit_wallets (
  user_id            uuid primary key references public.profiles (id) on delete cascade,
  -- Allowance from the current plan period. Expires at rollover unless the plan
  -- sets credits_roll_over.
  balance            integer not null default 0 check (balance >= 0),
  -- Purchased credits never expire; tracked separately so rollover can only
  -- ever reclaim the allowance portion.
  purchased_balance  integer not null default 0 check (purchased_balance >= 0),
  monthly_allowance  integer not null default 0 check (monthly_allowance >= 0),
  period_start       timestamptz not null default public.month_start(),
  period_end         timestamptz,
  lifetime_granted   integer not null default 0 check (lifetime_granted >= 0),
  lifetime_purchased integer not null default 0 check (lifetime_purchased >= 0),
  lifetime_consumed  integer not null default 0 check (lifetime_consumed >= 0),
  updated_at         timestamptz not null default now()
);

comment on table public.credit_wallets is
  'Cached credit balance per user. Only mutated by SECURITY DEFINER functions.';
comment on column public.credit_wallets.purchased_balance is
  'Credits bought outright. Spent only after the plan allowance is exhausted.';

drop trigger if exists credit_wallets_set_updated_at on public.credit_wallets;
create trigger credit_wallets_set_updated_at
  before update on public.credit_wallets
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- credit_transactions -- append-only ledger
-- -----------------------------------------------------------------------------

create table if not exists public.credit_transactions (
  id              uuid primary key default extensions.gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  type            public.credit_transaction_type not null,
  -- Signed: positive adds credits, negative spends them. Never zero.
  amount          integer not null check (amount <> 0),
  balance_after   integer not null check (balance_after >= 0),
  feature_key     text references public.features (key) on delete set null,
  reason          text,
  reference_type  text,
  reference_id    uuid,
  -- Lets a retried server action be replayed safely without double-charging.
  idempotency_key text,
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);

comment on table public.credit_transactions is
  'Append-only credit ledger. Never updated or deleted by application code.';

create index if not exists credit_transactions_user_idx
  on public.credit_transactions (user_id, created_at desc);
create index if not exists credit_transactions_feature_idx
  on public.credit_transactions (feature_key, created_at desc)
  where feature_key is not null;
create unique index if not exists credit_transactions_idempotency_idx
  on public.credit_transactions (user_id, idempotency_key)
  where idempotency_key is not null;

-- -----------------------------------------------------------------------------
-- usage_logs -- one row per attempted AI operation
-- -----------------------------------------------------------------------------
-- Drives cost analysis, pricing decisions, feature popularity and abuse
-- detection. Failures and rejections are recorded too, which is what makes the
-- table useful for reliability work.

create table if not exists public.usage_logs (
  id                    uuid primary key default extensions.gen_random_uuid(),
  user_id               uuid not null references public.profiles (id) on delete cascade,
  feature_key           text not null references public.features (key) on delete restrict,
  -- Snapshot of the plan at the time of use: plans get repriced, history should
  -- not silently change with them.
  plan_key              text,
  status                public.usage_status not null default 'success',
  credits_charged       integer not null default 0 check (credits_charged >= 0),
  words_processed       integer not null default 0 check (words_processed >= 0),
  characters_processed  integer not null default 0 check (characters_processed >= 0),
  duration_ms           integer check (duration_ms is null or duration_ms >= 0),
  provider              text,
  model                 text,
  error_code            text,
  error_message         text,
  reference_type        text,
  reference_id          uuid,
  metadata              jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now()
);

comment on table public.usage_logs is
  'Per-operation AI usage record, including failures and rejected attempts.';

create index if not exists usage_logs_user_idx on public.usage_logs (user_id, created_at desc);
create index if not exists usage_logs_feature_idx on public.usage_logs (feature_key, created_at desc);
create index if not exists usage_logs_status_idx on public.usage_logs (status, created_at desc)
  where status <> 'success';

-- -----------------------------------------------------------------------------
-- usage_counters -- pre-aggregated monthly totals
-- -----------------------------------------------------------------------------
-- Monthly plan limits are checked on every request. Aggregating usage_logs on
-- each check would not survive growth, so counters are maintained alongside.

create table if not exists public.usage_counters (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  feature_key  text not null references public.features (key) on delete cascade,
  period_start timestamptz not null,
  used_count   integer not null default 0 check (used_count >= 0),
  credits_used integer not null default 0 check (credits_used >= 0),
  words_used   integer not null default 0 check (words_used >= 0),
  updated_at   timestamptz not null default now(),
  primary key (user_id, feature_key, period_start)
);

comment on table public.usage_counters is
  'Monthly per-feature aggregates used to enforce plan limits cheaply.';

create index if not exists usage_counters_period_idx on public.usage_counters (period_start desc);

drop trigger if exists usage_counters_set_updated_at on public.usage_counters;
create trigger usage_counters_set_updated_at
  before update on public.usage_counters
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- notifications
-- -----------------------------------------------------------------------------

create table if not exists public.notifications (
  id         uuid primary key default extensions.gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       text not null default 'system',
  title      text not null,
  body       text,
  action_url text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

-- -----------------------------------------------------------------------------
-- audit_logs
-- -----------------------------------------------------------------------------
-- Security-relevant events: role changes, manual credit adjustments, plan
-- overrides, account deletions. Readable by admins only.

create table if not exists public.audit_logs (
  id          uuid primary key default extensions.gen_random_uuid(),
  actor_id    uuid references public.profiles (id) on delete set null,
  actor_role  public.app_role,
  action      text not null,
  entity_type text,
  entity_id   uuid,
  ip_address  inet,
  user_agent  text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
create index if not exists audit_logs_action_idx on public.audit_logs (action, created_at desc);
create index if not exists audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
