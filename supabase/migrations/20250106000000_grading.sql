-- =============================================================================
-- WritePilot :: 0012 :: Rubrics and grades
-- -----------------------------------------------------------------------------
-- Phase 6 storage for the AI Rubric Grader.
--
-- Rubrics are separate from grades, and reusable. A lecturer marks thirty
-- submissions against one rubric; a student checks four drafts against the same
-- brief. Extracting the criteria once and grading many times is both the
-- cheaper and the more honest model — the criteria a submission was judged
-- against are then demonstrably identical each time.
--
-- Every stored score is an estimate. The schema says so in its column names and
-- the interface says so on every screen; nothing here is an academic record.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- rubrics
-- -----------------------------------------------------------------------------

create table if not exists public.rubrics (
  id              uuid primary key default extensions.gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  title           text not null,
  source          public.scan_source not null default 'text',
  source_filename text,
  -- The rubric as supplied. Kept so the extraction can be re-read, and so a
  -- user can see what their criteria were derived from.
  raw_text        text not null,
  -- Summed from the criteria server-side, never taken from a model. Numeric to
  -- match rubric_criteria.max_points: a rubric of half marks must still total
  -- correctly.
  total_points    numeric(8, 2) not null default 0 check (total_points >= 0),
  notes           text,

  provider        text,
  model           text,
  credits_charged integer not null default 0 check (credits_charged >= 0),

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint rubrics_title_length check (char_length(title) between 1 and 200)
);

comment on table public.rubrics is
  'A marking rubric, extracted once and reusable across submissions.';

create index if not exists rubrics_user_idx on public.rubrics (user_id, created_at desc);

drop trigger if exists rubrics_set_updated_at on public.rubrics;
create trigger rubrics_set_updated_at
  before update on public.rubrics
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- rubric_criteria
-- -----------------------------------------------------------------------------

create table if not exists public.rubric_criteria (
  id          uuid primary key default extensions.gen_random_uuid(),
  rubric_id   uuid not null references public.rubrics (id) on delete cascade,
  position    integer not null check (position >= 0),
  name        text not null,
  description text,
  max_points  numeric(7, 2) not null check (max_points >= 0),

  unique (rubric_id, position),
  constraint rubric_criteria_name_length check (char_length(name) between 1 and 200)
);

comment on table public.rubric_criteria is
  'One marking criterion. max_points is numeric: half marks are common.';

create index if not exists rubric_criteria_rubric_idx
  on public.rubric_criteria (rubric_id, position);

-- -----------------------------------------------------------------------------
-- grades
-- -----------------------------------------------------------------------------

create table if not exists public.grades (
  id                    uuid primary key default extensions.gen_random_uuid(),
  user_id               uuid not null references public.profiles (id) on delete cascade,
  -- Kept on delete: a grade outlives the rubric it was produced against, and
  -- the criteria it was judged on are copied onto grade_criteria anyway.
  rubric_id             uuid references public.rubrics (id) on delete set null,
  rubric_title          text,

  title                 text not null,
  source                public.scan_source not null default 'text',
  source_filename       text,
  content               text not null,
  -- The brief, where the user supplied one. Grading context, not a second
  -- rubric.
  instructions          text,
  word_count            integer not null check (word_count >= 0),

  -- Summed from grade_criteria server-side. A model-supplied total is never
  -- trusted: the arithmetic is ours.
  estimated_points      numeric(8, 2) not null default 0 check (estimated_points >= 0),
  max_points            numeric(8, 2) not null default 0 check (max_points >= 0),

  summary               text,
  overall_strengths     jsonb not null default '[]'::jsonb,
  overall_improvements  jsonb not null default '[]'::jsonb,

  provider              text,
  model                 text,
  duration_ms           integer check (duration_ms is null or duration_ms >= 0),
  credits_charged       integer not null default 0 check (credits_charged >= 0),
  credit_transaction_id uuid references public.credit_transactions (id) on delete set null,

  created_at            timestamptz not null default now(),

  constraint grades_title_length check (char_length(title) between 1 and 200),
  constraint grades_points_within_max check (estimated_points <= max_points)
);

comment on table public.grades is
  'An AI-assisted estimated grade. Never an official academic grade.';
comment on column public.grades.estimated_points is
  'Summed from grade_criteria by the server. Estimate only.';

create index if not exists grades_user_idx on public.grades (user_id, created_at desc);
create index if not exists grades_rubric_idx on public.grades (rubric_id)
  where rubric_id is not null;

-- -----------------------------------------------------------------------------
-- grade_criteria
-- -----------------------------------------------------------------------------
-- The per-criterion breakdown. Criterion name and max are copied here rather
-- than joined, so a grade still reads correctly after the rubric is edited or
-- deleted — what the work was judged against at the time is the thing worth
-- keeping.

create table if not exists public.grade_criteria (
  id                uuid primary key default extensions.gen_random_uuid(),
  grade_id          uuid not null references public.grades (id) on delete cascade,
  rubric_criterion_id uuid references public.rubric_criteria (id) on delete set null,
  position          integer not null check (position >= 0),
  name              text not null,
  awarded_points    numeric(7, 2) not null check (awarded_points >= 0),
  max_points        numeric(7, 2) not null check (max_points >= 0),
  explanation       text,
  strengths         jsonb not null default '[]'::jsonb,
  weaknesses        jsonb not null default '[]'::jsonb,
  missing           jsonb not null default '[]'::jsonb,
  improvements      jsonb not null default '[]'::jsonb,

  unique (grade_id, position),
  constraint grade_criteria_within_max check (awarded_points <= max_points)
);

