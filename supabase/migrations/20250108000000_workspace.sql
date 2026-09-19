-- =============================================================================
-- WritePilot :: 0014 :: Documents and assignments
-- -----------------------------------------------------------------------------
-- Phase 8: the workspace the tools run inside.
--
-- Until now every tool took a paste or an upload, used it once and kept its own
-- copy. That works for a single check and falls apart across a piece of work
-- that is drafted four times: the same essay gets re-uploaded to four tools and
-- nothing connects them.
--
-- A document is uploaded once and reused. An assignment gathers the brief, the
-- rubric and the drafts in one place. Both are private to their owner, by
-- policy and by storage path, and both are deletable.
-- =============================================================================

do $$ begin
  create type public.assignment_status as enum ('planning', 'drafting', 'submitted');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- documents
-- -----------------------------------------------------------------------------

create table if not exists public.documents (
  id               uuid primary key default extensions.gen_random_uuid(),
  user_id          uuid not null references public.profiles (id) on delete cascade,

  title            text not null,
  source           public.scan_source not null default 'text',
  original_filename text,
  -- users/{user_id}/documents/{document_id}/{filename}. Null for pasted text,
  -- which has no file behind it. The path is written by the server; a client
  -- cannot set it, so it cannot be pointed at another user's folder.
  storage_path     text,
  content_type     text,
  byte_size        integer check (byte_size is null or byte_size >= 0),

  -- The extracted text. This is what the tools actually read.
  content          text not null,
  word_count       integer not null default 0 check (word_count >= 0),
  character_count  integer not null default 0 check (character_count >= 0),

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  constraint documents_title_length check (char_length(title) between 1 and 200),
  -- A storage path must live under the owner's own folder. Belt and braces
  -- beside the storage policies: a bug in application code cannot file one
  -- user's upload under another user's prefix.
  constraint documents_storage_path_scoped check (
    storage_path is null
    or storage_path like 'users/' || user_id::text || '/documents/%'
  )
);

comment on table public.documents is
  'An uploaded or pasted document, stored once and reused by every tool.';
comment on column public.documents.storage_path is
  'Owner-scoped object path. Written by the server, never by a client.';

create index if not exists documents_user_idx
  on public.documents (user_id, created_at desc);

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- assignments
-- -----------------------------------------------------------------------------
-- Unlike everything else in this schema, an assignment is wholly user-authored:
-- no credits, no model, nothing derived. So it is created and edited directly
-- through RLS rather than through a privileged function. The policies are the
-- whole of the protection, which is why they are tested in both directions.

create table if not exists public.assignments (
  id           uuid primary key default extensions.gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,

  title        text not null,
  course       text,
  instructions text,
  -- The rubric this will be marked against, when the user has one. Kept on
  -- delete: losing a rubric should not silently detach the brief from its work.
  rubric_id    uuid references public.rubrics (id) on delete set null,

  status       public.assignment_status not null default 'planning',
  due_at       timestamptz,

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint assignments_title_length check (char_length(title) between 1 and 200),
  constraint assignments_course_length check (
    course is null or char_length(course) <= 120
  )
);

comment on table public.assignments is
  'A piece of work: the brief, the rubric it will be marked against, its drafts.';

create index if not exists assignments_user_idx
  on public.assignments (user_id, due_at nulls last, created_at desc);

drop trigger if exists assignments_set_updated_at on public.assignments;
create trigger assignments_set_updated_at
  before update on public.assignments
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- assignment_drafts
-- -----------------------------------------------------------------------------
-- Which documents are drafts of which assignment, and in what order.

create table if not exists public.assignment_drafts (
  id            uuid primary key default extensions.gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  document_id   uuid not null references public.documents (id) on delete cascade,
  version       integer not null check (version >= 1),
  note          text,
  created_at    timestamptz not null default now(),

  unique (assignment_id, version),
  -- The same document cannot be two drafts of one assignment.
  unique (assignment_id, document_id)
);

comment on table public.assignment_drafts is
  'One document attached to one assignment as a numbered draft.';

create index if not exists assignment_drafts_assignment_idx
  on public.assignment_drafts (assignment_id, version desc);
create index if not exists assignment_drafts_document_idx
  on public.assignment_drafts (document_id);

-- -----------------------------------------------------------------------------
-- Linking analyses to the document they were run on
-- -----------------------------------------------------------------------------
-- Additive and nullable: every analysis run before this migration, and every
-- one run from a paste rather than from the library, simply has no document.
--
-- `on delete set null` rather than cascade, deliberately. A user who deletes a
-- document has not asked to lose the grade they paid for, and every analysis
-- already keeps its own copy of the text it read. That copy is the reason the
-- interface says plainly that deleting a document does not delete the checks
-- run on it, and that those are deletable separately.

alter table public.ai_scans
  add column if not exists document_id uuid references public.documents (id) on delete set null;
alter table public.grammar_checks
  add column if not exists document_id uuid references public.documents (id) on delete set null;
alter table public.naturalize_runs
  add column if not exists document_id uuid references public.documents (id) on delete set null;
