-- =============================================================================
-- WritePilot :: 0018 :: Rate limiting
-- -----------------------------------------------------------------------------
-- Phase 12: the limits that protect the platform rather than the plan.
--
-- Entitlements already stop a user spending credits they do not have. They do
-- not stop a user with credits from submitting forty requests a second, or an
-- attacker from trying ten thousand passwords against one email address, and
-- neither of those is a billing question.
--
-- The counter lives in Postgres rather than in memory because the application
-- runs as more than one instance: a limit each instance counts separately is
-- not a limit. A fixed window is used deliberately — it is one row and one
-- statement, and the failure mode (a user getting up to two windows' worth
-- across a boundary) is acceptable for limits set to protect a service rather
-- than to meter it.
-- =============================================================================

create table if not exists public.rate_limits (
  -- Scope and subject together: "signin:ada@example.com", "ai:<user id>".
  key          text not null,
  -- The window's own start, so a row is naturally unique per window and the
  -- increment is a single upsert.
  window_start timestamptz not null,
  count        integer not null default 0 check (count >= 0),
  updated_at   timestamptz not null default now(),

  primary key (key, window_start)
);

comment on table public.rate_limits is
  'Fixed-window request counters. Server-written only; never readable by a user.';

create index if not exists rate_limits_window_idx
  on public.rate_limits (window_start);

alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;
-- No policies at all: there is nothing here a user has any business reading,
-- and being told how close you are to a limit is itself useful to an attacker.

-- -----------------------------------------------------------------------------
-- check_rate_limit
-- -----------------------------------------------------------------------------
-- Counts one request against a key and says whether it is allowed. The count
-- happens either way: a refused request still consumed a connection, and not
-- counting refusals is how a limiter becomes free to hammer.

create or replace function public.check_rate_limit(
  p_key            text,
  p_limit          integer,
  p_window_seconds integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window integer := greatest(coalesce(p_window_seconds, 60), 1);
  v_limit  integer := greatest(coalesce(p_limit, 1), 1);
  v_start  timestamptz;
  v_count  integer;
begin
  if p_key is null or length(trim(p_key)) = 0 then
    raise exception 'check_rate_limit: a key is required' using errcode = '22023';
  end if;

  /*
   * Floor the clock to the window, so every caller in the same window shares
   * one row and the increment needs no read-modify-write.
   *
   * `clock_timestamp()`, not `now()`: `now()` is the transaction's start time
   * and does not advance inside one. A caller that holds a transaction open
   * across a window boundary would otherwise keep counting against the window
   * it started in — which is a slow request being quietly exempted from the
   * limit it was meant to be subject to.
   */
  v_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / v_window) * v_window
  );

  insert into public.rate_limits (key, window_start, count, updated_at)
  values (p_key, v_start, 1, now())
  on conflict (key, window_start) do update
    set count = public.rate_limits.count + 1,
        updated_at = now()
  returning count into v_count;

  return jsonb_build_object(
    'allowed', v_count <= v_limit,
    'count', v_count,
    'limit', v_limit,
    'remaining', greatest(v_limit - v_count, 0),
    'reset_at', v_start + (v_window || ' seconds')::interval
  );
end;
$$;

-- Windows are only interesting while they are current. Called by the same
-- scheduler that renews credit periods.
create or replace function public.prune_rate_limits(p_older_than_hours integer default 24)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.rate_limits
  where window_start < now() - ((greatest(coalesce(p_older_than_hours, 24), 1)) || ' hours')::interval;

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- A user who could call this could exhaust their own limit, or -- worse --
-- somebody else's, by passing a key that is not theirs.
revoke execute on function public.check_rate_limit(text, integer, integer)
  from public, anon, authenticated;
revoke execute on function public.prune_rate_limits(integer)
  from public, anon, authenticated;

-- =============================================================================
-- Indexes behind the foreign keys
-- -----------------------------------------------------------------------------
-- Postgres indexes the *referenced* side of a foreign key automatically and the
-- referencing side never. That is fine until the referenced row is deleted:
-- enforcing `on delete set null` or `cascade` then scans the whole child table,
-- once per child, inside the deleting transaction.
--
-- Each of these is a column a user's own action can trigger a scan of —
-- deleting a rubric, closing an account — so they are indexed. All but one are
-- partial, because the column is null for the majority of rows and an index of
-- nulls is a cost with no reader.

create index if not exists ai_scans_credit_tx_idx
  on public.ai_scans (credit_transaction_id) where credit_transaction_id is not null;
create index if not exists grammar_checks_credit_tx_idx
  on public.grammar_checks (credit_transaction_id) where credit_transaction_id is not null;
create index if not exists naturalize_runs_credit_tx_idx
  on public.naturalize_runs (credit_transaction_id) where credit_transaction_id is not null;
create index if not exists grades_credit_tx_idx
  on public.grades (credit_transaction_id) where credit_transaction_id is not null;
create index if not exists citation_checks_credit_tx_idx
  on public.citation_checks (credit_transaction_id) where credit_transaction_id is not null;
create index if not exists analysis_runs_credit_tx_idx
  on public.analysis_runs (credit_transaction_id) where credit_transaction_id is not null;

-- A user deleting a rubric detaches it from every assignment that named it.
create index if not exists assignments_rubric_idx
  on public.assignments (rubric_id) where rubric_id is not null;

-- ...and detaches every graded criterion that pointed at one of its criteria.
create index if not exists grade_criteria_rubric_criterion_idx
  on public.grade_criteria (rubric_criterion_id) where rubric_criterion_id is not null;

-- Read by feature on the admin dashboard as well as enforced on delete.
create index if not exists usage_counters_feature_idx
  on public.usage_counters (feature_key);

create index if not exists user_roles_granted_by_idx
  on public.user_roles (granted_by) where granted_by is not null;
