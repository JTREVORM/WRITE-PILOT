-- Minimal stand-in for the parts of a Supabase project our migrations rely on.
create schema if not exists extensions;
create schema if not exists auth;

do $$ begin create role anon nologin noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin noinherit; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin noinherit bypassrls; exception when duplicate_object then null; end $$;
do $$ begin create role supabase_auth_admin login noinherit; exception when duplicate_object then null; end $$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema extensions to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant anon, authenticated, service_role to postgres;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- GoTrue exposes the current request's claims through these helpers.
create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
$$;

grant execute on function auth.uid(), auth.role() to anon, authenticated, service_role;
grant select on auth.users to service_role;

-- Supabase installs pgcrypto into the extensions schema; mirror that here.
create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

-- -----------------------------------------------------------------------------
-- Storage
-- -----------------------------------------------------------------------------
-- A stand-in for the parts of Supabase Storage the document workspace relies
-- on. Only enough to let the bucket and its policies be created and tested:
-- object bodies never exist here, but who may see a path is exactly what the
-- policies decide, and that is worth asserting.

create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id          text primary key,
  name        text not null,
  public      boolean not null default false,
  created_at  timestamptz not null default now()
);

create table if not exists storage.objects (
  id          uuid primary key default extensions.gen_random_uuid(),
  bucket_id   text not null references storage.buckets (id),
  name        text not null,
  owner       uuid,
  created_at  timestamptz not null default now(),
  unique (bucket_id, name)
);

-- Splits an object path into its folder segments, as Supabase's own does.
create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select string_to_array(name, '/');
$$;

grant execute on function storage.foldername(text) to anon, authenticated, service_role;