alter table public.grades
  add column if not exists document_id uuid references public.documents (id) on delete set null;
alter table public.citation_checks
  add column if not exists document_id uuid references public.documents (id) on delete set null;

create index if not exists ai_scans_document_idx
  on public.ai_scans (document_id) where document_id is not null;
create index if not exists grammar_checks_document_idx
  on public.grammar_checks (document_id) where document_id is not null;
create index if not exists naturalize_runs_document_idx
  on public.naturalize_runs (document_id) where document_id is not null;
create index if not exists grades_document_idx
  on public.grades (document_id) where document_id is not null;
create index if not exists citation_checks_document_idx
  on public.citation_checks (document_id) where document_id is not null;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.documents         enable row level security;
alter table public.assignments       enable row level security;
alter table public.assignment_drafts enable row level security;

revoke all on public.documents         from anon, authenticated;
revoke all on public.assignments       from anon, authenticated;
revoke all on public.assignment_drafts from anon, authenticated;

-- A document's text and its file are written by the server; its title is the
-- user's own. Hence select/update/delete but no insert.
grant select, update, delete                 on public.documents         to authenticated;
grant select, insert, update, delete         on public.assignments       to authenticated;
grant select, insert, delete                 on public.assignment_drafts to authenticated;

drop policy if exists "documents_select_own" on public.documents;
create policy "documents_select_own" on public.documents
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "documents_update_own" on public.documents;
create policy "documents_update_own" on public.documents
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "documents_delete_own" on public.documents;
create policy "documents_delete_own" on public.documents
  for delete to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "assignments_select_own" on public.assignments;
create policy "assignments_select_own" on public.assignments
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "assignments_insert_own" on public.assignments;
create policy "assignments_insert_own" on public.assignments
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "assignments_update_own" on public.assignments;
create policy "assignments_update_own" on public.assignments
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "assignments_delete_own" on public.assignments;
create policy "assignments_delete_own" on public.assignments
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Attaching a draft touches two rows, so both are checked. Without the second
-- clause, a user could attach someone else's document to their own assignment
-- and read its title through the join.
drop policy if exists "assignment_drafts_select_own" on public.assignment_drafts;
create policy "assignment_drafts_select_own" on public.assignment_drafts
  for select to authenticated
  using (
    exists (
      select 1 from public.assignments a
      where a.id = assignment_drafts.assignment_id and a.user_id = (select auth.uid())
    )
  );

drop policy if exists "assignment_drafts_insert_own" on public.assignment_drafts;
create policy "assignment_drafts_insert_own" on public.assignment_drafts
  for insert to authenticated
  with check (
    exists (
      select 1 from public.assignments a
      where a.id = assignment_drafts.assignment_id and a.user_id = (select auth.uid())
    )
    and exists (
      select 1 from public.documents d
      where d.id = assignment_drafts.document_id and d.user_id = (select auth.uid())
    )
  );

drop policy if exists "assignment_drafts_delete_own" on public.assignment_drafts;
create policy "assignment_drafts_delete_own" on public.assignment_drafts
  for delete to authenticated
  using (
    exists (
      select 1 from public.assignments a
      where a.id = assignment_drafts.assignment_id and a.user_id = (select auth.uid())
    )
  );

-- -----------------------------------------------------------------------------
-- Column guard: a user may rename their document, not rewrite it
-- -----------------------------------------------------------------------------
-- The text, the file behind it and the counts derived from it are a record of
-- what was uploaded. A user session that could edit `content` could make every
-- analysis stored against this document disagree with the document itself.

create or replace function public.documents_guard_columns()
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
  new.user_id := old.user_id;
  new.source := old.source;
  new.original_filename := old.original_filename;
  new.storage_path := old.storage_path;
  new.content_type := old.content_type;
  new.byte_size := old.byte_size;
  new.content := old.content;
  new.word_count := old.word_count;
  new.character_count := old.character_count;
  new.created_at := old.created_at;

  return new;
end;
$$;

drop trigger if exists documents_guard_columns on public.documents;
create trigger documents_guard_columns
  before update on public.documents
  for each row execute function public.documents_guard_columns();

-- -----------------------------------------------------------------------------
-- Storage
-- -----------------------------------------------------------------------------
-- A private bucket, with every object under the owner's own prefix. Uploads go
-- through the server (the text has to be extracted anyway), and downloads go
-- through short-lived signed URLs, so these policies are not the only thing
-- standing between one user's files and another's. They are what makes that
-- true even if something above them is wrong.

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do update set public = false;

do $$ begin
  -- The harness's storage stand-in has no RLS to enable; a real project does.
  execute 'alter table storage.objects enable row level security';
exception when others then null; end $$;

drop policy if exists "documents_objects_select_own" on storage.objects;
create policy "documents_objects_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'users'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

drop policy if exists "documents_objects_insert_own" on storage.objects;
create policy "documents_objects_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'users'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

drop policy if exists "documents_objects_delete_own" on storage.objects;
create policy "documents_objects_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'documents'
    and (storage.foldername(name))[1] = 'users'
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );
