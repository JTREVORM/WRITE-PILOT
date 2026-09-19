-- =============================================================================
-- WritePilot :: 0011 :: Naturalize runs
-- -----------------------------------------------------------------------------
-- Phase 5 storage for Naturalize.
--
-- A run keeps both versions: the text as submitted and the improved text, side
-- by side and paragraph by paragraph. The original is never replaced, because
-- the entire promise of this tool is that the writer stays in control of which
-- version they keep.
--
-- It also stores the integrity findings computed at run time — terminology,
-- numbers and citations that appear in the original but not in the rewrite.
-- A tool that quietly drops a citation while "improving flow" is worse than no
-- tool, so those findings are part of the result rather than a hidden check.
-- =============================================================================

do $$ begin
  create type public.naturalize_mode as enum (
    'natural',
    'academic',
    'professional',
    'formal',
    'simple',
    'conversational',
    'concise'
  );
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- naturalize_runs
-- -----------------------------------------------------------------------------

create table if not exists public.naturalize_runs (
  id                    uuid primary key default extensions.gen_random_uuid(),
  user_id               uuid not null references public.profiles (id) on delete cascade,
  title                 text not null,
  source                public.scan_source not null default 'text',
  source_filename       text,
  mode                  public.naturalize_mode not null default 'natural',

  -- Both versions, kept whole. Paragraph offsets in naturalize_paragraphs index
  -- into these.
  content               text not null,
  improved              text not null,

  word_count            integer not null check (word_count >= 0),
  improved_word_count   integer not null default 0 check (improved_word_count >= 0),
  character_count       integer not null check (character_count >= 0),

  summary               text,
  -- Readability before and after, so the user can see whether the rewrite
  -- actually did what the mode promised.
  readability_before    jsonb not null default '{}'::jsonb,
  readability_after     jsonb not null default '{}'::jsonb,
  -- Terminology, numbers or citations present in the original and missing from
  -- the rewrite. Empty is the expected case.
  integrity_findings    jsonb not null default '[]'::jsonb,

  provider              text,
  model                 text,
  duration_ms           integer check (duration_ms is null or duration_ms >= 0),
  credits_charged       integer not null default 0 check (credits_charged >= 0),
  credit_transaction_id uuid references public.credit_transactions (id) on delete set null,

  created_at            timestamptz not null default now(),

  constraint naturalize_runs_title_length check (char_length(title) between 1 and 200)
);

comment on table public.naturalize_runs is
  'A Naturalize rewrite. Keeps both versions; the original is never replaced.';
comment on column public.naturalize_runs.integrity_findings is
  'Terminology/numbers/citations lost in the rewrite. Shown to the user.';

create index if not exists naturalize_runs_user_idx
  on public.naturalize_runs (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- naturalize_paragraphs
-- -----------------------------------------------------------------------------
-- Paragraph-by-paragraph pairing, which is what makes a comparison readable.
-- The model rewrites numbered paragraphs and never merges, splits or reorders
-- them, so a pair always lines up with what the writer actually wrote.

create table if not exists public.naturalize_paragraphs (
  id            uuid primary key default extensions.gen_random_uuid(),
  run_id        uuid not null references public.naturalize_runs (id) on delete cascade,
  position      integer not null check (position >= 0),
  original_text text not null,
  improved_text text not null,
  -- A short note on what changed, where the change is worth explaining.
  note          text,
  -- False when the model returned the paragraph unchanged, which is a valid and
  -- often correct outcome.
  changed       boolean not null default true,

  unique (run_id, position)
);

comment on table public.naturalize_paragraphs is
  'Original/improved pairs, one per paragraph, in document order.';

create index if not exists naturalize_paragraphs_run_idx
  on public.naturalize_paragraphs (run_id, position);

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
-- Same posture as scans and grammar checks: the owner reads and deletes, the
-- service role writes, and there is no admin read path over the user's writing.

alter table public.naturalize_runs       enable row level security;
alter table public.naturalize_paragraphs enable row level security;

revoke all on public.naturalize_runs       from anon, authenticated;
revoke all on public.naturalize_paragraphs from anon, authenticated;

grant select, delete on public.naturalize_runs       to authenticated;
grant select         on public.naturalize_paragraphs to authenticated;

drop policy if exists "naturalize_runs_select_own" on public.naturalize_runs;
create policy "naturalize_runs_select_own" on public.naturalize_runs
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "naturalize_runs_delete_own" on public.naturalize_runs;
create policy "naturalize_runs_delete_own" on public.naturalize_runs
  for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "naturalize_paragraphs_select_own" on public.naturalize_paragraphs;
create policy "naturalize_paragraphs_select_own" on public.naturalize_paragraphs
  for select to authenticated
  using (
    exists (
      select 1 from public.naturalize_runs r
      where r.id = naturalize_paragraphs.run_id
        and r.user_id = (select auth.uid())
    )
  );
