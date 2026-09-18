-- =============================================================================
-- WritePilot :: 0009 :: AI detection scans
-- -----------------------------------------------------------------------------
-- Phase 3 storage for the AI Detector.
--
-- A scan keeps the analysed text because the result is only meaningful next to
-- the passage it describes — a likelihood with no way to see which paragraphs
-- drove it is not something a user can act on. That makes these rows sensitive:
-- they hold unpublished academic and professional writing, so they are readable
-- only by their owner and deletable by them at any time.
-- =============================================================================

do $$ begin
  create type public.scan_source as enum ('text', 'pdf', 'docx', 'txt');
exception when duplicate_object then null; end $$;

-- How much weight the result deserves. Short or highly-edited passages carry
-- genuinely less signal, and the interface says so rather than implying every
-- percentage is equally trustworthy.
do $$ begin
  create type public.detection_confidence as enum ('low', 'medium', 'high');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- ai_scans
-- -----------------------------------------------------------------------------

create table if not exists public.ai_scans (
  id                    uuid primary key default extensions.gen_random_uuid(),
  user_id               uuid not null references public.profiles (id) on delete cascade,
  title                 text not null,
  source                public.scan_source not null default 'text',
  source_filename       text,
  -- The analysed text. Paragraph offsets in ai_scan_segments index into this.
  content               text not null,
  word_count            integer not null check (word_count >= 0),
  character_count       integer not null check (character_count >= 0),

  -- Estimated likelihood that the text was AI-generated, 0-100. Deliberately
  -- named "estimated" throughout: this is not a determination of authorship.
  estimated_ai_likelihood integer not null check (estimated_ai_likelihood between 0 and 100),
  confidence            public.detection_confidence not null default 'low',
  summary               text,
  -- Deterministic linguistic measurements computed server-side (sentence length
  -- variation, lexical diversity, repetition...). Stored so a result can be
  -- re-explained later without re-running the model.
  signals               jsonb not null default '{}'::jsonb,

  provider              text,
  model                 text,
  duration_ms           integer check (duration_ms is null or duration_ms >= 0),
  credits_charged       integer not null default 0 check (credits_charged >= 0),
  credit_transaction_id uuid references public.credit_transactions (id) on delete set null,

  created_at            timestamptz not null default now(),

  constraint ai_scans_title_length check (char_length(title) between 1 and 200)
);

comment on table public.ai_scans is
  'AI detection results. Holds the analysed text, so owner-only and deletable.';
comment on column public.ai_scans.estimated_ai_likelihood is
  'Estimate only. Never to be presented as proof of authorship.';

create index if not exists ai_scans_user_idx on public.ai_scans (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- ai_scan_segments
-- -----------------------------------------------------------------------------
-- Paragraph-level detail. Offsets are computed server-side by splitting the
-- stored content; the model is only ever asked to score a numbered paragraph,
-- never to report its own character positions. That keeps highlighting exact
-- instead of trusting a model to count characters.

create table if not exists public.ai_scan_segments (
  id            uuid primary key default extensions.gen_random_uuid(),
  scan_id       uuid not null references public.ai_scans (id) on delete cascade,
  position      integer not null check (position >= 0),
  start_offset  integer not null check (start_offset >= 0),
  end_offset    integer not null check (end_offset >= 0),
  estimated_ai_likelihood integer not null check (estimated_ai_likelihood between 0 and 100),
  rationale     text,

  constraint ai_scan_segments_offsets check (end_offset > start_offset),
  unique (scan_id, position)
);

comment on table public.ai_scan_segments is
  'Per-paragraph estimates. Offsets index into ai_scans.content.';

create index if not exists ai_scan_segments_scan_idx
  on public.ai_scan_segments (scan_id, position);

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
-- Same posture as every other table: readable by the owner, written only by
-- server-side code holding the service role. Deletion is the exception — a user
-- must be able to remove their own document text on demand.

alter table public.ai_scans         enable row level security;
alter table public.ai_scan_segments enable row level security;

revoke all on public.ai_scans         from anon, authenticated;
revoke all on public.ai_scan_segments from anon, authenticated;

grant select, delete on public.ai_scans         to authenticated;
grant select         on public.ai_scan_segments to authenticated;

drop policy if exists "ai_scans_select_own" on public.ai_scans;
create policy "ai_scans_select_own" on public.ai_scans
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "ai_scans_delete_own" on public.ai_scans;
create policy "ai_scans_delete_own" on public.ai_scans
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Segments inherit their parent's visibility. Deleting a scan cascades, so no
-- delete policy is needed here.
drop policy if exists "ai_scan_segments_select_own" on public.ai_scan_segments;
create policy "ai_scan_segments_select_own" on public.ai_scan_segments
  for select to authenticated
  using (
    exists (
      select 1 from public.ai_scans s
      where s.id = ai_scan_segments.scan_id
        and s.user_id = (select auth.uid())
    )
  );

-- Admins deliberately have no read policy here. Administering the platform does
-- not require reading customers' unpublished writing, and the privacy promise is
-- easier to keep when the access simply does not exist.
