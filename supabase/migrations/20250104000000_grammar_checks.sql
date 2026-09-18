-- =============================================================================
-- WritePilot :: 0010 :: Grammar checks
-- -----------------------------------------------------------------------------
-- Phase 4 storage for the Grammar Checker.
--
-- Unlike a detection scan, a grammar check is worked on: the user accepts and
-- rejects individual suggestions, and expects those decisions to still be there
-- when they come back. That makes `status` the first column in the schema a
-- user session is genuinely allowed to write — guarded, below, so it is the
-- only one they can move.
-- =============================================================================

do $$ begin
  create type public.suggestion_category as enum (
    'grammar',
    'spelling',
    'punctuation',
    'structure',
    'tense',
    'word_choice',
    'clarity',
    'repetition',
    'wordiness'
  );
exception when duplicate_object then null; end $$;

-- How much the suggestion matters, not how confident we are. 'correction' is an
-- outright error; 'improvement' reads better; 'consideration' is a judgement
-- call the writer may reasonably decline.
do $$ begin
  create type public.suggestion_severity as enum (
    'correction',
    'improvement',
    'consideration'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.suggestion_status as enum ('pending', 'accepted', 'rejected');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- grammar_checks
-- -----------------------------------------------------------------------------

create table if not exists public.grammar_checks (
  id                    uuid primary key default extensions.gen_random_uuid(),
  user_id               uuid not null references public.profiles (id) on delete cascade,
  title                 text not null,
  source                public.scan_source not null default 'text',
  source_filename       text,
  -- The text as submitted. Suggestion offsets index into this, and it is never
  -- rewritten — the corrected version is derived by applying accepted
  -- suggestions, so the user can always get back to what they wrote.
  content               text not null,
  word_count            integer not null check (word_count >= 0),
  character_count       integer not null check (character_count >= 0),

  -- Deterministic readability measurements, computed server-side.
  readability           jsonb not null default '{}'::jsonb,
  summary               text,

  provider              text,
  model                 text,
  duration_ms           integer check (duration_ms is null or duration_ms >= 0),
  credits_charged       integer not null default 0 check (credits_charged >= 0),
  credit_transaction_id uuid references public.credit_transactions (id) on delete set null,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint grammar_checks_title_length check (char_length(title) between 1 and 200)
);

comment on table public.grammar_checks is
  'Grammar review of a submitted text. Owner-only; holds the original writing.';
comment on column public.grammar_checks.content is
  'Immutable original. The corrected text is derived, never stored over this.';

create index if not exists grammar_checks_user_idx
  on public.grammar_checks (user_id, created_at desc);

drop trigger if exists grammar_checks_set_updated_at on public.grammar_checks;
create trigger grammar_checks_set_updated_at
  before update on public.grammar_checks
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- grammar_suggestions
-- -----------------------------------------------------------------------------
-- Offsets are computed server-side by locating the quoted fragment inside the
-- sentence it was reported against. The model is never asked to count
-- characters — a suggestion whose fragment cannot be found verbatim is dropped
-- rather than applied at a guessed position.

create table if not exists public.grammar_suggestions (
  id             uuid primary key default extensions.gen_random_uuid(),
  check_id       uuid not null references public.grammar_checks (id) on delete cascade,
  position       integer not null check (position >= 0),
  start_offset   integer not null check (start_offset >= 0),
  end_offset     integer not null check (end_offset >= 0),
  category       public.suggestion_category not null,
  severity       public.suggestion_severity not null default 'improvement',
  -- The exact text being replaced, as it appears in content at these offsets.
  original_text  text not null,
  -- Empty string is legitimate: deleting a redundant word is a suggestion.
  suggested_text text not null,
  explanation    text,
  status         public.suggestion_status not null default 'pending',
  resolved_at    timestamptz,

  constraint grammar_suggestions_offsets check (end_offset > start_offset),
  unique (check_id, position)
);

comment on table public.grammar_suggestions is
  'Individual suggestions. Users may move `status` and nothing else.';

create index if not exists grammar_suggestions_check_idx
  on public.grammar_suggestions (check_id, start_offset);

-- -----------------------------------------------------------------------------
-- Column guard
-- -----------------------------------------------------------------------------
-- RLS decides which rows a user may update, never which columns. Accepting a
-- suggestion must not be a way to rewrite what was suggested — otherwise
-- "apply all" could be made to insert arbitrary text into the user's document.

create or replace function public.grammar_suggestions_guard_columns()
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
  new.check_id := old.check_id;
  new.position := old.position;
  new.start_offset := old.start_offset;
  new.end_offset := old.end_offset;
  new.category := old.category;
  new.severity := old.severity;
  new.original_text := old.original_text;
  new.suggested_text := old.suggested_text;
  new.explanation := old.explanation;

  -- Keep the timestamp honest without trusting the client to set it.
  if new.status is distinct from old.status then
    new.resolved_at := case
      when new.status = 'pending'::public.suggestion_status then null
      else now()
    end;
  else
    new.resolved_at := old.resolved_at;
  end if;

  return new;
end;
$$;

drop trigger if exists grammar_suggestions_guard_columns on public.grammar_suggestions;
create trigger grammar_suggestions_guard_columns
  before update on public.grammar_suggestions
  for each row execute function public.grammar_suggestions_guard_columns();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.grammar_checks      enable row level security;
alter table public.grammar_suggestions enable row level security;

revoke all on public.grammar_checks      from anon, authenticated;
revoke all on public.grammar_suggestions from anon, authenticated;

grant select, delete on public.grammar_checks      to authenticated;
grant select, update on public.grammar_suggestions to authenticated;

drop policy if exists "grammar_checks_select_own" on public.grammar_checks;
create policy "grammar_checks_select_own" on public.grammar_checks
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "grammar_checks_delete_own" on public.grammar_checks;
create policy "grammar_checks_delete_own" on public.grammar_checks
  for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "grammar_suggestions_select_own" on public.grammar_suggestions;
create policy "grammar_suggestions_select_own" on public.grammar_suggestions
  for select to authenticated
  using (
    exists (
      select 1 from public.grammar_checks c
      where c.id = grammar_suggestions.check_id
        and c.user_id = (select auth.uid())
    )
  );

-- Accepting or rejecting is the user's decision to make, on their own check.
drop policy if exists "grammar_suggestions_update_own" on public.grammar_suggestions;
create policy "grammar_suggestions_update_own" on public.grammar_suggestions
  for update to authenticated
  using (
    exists (
      select 1 from public.grammar_checks c
      where c.id = grammar_suggestions.check_id
        and c.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.grammar_checks c
      where c.id = grammar_suggestions.check_id
        and c.user_id = (select auth.uid())
    )
  );

-- As with detection scans, there is deliberately no admin read path over the
-- user's writing.
