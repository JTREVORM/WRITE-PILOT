-- =============================================================================
-- WritePilot :: 0002 :: Identity (profiles + roles)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------
-- One row per auth.users row. Holds the application-facing identity. It never
-- holds entitlement state (plan, credits) -- those live in their own tables so
-- that a user-writable row can never influence what a user is allowed to do.

create table if not exists public.profiles (
  id                     uuid primary key references auth.users (id) on delete cascade,
  email                  text not null,
  full_name              text,
  avatar_url             text,
  -- ISO 3166-1 alpha-2. Nullable: we never block a signup on it.
  country                text check (country is null or country ~ '^[A-Z]{2}$'),
  -- IANA timezone identifier, e.g. "Europe/Berlin".
  timezone               text not null default 'UTC',
  locale                 text not null default 'en',
  user_type              public.user_type not null default 'student',
  marketing_opt_in       boolean not null default false,
  onboarding_completed_at timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint profiles_full_name_length check (full_name is null or char_length(full_name) <= 120),
  constraint profiles_timezone_length check (char_length(timezone) between 1 and 64)
);

comment on table public.profiles is
  'Application profile for an authenticated user. Entitlements live elsewhere.';

create index if not exists profiles_created_at_idx on public.profiles (created_at desc);
create index if not exists profiles_country_idx on public.profiles (country) where country is not null;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Protect immutable / privileged profile columns from the owning user
-- -----------------------------------------------------------------------------
-- RLS lets a user UPDATE their own profile row, but it cannot restrict *which*
-- columns. This trigger is the column-level guard. It is bypassed for the
-- service role, which is how server-side code syncs the email after a verified
-- change in auth.users.

create or replace function public.profiles_guard_protected_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.role()) = 'service_role' then
    return new;
  end if;

  -- Identity is owned by auth.users, not by the client.
  new.id := old.id;
  new.email := old.email;
  new.created_at := old.created_at;

  return new;
end;
$$;

drop trigger if exists profiles_guard_protected_columns on public.profiles;
create trigger profiles_guard_protected_columns
  before update on public.profiles
  for each row execute function public.profiles_guard_protected_columns();

-- -----------------------------------------------------------------------------
-- user_roles
-- -----------------------------------------------------------------------------
-- Roles are stored in their own table rather than on the profile (or in the JWT
-- claims) so that privilege can never be escalated by a client-side profile
-- update. Nothing but the service role may write here.

create table if not exists public.user_roles (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.app_role not null,
  granted_by uuid references public.profiles (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role)
);

comment on table public.user_roles is
  'Server-managed role assignments. Never writable from a browser session.';

create index if not exists user_roles_role_idx on public.user_roles (role);

-- -----------------------------------------------------------------------------
-- Authorization helpers
-- -----------------------------------------------------------------------------
-- SECURITY DEFINER + empty search_path: these are called from inside RLS
-- policies, so they must not themselves be subject to RLS (which would recurse)
-- and must not be resolvable against a caller-controlled search path.

create or replace function public.has_role(p_user_id uuid, p_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = p_user_id
      and ur.role = p_role
  );
$$;

create or replace function public.is_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
     and public.has_role(p_user_id, 'admin'::public.app_role);
$$;

create or replace function public.is_educator(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null
     and (
       public.has_role(p_user_id, 'educator'::public.app_role)
       or public.has_role(p_user_id, 'admin'::public.app_role)
     );
$$;

comment on function public.is_admin is
  'Authoritative admin check. Used by RLS policies and server-side guards.';

grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated;
grant execute on function public.is_educator(uuid) to authenticated;