comment on table public.grade_criteria is
  'Per-criterion estimate, with the criterion snapshotted at grading time.';

create index if not exists grade_criteria_grade_idx
  on public.grade_criteria (grade_id, position);

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
-- Rubrics are editable by their owner: a user who disagrees with an extracted
-- criterion should be able to correct it rather than re-upload. Grades are not
-- editable — a grade a user could rewrite is not worth storing.

alter table public.rubrics         enable row level security;
alter table public.rubric_criteria enable row level security;
alter table public.grades          enable row level security;
alter table public.grade_criteria  enable row level security;

revoke all on public.rubrics         from anon, authenticated;
revoke all on public.rubric_criteria from anon, authenticated;
revoke all on public.grades          from anon, authenticated;
revoke all on public.grade_criteria  from anon, authenticated;

grant select, update, delete on public.rubrics         to authenticated;
grant select, update         on public.rubric_criteria to authenticated;
grant select, delete         on public.grades          to authenticated;
grant select                 on public.grade_criteria  to authenticated;

drop policy if exists "rubrics_select_own" on public.rubrics;
create policy "rubrics_select_own" on public.rubrics
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "rubrics_update_own" on public.rubrics;
create policy "rubrics_update_own" on public.rubrics
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "rubrics_delete_own" on public.rubrics;
create policy "rubrics_delete_own" on public.rubrics
  for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "rubric_criteria_select_own" on public.rubric_criteria;
create policy "rubric_criteria_select_own" on public.rubric_criteria
  for select to authenticated
  using (
    exists (
      select 1 from public.rubrics r
      where r.id = rubric_criteria.rubric_id and r.user_id = (select auth.uid())
    )
  );

drop policy if exists "rubric_criteria_update_own" on public.rubric_criteria;
create policy "rubric_criteria_update_own" on public.rubric_criteria
  for update to authenticated
  using (
    exists (
      select 1 from public.rubrics r
      where r.id = rubric_criteria.rubric_id and r.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.rubrics r
      where r.id = rubric_criteria.rubric_id and r.user_id = (select auth.uid())
    )
  );

drop policy if exists "grades_select_own" on public.grades;
create policy "grades_select_own" on public.grades
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "grades_delete_own" on public.grades;
create policy "grades_delete_own" on public.grades
  for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "grade_criteria_select_own" on public.grade_criteria;
create policy "grade_criteria_select_own" on public.grade_criteria
  for select to authenticated
  using (
    exists (
      select 1 from public.grades g
      where g.id = grade_criteria.grade_id and g.user_id = (select auth.uid())
    )
  );

-- -----------------------------------------------------------------------------
-- Column guard: editing a criterion must not rewrite the rubric's identity
-- -----------------------------------------------------------------------------
-- A user may correct a criterion's name, description and points. They may not
-- move it to another rubric, which would otherwise let a criterion be grafted
-- onto a rubric by changing one field.

create or replace function public.rubric_criteria_guard_columns()
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
  new.rubric_id := old.rubric_id;
  new.position := old.position;

  return new;
end;
$$;

drop trigger if exists rubric_criteria_guard_columns on public.rubric_criteria;
create trigger rubric_criteria_guard_columns
  before update on public.rubric_criteria
  for each row execute function public.rubric_criteria_guard_columns();

-- Keeps rubrics.total_points equal to the sum of its criteria, however the
-- criteria change. Deriving it in the database means no code path can leave the
-- header disagreeing with the breakdown beneath it.
create or replace function public.rubrics_resum_total()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rubric_id uuid := coalesce(new.rubric_id, old.rubric_id);
begin
  update public.rubrics
  set total_points = coalesce(
    (select sum(max_points) from public.rubric_criteria where rubric_id = v_rubric_id),
    0
  )
  where id = v_rubric_id;

  return null;
end;
$$;

drop trigger if exists rubric_criteria_resum on public.rubric_criteria;
create trigger rubric_criteria_resum
  after insert or update or delete on public.rubric_criteria
  for each row execute function public.rubrics_resum_total();

-- Users may edit a rubric's title and notes, not its derived total.
create or replace function public.rubrics_guard_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;

  -- Depth > 1 means this update came from another trigger rather than from a
  -- client statement: the only such writer is rubrics_resum_total(), whose
  -- whole job is to move total_points. Guarding it would leave the derived
  -- total permanently at zero for every user-owned rubric.
  if pg_catalog.pg_trigger_depth() > 1 then
    return new;
  end if;

  new.id := old.id;
  new.user_id := old.user_id;
  new.raw_text := old.raw_text;
  new.total_points := old.total_points;
  new.credits_charged := old.credits_charged;
  new.created_at := old.created_at;

  return new;
end;
$$;

drop trigger if exists rubrics_guard_columns on public.rubrics;
create trigger rubrics_guard_columns
  before update on public.rubrics
  for each row execute function public.rubrics_guard_columns();
