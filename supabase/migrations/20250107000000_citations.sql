-- =============================================================================
-- WritePilot :: 0013 :: Citation checks
-- -----------------------------------------------------------------------------
-- Phase 7 storage for the Citation Checker.
--
-- A check holds three things: the document, the reference list as it was
-- parsed, and the findings. The findings carry their own origin, because half
-- of them are arithmetic — this source is cited and not listed — and half are a
-- model's reading of a style manual. A user is entitled to know which is which,
-- so the distinction is stored rather than reconstructed in the interface.
--
-- Nothing here records that a source was verified. The tool reads the text it
-- was given and never leaves it.
-- =============================================================================

do $$ begin
  create type public.citation_style as enum ('apa7', 'mla9', 'chicago', 'harvard');
exception when duplicate_object then null; end $$;

do $$ begin
  -- Which half of the check produced a finding. 'local' is exact comparison
  -- performed here; 'model' is an assessment against the style's rules.
  create type public.citation_finding_origin as enum ('local', 'model');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.citation_severity as enum ('error', 'warning', 'info');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.citation_finding_status as enum ('open', 'resolved', 'dismissed');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- citation_checks
-- -----------------------------------------------------------------------------

create table if not exists public.citation_checks (
  id                    uuid primary key default extensions.gen_random_uuid(),
  user_id               uuid not null references public.profiles (id) on delete cascade,

  title                 text not null,
  source                public.scan_source not null default 'text',
  source_filename       text,
  content               text not null,
  style                 public.citation_style not null,
  -- What the document looks like it actually follows, as read by the model.
  -- Kept separate from `style`, which is what the user asked to be checked
  -- against: the disagreement between the two is itself a finding.
  detected_style        text,

  word_count            integer not null check (word_count >= 0),
  -- The heading the reference list was found under, as written. Null means no
  -- list was found at all, which is a different thing from an empty one.
  list_heading          text,

  in_text_count         integer not null default 0 check (in_text_count >= 0),
  distinct_sources      integer not null default 0 check (distinct_sources >= 0),
  reference_count       integer not null default 0 check (reference_count >= 0),

  summary               text,

  provider              text,
  model                 text,
  duration_ms           integer check (duration_ms is null or duration_ms >= 0),
  credits_charged       integer not null default 0 check (credits_charged >= 0),
  credit_transaction_id uuid references public.credit_transactions (id) on delete set null,

  created_at            timestamptz not null default now(),

  constraint citation_checks_title_length check (char_length(title) between 1 and 200)
);

comment on table public.citation_checks is
  'One run of the Citation Checker over a document.';
comment on column public.citation_checks.detected_style is
  'The style the document appears to follow. Never assumed to be the requested one.';

create index if not exists citation_checks_user_idx
  on public.citation_checks (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- citation_entries
-- -----------------------------------------------------------------------------
-- The reference list as parsed. Stored as its own rows rather than as text so
-- the interface can show the list with each entry's findings against it, and so
-- "cited in the text" is a column rather than a recomputation.

create table if not exists public.citation_entries (
  id         uuid primary key default extensions.gen_random_uuid(),
  check_id   uuid not null references public.citation_checks (id) on delete cascade,
  position   integer not null check (position >= 0),
  raw_text   text not null,
  first_author text,
  year       text,
  has_link   boolean not null default false,
  cited      boolean not null default false,

  unique (check_id, position)
);

comment on table public.citation_entries is
  'One entry from the parsed reference list, in document order.';

create index if not exists citation_entries_check_idx
  on public.citation_entries (check_id, position);

-- -----------------------------------------------------------------------------
-- citation_findings
-- -----------------------------------------------------------------------------

create table if not exists public.citation_findings (
  id          uuid primary key default extensions.gen_random_uuid(),
  check_id    uuid not null references public.citation_checks (id) on delete cascade,
  entry_id    uuid references public.citation_entries (id) on delete cascade,
  position    integer not null check (position >= 0),

  origin      public.citation_finding_origin not null,
  kind        text not null,
  severity    public.citation_severity not null,

  -- The citation or entry the finding is about, as written in the document.
  target_text text not null default '',
  message     text not null,
  suggestion  text,

  status      public.citation_finding_status not null default 'open',
  resolved_at timestamptz,

  unique (check_id, position)
);

comment on table public.citation_findings is
  'One thing to look at. origin says whether it was counted or assessed.';
comment on column public.citation_findings.origin is
  'local: exact comparison done by the server. model: judged against the style.';

create index if not exists citation_findings_check_idx
  on public.citation_findings (check_id, position);
create index if not exists citation_findings_entry_idx
  on public.citation_findings (entry_id)
  where entry_id is not null;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
-- A user works through their findings, so `status` is theirs to move. Nothing
-- else on a check is, and the entries are a record of what was parsed.

alter table public.citation_checks   enable row level security;
alter table public.citation_entries  enable row level security;
alter table public.citation_findings enable row level security;

revoke all on public.citation_checks   from anon, authenticated;
revoke all on public.citation_entries  from anon, authenticated;
revoke all on public.citation_findings from anon, authenticated;

grant select, delete on public.citation_checks   to authenticated;
grant select         on public.citation_entries  to authenticated;
grant select, update on public.citation_findings to authenticated;

drop policy if exists "citation_checks_select_own" on public.citation_checks;
create policy "citation_checks_select_own" on public.citation_checks
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "citation_checks_delete_own" on public.citation_checks;
create policy "citation_checks_delete_own" on public.citation_checks
  for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "citation_entries_select_own" on public.citation_entries;
create policy "citation_entries_select_own" on public.citation_entries
  for select to authenticated
  using (
    exists (
      select 1 from public.citation_checks c
      where c.id = citation_entries.check_id and c.user_id = (select auth.uid())
    )
  );

drop policy if exists "citation_findings_select_own" on public.citation_findings;
create policy "citation_findings_select_own" on public.citation_findings
  for select to authenticated
  using (
    exists (
      select 1 from public.citation_checks c
      where c.id = citation_findings.check_id and c.user_id = (select auth.uid())
    )
  );

drop policy if exists "citation_findings_update_own" on public.citation_findings;
create policy "citation_findings_update_own" on public.citation_findings
  for update to authenticated
  using (
    exists (
      select 1 from public.citation_checks c
      where c.id = citation_findings.check_id and c.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1 from public.citation_checks c
      where c.id = citation_findings.check_id and c.user_id = (select auth.uid())
    )
  );

-- -----------------------------------------------------------------------------
-- Column guard
-- -----------------------------------------------------------------------------
-- The same reasoning as the grammar suggestions: a user session may move a
-- finding's status and nothing else. Without this, "mark as resolved" would be
-- a way to rewrite what the checker said — which would make the whole report
-- worthless as a record of what was actually found.

create or replace function public.citation_findings_guard_columns()
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
  new.entry_id := old.entry_id;
  new.position := old.position;
  new.origin := old.origin;
  new.kind := old.kind;
  new.severity := old.severity;
  new.target_text := old.target_text;
  new.message := old.message;
  new.suggestion := old.suggestion;

  -- The timestamp is set here rather than trusted from the client.
  if new.status is distinct from old.status then
    new.resolved_at := case
      when new.status = 'open'::public.citation_finding_status then null
      else now()
    end;
  else
    new.resolved_at := old.resolved_at;
  end if;

  return new;
end;
$$;

drop trigger if exists citation_findings_guard_columns on public.citation_findings;
create trigger citation_findings_guard_columns
  before update on public.citation_findings
  for each row execute function public.citation_findings_guard_columns();
