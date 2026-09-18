-- =============================================================================
-- WritePilot :: 0006 :: Row Level Security
-- -----------------------------------------------------------------------------
-- Default posture: every table has RLS enabled and NO policy grants a write to
-- an end user unless the row is inert user-owned content. Money, plan and usage
-- state is read-only from a browser session and mutated only by the SECURITY
-- DEFINER functions in 0005 (which the service role invokes server-side).
--
-- Note: the service_role key bypasses RLS entirely. That is precisely why it
-- must never reach the browser -- see src/lib/supabase/admin.ts.
-- =============================================================================

alter table public.profiles            enable row level security;
alter table public.user_roles          enable row level security;
alter table public.features            enable row level security;
alter table public.plans               enable row level security;
alter table public.plan_features       enable row level security;
alter table public.subscriptions       enable row level security;
alter table public.credit_packs        enable row level security;
alter table public.credit_wallets      enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.usage_logs          enable row level security;
alter table public.usage_counters      enable row level security;
alter table public.notifications       enable row level security;
alter table public.audit_logs          enable row level security;

-- -----------------------------------------------------------------------------
-- Table privileges
-- -----------------------------------------------------------------------------
-- RLS only filters rows a role already has the privilege to touch. Supabase
-- grants broad defaults to anon/authenticated, so we reset them and re-grant
-- exactly what the policies below are written for. Stating the grants here
-- (rather than inheriting them) also keeps the schema portable and makes the
-- intended access surface reviewable in one place.

revoke all on public.profiles            from anon, authenticated;
revoke all on public.user_roles          from anon, authenticated;
revoke all on public.features            from anon, authenticated;
revoke all on public.plans               from anon, authenticated;
revoke all on public.plan_features       from anon, authenticated;
revoke all on public.subscriptions       from anon, authenticated;
revoke all on public.credit_packs        from anon, authenticated;
revoke all on public.credit_wallets      from anon, authenticated;
revoke all on public.credit_transactions from anon, authenticated;
revoke all on public.usage_logs          from anon, authenticated;
revoke all on public.usage_counters      from anon, authenticated;
revoke all on public.notifications       from anon, authenticated;
revoke all on public.audit_logs          from anon, authenticated;

-- Public catalogue: the landing and pricing pages are unauthenticated.
grant select on public.plans         to anon, authenticated;
grant select on public.features      to anon, authenticated;
grant select on public.plan_features to anon, authenticated;
grant select on public.credit_packs  to anon, authenticated;

-- Signed-in users: read their own state, edit only inert profile fields.
grant select         on public.profiles            to authenticated;
grant update         on public.profiles            to authenticated;
grant select         on public.user_roles          to authenticated;
grant select         on public.subscriptions       to authenticated;
grant select         on public.credit_wallets      to authenticated;
grant select         on public.credit_transactions to authenticated;
grant select         on public.usage_logs          to authenticated;
grant select         on public.usage_counters      to authenticated;
grant select, update, delete on public.notifications to authenticated;

-- audit_logs is deliberately absent: it is read through the service role only,
-- with the admin policy below as a second line of defence.

-- -----------------------------------------------------------------------------
-- profiles :: own row, read + limited update (column guard lives in 0002)
-- -----------------------------------------------------------------------------

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using ((select auth.uid()) = id or public.is_admin((select auth.uid())));

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Rows are created by the handle_new_user trigger, never by the client.
drop policy if exists "profiles_no_client_insert" on public.profiles;
drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles
  for update to authenticated
  using (public.is_admin((select auth.uid())))
  with check (public.is_admin((select auth.uid())));

-- -----------------------------------------------------------------------------
-- user_roles :: readable by the owner, writable by nobody but the service role
-- -----------------------------------------------------------------------------

drop policy if exists "user_roles_select_own" on public.user_roles;
create policy "user_roles_select_own" on public.user_roles
  for select to authenticated
  using ((select auth.uid()) = user_id or public.is_admin((select auth.uid())));

-- -----------------------------------------------------------------------------
-- Public catalogue :: readable by anyone (the pricing page is unauthenticated)
-- -----------------------------------------------------------------------------

drop policy if exists "plans_select_public" on public.plans;
create policy "plans_select_public" on public.plans
  for select to anon, authenticated
  using (is_active and (is_public or public.is_admin((select auth.uid()))));

drop policy if exists "features_select_public" on public.features;
create policy "features_select_public" on public.features
  for select to anon, authenticated
  using (is_active or public.is_admin((select auth.uid())));

drop policy if exists "plan_features_select_public" on public.plan_features;
create policy "plan_features_select_public" on public.plan_features
  for select to anon, authenticated
  using (
    exists (
      select 1 from public.plans p
      where p.id = plan_features.plan_id and p.is_active and p.is_public
    )
    or public.is_admin((select auth.uid()))
  );

drop policy if exists "credit_packs_select_public" on public.credit_packs;
create policy "credit_packs_select_public" on public.credit_packs
  for select to anon, authenticated
  using (is_active or public.is_admin((select auth.uid())));

-- -----------------------------------------------------------------------------
-- Entitlement state :: strictly read-only for end users
-- -----------------------------------------------------------------------------

drop policy if exists "subscriptions_select_own" on public.subscriptions;
create policy "subscriptions_select_own" on public.subscriptions
  for select to authenticated
  using ((select auth.uid()) = user_id or public.is_admin((select auth.uid())));

drop policy if exists "credit_wallets_select_own" on public.credit_wallets;
create policy "credit_wallets_select_own" on public.credit_wallets
  for select to authenticated
  using ((select auth.uid()) = user_id or public.is_admin((select auth.uid())));

drop policy if exists "credit_transactions_select_own" on public.credit_transactions;
create policy "credit_transactions_select_own" on public.credit_transactions
  for select to authenticated
  using ((select auth.uid()) = user_id or public.is_admin((select auth.uid())));

drop policy if exists "usage_logs_select_own" on public.usage_logs;
create policy "usage_logs_select_own" on public.usage_logs
  for select to authenticated
  using ((select auth.uid()) = user_id or public.is_admin((select auth.uid())));

drop policy if exists "usage_counters_select_own" on public.usage_counters;
create policy "usage_counters_select_own" on public.usage_counters
  for select to authenticated
  using ((select auth.uid()) = user_id or public.is_admin((select auth.uid())));

-- -----------------------------------------------------------------------------
-- notifications :: owner may read and mark as read, nothing else
-- -----------------------------------------------------------------------------

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own" on public.notifications
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- -----------------------------------------------------------------------------
-- audit_logs :: administrators only
-- -----------------------------------------------------------------------------

drop policy if exists "audit_logs_select_admin" on public.audit_logs;
create policy "audit_logs_select_admin" on public.audit_logs
  for select to authenticated
  using (public.is_admin((select auth.uid())));

-- -----------------------------------------------------------------------------
-- Posture for tables added in later phases
-- -----------------------------------------------------------------------------
-- Every table introduced from here on (documents, ai_scans, assignments, ...)
-- must: enable RLS, revoke the inherited anon/authenticated grants, re-grant
-- only what its policies need, and scope every policy by auth.uid(). The test
-- suite in supabase/tests/database.test.sql is the place to prove it.
