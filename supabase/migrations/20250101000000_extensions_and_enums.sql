-- =============================================================================
-- WritePilot :: 0001 :: Extensions, enums and shared helpers
-- -----------------------------------------------------------------------------
-- Foundational objects every later migration depends on. Kept deliberately
-- small so it can be reasoned about (and re-read) in isolation.
-- =============================================================================

create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "citext" with schema extensions;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
-- Enums are used only for values that are part of the domain model itself and
-- therefore change with a code release. Anything a product/ops person should be
-- able to tune at runtime (plans, prices, credit costs, limits) lives in a
-- table instead -- see 0003/0005.

do $$ begin
  create type public.app_role as enum ('user', 'educator', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.user_type as enum (
    'student',
    'researcher',
    'educator',
    'professional',
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.subscription_status as enum (
    'trialing',
    'active',
    'past_due',
    'paused',
    'canceled',
    'incomplete',
    'expired'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.billing_interval as enum ('month', 'year');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.credit_transaction_type as enum (
    'signup_grant',      -- initial allowance on account creation
    'plan_grant',        -- monthly allowance from an active plan
    'purchase',          -- one-off credit pack
    'consumption',       -- spent on an AI feature
    'refund',            -- returned after a failed AI operation
    'expiry',            -- unused allowance removed at period rollover
    'admin_adjustment'   -- manual correction by an administrator
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.usage_status as enum ('success', 'failure', 'rejected');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- Shared trigger helpers
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

comment on function public.set_updated_at is
  'Generic BEFORE UPDATE trigger that maintains an updated_at column.';

-- Truncates a timestamp to the first instant of its UTC month. Used as the
-- bucket key for monthly usage counters and credit periods.
create or replace function public.month_start(p_at timestamptz default now())
returns timestamptz
language sql
immutable
as $$
  select date_trunc('month', p_at at time zone 'utc') at time zone 'utc';
$$;
