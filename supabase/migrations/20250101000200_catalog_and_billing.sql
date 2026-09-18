-- =============================================================================
-- WritePilot :: 0003 :: Product catalogue and billing
-- -----------------------------------------------------------------------------
-- Everything a product or ops person may need to change without a code release
-- is a row here: plans, prices, per-feature credit costs, per-plan limits and
-- credit packs. Application code reads this catalogue; it never hard-codes it.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- features -- the catalogue of billable capabilities
-- -----------------------------------------------------------------------------
-- Keyed by a stable text key rather than an enum so that a new feature can be
-- introduced (or repriced) with a data change instead of a type migration.

create table if not exists public.features (
  key              text primary key check (key ~ '^[a-z][a-z0-9_]{2,48}$'),
  name             text not null,
  description      text,
  category         text not null default 'general',
  -- Default credit cost. A plan may override it via plan_features.
  credit_cost      integer not null default 1 check (credit_cost >= 0),
  -- Rough guard rail used by the server before an AI call is dispatched.
  max_words        integer check (max_words is null or max_words > 0),
  is_active        boolean not null default true,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.features is
  'Billable capability catalogue. Credit costs are configuration, not code.';

drop trigger if exists features_set_updated_at on public.features;
create trigger features_set_updated_at
  before update on public.features
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- plans
-- -----------------------------------------------------------------------------

create table if not exists public.plans (
  id                     uuid primary key default extensions.gen_random_uuid(),
  key                    text not null unique check (key ~ '^[a-z][a-z0-9_]{1,32}$'),
  name                   text not null,
  tagline                text,
  description            text,
  currency               text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  -- Minor units (cents). Integers only -- never store money as float.
  price_monthly_cents    integer not null default 0 check (price_monthly_cents >= 0),
  price_yearly_cents     integer not null default 0 check (price_yearly_cents >= 0),
  -- Credits granted at the start of each billing period.
  monthly_credits        integer not null default 0 check (monthly_credits >= 0),
  -- NULL means "no limit" throughout this table.
  max_documents          integer check (max_documents is null or max_documents >= 0),
  max_file_size_mb       integer not null default 5 check (max_file_size_mb > 0),
  max_words_per_request  integer check (max_words_per_request is null or max_words_per_request > 0),
  max_document_versions  integer check (max_document_versions is null or max_document_versions > 0),
  -- Unused allowance rolls into the next period instead of expiring.
  credits_roll_over      boolean not null default false,
  priority_processing    boolean not null default false,
  is_public              boolean not null default true,
  is_active              boolean not null default true,
  is_highlighted         boolean not null default false,
  sort_order             integer not null default 0,
  -- Populated in Phase 10 when a payment provider is wired up.
  provider_price_id_monthly text,
  provider_price_id_yearly  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

comment on table public.plans is
  'Subscription tiers. Prices and limits are configuration, not code.';

create index if not exists plans_active_public_idx
  on public.plans (sort_order)
  where is_active and is_public;

drop trigger if exists plans_set_updated_at on public.plans;
create trigger plans_set_updated_at
  before update on public.plans
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- plan_features -- which plan may use which feature, and on what terms
-- -----------------------------------------------------------------------------

create table if not exists public.plan_features (
  plan_id             uuid not null references public.plans (id) on delete cascade,
  feature_key         text not null references public.features (key) on delete cascade,
  is_enabled          boolean not null default true,
  -- NULL => fall back to features.credit_cost
  credit_cost_override integer check (credit_cost_override is null or credit_cost_override >= 0),
  -- NULL => unlimited (still bounded by the credit balance)
  monthly_limit       integer check (monthly_limit is null or monthly_limit >= 0),
  max_words_override  integer check (max_words_override is null or max_words_override > 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  primary key (plan_id, feature_key)
);

comment on table public.plan_features is
  'Per-plan entitlement matrix: availability, credit cost and monthly caps.';

create index if not exists plan_features_feature_idx on public.plan_features (feature_key);

drop trigger if exists plan_features_set_updated_at on public.plan_features;
create trigger plan_features_set_updated_at
  before update on public.plan_features
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- subscriptions
-- -----------------------------------------------------------------------------

create table if not exists public.subscriptions (
  id                      uuid primary key default extensions.gen_random_uuid(),
  user_id                 uuid not null references public.profiles (id) on delete cascade,
  plan_id                 uuid not null references public.plans (id) on delete restrict,
  status                  public.subscription_status not null default 'active',
  billing_interval        public.billing_interval not null default 'month',
  current_period_start    timestamptz not null default now(),
  current_period_end      timestamptz,
  cancel_at_period_end    boolean not null default false,
  canceled_at             timestamptz,
  trial_ends_at           timestamptz,
  -- 'internal' until a payment provider is connected in Phase 10.
  provider                text not null default 'internal',
  provider_customer_id    text,
  provider_subscription_id text,
  metadata                jsonb not null default '{}'::jsonb,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint subscriptions_period_order
    check (current_period_end is null or current_period_end > current_period_start)
);

comment on table public.subscriptions is
  'A user''s plan assignment over time. Writable only by server-side code.';

-- A user may have at most one live subscription. Historical rows (canceled,
-- expired) are retained for reporting.
create unique index if not exists subscriptions_one_live_per_user_idx
  on public.subscriptions (user_id)
  where status in ('trialing', 'active', 'past_due', 'paused');

create index if not exists subscriptions_user_idx on public.subscriptions (user_id, created_at desc);
create index if not exists subscriptions_status_idx on public.subscriptions (status);
create index if not exists subscriptions_plan_idx on public.subscriptions (plan_id);
create unique index if not exists subscriptions_provider_sub_idx
  on public.subscriptions (provider, provider_subscription_id)
  where provider_subscription_id is not null;

drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- credit_packs -- one-off credit purchases (checkout arrives in Phase 10)
-- -----------------------------------------------------------------------------

create table if not exists public.credit_packs (
  id                uuid primary key default extensions.gen_random_uuid(),
  key               text not null unique check (key ~ '^[a-z][a-z0-9_]{1,32}$'),
  name              text not null,
  description       text,
  credits           integer not null check (credits > 0),
  price_cents       integer not null check (price_cents >= 0),
  currency          text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  is_active         boolean not null default true,
  sort_order        integer not null default 0,
  provider_price_id text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.credit_packs is
  'One-off credit bundles. Amounts and prices are configuration, not code.';

drop trigger if exists credit_packs_set_updated_at on public.credit_packs;
create trigger credit_packs_set_updated_at
  before update on public.credit_packs
  for each row execute function public.set_updated_at();
