-- =============================================================================
-- WritePilot :: 0015 :: Deep analysis and coaching
-- -----------------------------------------------------------------------------
-- Phase 9: the priority improvement system.
--
-- Every other tool answers one question about a draft. This one answers "what
-- should I do next", which is the question a person with one evening before a
-- deadline actually has. Its output is therefore a worked list rather than a
-- report: each improvement is a row a user ticks off, and the order is computed
-- from impact and effort by the server rather than taken from the model.
--
-- Improvements come from two places and say which: carried forward from checks
-- the user already paid for (measured), or judged by the model from the text
-- (advised). The same distinction the Citation Checker makes, for the same
-- reason.
-- =============================================================================

do $$ begin
  create type public.improvement_category as enum (
    'structure',
    'argument',
    'evidence',
    'clarity',
    'mechanics',
    'citations',
    'formatting'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.improvement_origin as enum ('measured', 'advised');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.improvement_status as enum ('open', 'done', 'dismissed');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- analysis_runs
-- -----------------------------------------------------------------------------

create table if not exists public.analysis_runs (
  id                    uuid primary key default extensions.gen_random_uuid(),
  user_id               uuid not null references public.profiles (id) on delete cascade,
  document_id           uuid references public.documents (id) on delete set null,
  -- The brief this was reviewed against, where there was one. A review that
  -- ignores what was asked for is a review of the wrong thing.
  assignment_id         uuid references public.assignments (id) on delete set null,

  title                 text not null,
  source                public.scan_source not null default 'text',
  source_filename       text,
  content               text not null,
  word_count            integer not null check (word_count >= 0),

  summary               text,
  -- What the review was told about the draft before it read it: which checks
  -- had been run and what they found. Kept so a run can be understood later.
  carried_from          jsonb not null default '{}'::jsonb,

  provider              text,
  model                 text,
  duration_ms           integer check (duration_ms is null or duration_ms >= 0),
  credits_charged       integer not null default 0 check (credits_charged >= 0),
  credit_transaction_id uuid references public.credit_transactions (id) on delete set null,

  created_at            timestamptz not null default now(),

  constraint analysis_runs_title_length check (char_length(title) between 1 and 200)
);

comment on table public.analysis_runs is
  'One full-document review, producing a prioritised list of improvements.';
comment on column public.analysis_runs.carried_from is
  'The prior results this review was given, so its advice can be read in context.';

create index if not exists analysis_runs_user_idx
  on public.analysis_runs (user_id, created_at desc);
create index if not exists analysis_runs_document_idx
  on public.analysis_runs (document_id) where document_id is not null;
create index if not exists analysis_runs_assignment_idx
  on public.analysis_runs (assignment_id) where assignment_id is not null;

-- -----------------------------------------------------------------------------
-- improvement_actions
-- -----------------------------------------------------------------------------

create table if not exists public.improvement_actions (
  id            uuid primary key default extensions.gen_random_uuid(),
  analysis_id   uuid not null references public.analysis_runs (id) on delete cascade,
  position      integer not null check (position >= 0),

  origin        public.improvement_origin not null,
  category      public.improvement_category not null,

  title         text not null,
  detail        text not null,
  -- Where in the draft, in the user's own words rather than an offset: a
  -- full-document review talks about sections, not character ranges.
  location      text,

  impact        integer not null check (impact between 1 and 5),
  effort        integer not null check (effort between 1 and 5),
  -- Computed by the server from impact and effort. Stored so the list can be
  -- ordered in the database and so a run's ordering is fixed once made.
  priority_score integer not null,

  status        public.improvement_status not null default 'open',
  resolved_at   timestamptz,

  -- Filled in on demand by the Writing Coach, which is priced separately.
  coaching      text,
  coached_at    timestamptz,

  unique (analysis_id, position),
  constraint improvement_actions_title_length check (
    char_length(title) between 1 and 300
  )
);

comment on table public.improvement_actions is
  'One improvement to make. origin says whether it was counted or judged.';
comment on column public.improvement_actions.priority_score is
  'Derived from impact and effort by the server, never supplied by a model.';
comment on column public.improvement_actions.coaching is
  'A Writing Coach explanation of this one improvement, bought separately.';

create index if not exists improvement_actions_analysis_idx
  on public.improvement_actions (analysis_id, priority_score desc, position);

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
-- A user works through their list, so `status` is theirs to move. Everything
-- else is the record of what the review said, including its ordering: an
-- improvement a user could re-score is an improvement list that means nothing.

alter table public.analysis_runs        enable row level security;
alter table public.improvement_actions  enable row level security;

revoke all on public.analysis_runs       from anon, authenticated;
revoke all on public.improvement_actions from anon, authenticated;

grant select, delete on public.analysis_runs       to authenticated;
grant select, update on public.improvement_actions to authenticated;

drop policy if exists "analysis_runs_select_own" on public.analysis_runs;
create policy "analysis_runs_select_own" on public.analysis_runs
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "analysis_runs_delete_own" on public.analysis_runs;
create policy "analysis_runs_delete_own" on public.analysis_runs
  for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "improvement_actions_select_own" on public.improvement_actions;
create policy "improvement_actions_select_own" on public.improvement_actions
  for select to authenticated
  using (
    exists (
      select 1 from public.analysis_runs r
      where r.id = improvement_actions.analysis_id and r.user_id = (select auth.uid())
    )
  );

drop policy if exists "improvement_actions_update_own" on public.improvement_actions;
create policy "improvement_actions_update_own" on public.improvement_actions
  for update to authenticated
  using (
    exists (
      select 1 from public.analysis_runs r
      where r.id = improvement_actions.analysis_id and r.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.analysis_runs r
      where r.id = improvement_actions.analysis_id and r.user_id = (select auth.uid())
    )
  );

-- -----------------------------------------------------------------------------
-- Column guard
-- -----------------------------------------------------------------------------
-- Status is the only column a user session may move. `coaching` is written by
-- the service role when the Writing Coach is bought for an action: a client
-- that could write it could put words in the coach's mouth, and a client that
-- could move `priority_score` could reorder the advice it was given.

create or replace function public.improvement_actions_guard_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;

  new.id := old.id;
  new.analysis_id := old.analysis_id;
  new.position := old.position;
  new.origin := old.origin;
  new.category := old.category;
  new.title := old.title;
  new.detail := old.detail;
  new.location := old.location;
  new.impact := old.impact;
  new.effort := old.effort;
  new.priority_score := old.priority_score;
  new.coaching := old.coaching;
  new.coached_at := old.coached_at;

  if new.status is distinct from old.status then
    new.resolved_at := case
      when new.status = 'open'::public.improvement_status then null
      else now()
    end;
  else
    new.resolved_at := old.resolved_at;
  end if;

  return new;
end;
$$;

drop trigger if exists improvement_actions_guard_columns on public.improvement_actions;
create trigger improvement_actions_guard_columns
  before update on public.improvement_actions
  for each row execute function public.improvement_actions_guard_columns();
