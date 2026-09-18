-- =============================================================================
-- WritePilot :: database test suite
-- -----------------------------------------------------------------------------
-- Exercises account provisioning, the credit ledger, usage tracking and -- most
-- importantly -- that Row Level Security actually denies what it claims to.
--
-- Run with:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/database.test.sql
--
-- Every assertion raises on failure, so a non-zero exit means a real regression.
-- The script cleans up after itself and is safe to re-run.
-- =============================================================================

\set ON_ERROR_STOP on
\timing off

create schema if not exists wp_test;

create or replace function wp_test.assert(p_condition boolean, p_message text)
returns void language plpgsql as $$
begin
  if p_condition is not true then
    raise exception 'ASSERTION FAILED: %', p_message;
  end if;
  raise notice '  ok  %', p_message;
end;
$$;

-- Asserts that a statement is rejected. Used for the RLS denial cases: a silent
-- pass there would be a security hole, so "it threw" is the success condition.
create or replace function wp_test.assert_denied(p_sql text, p_message text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice '  ok  % (denied: %)', p_message, sqlstate;
    return;
  end;
  raise exception 'ASSERTION FAILED: % -- statement was allowed but must be denied', p_message;
end;
$$;

create or replace function wp_test.assert_eq(p_actual anyelement, p_expected anyelement, p_message text)
returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'ASSERTION FAILED: % (expected %, got %)', p_message, p_expected, p_actual;
  end if;
  raise notice '  ok  % = %', p_message, p_actual;
end;
$$;

create table if not exists wp_test.fixtures (name text primary key, id uuid not null);

-- The RLS sections below run as anon/authenticated, so the harness itself must
-- be reachable from those roles. Nothing here touches application data.
grant usage on schema wp_test to anon, authenticated;
grant select on wp_test.fixtures to anon, authenticated;
grant execute on function wp_test.assert(boolean, text) to anon, authenticated;
grant execute on function wp_test.assert_denied(text, text) to anon, authenticated;
grant execute on function wp_test.assert_eq(anyelement, anyelement, text) to anon, authenticated;

-- =============================================================================
\echo '== 1. Account provisioning =================================================='
-- =============================================================================

do $$
declare
  v_alice uuid := extensions.gen_random_uuid();
  v_bob   uuid := extensions.gen_random_uuid();
begin
  -- Leave no residue from a previous (possibly failed) run.
  delete from auth.users where email like '%@writepilot.test';
  delete from wp_test.fixtures;

  insert into auth.users (id, email, raw_user_meta_data)
  values (
    v_alice, 'alice@writepilot.test',
    jsonb_build_object('full_name', 'Alice Researcher', 'country', 'de',
                       'timezone', 'Europe/Berlin', 'user_type', 'researcher')
  );

  insert into auth.users (id, email, raw_user_meta_data)
  values (v_bob, 'bob@writepilot.test', jsonb_build_object('full_name', 'Bob Student'));

  insert into wp_test.fixtures values ('alice', v_alice), ('bob', v_bob);
end $$;

do $$
declare
  v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
  v_profile public.profiles%rowtype;
  v_wallet  public.credit_wallets%rowtype;
begin
  select * into v_profile from public.profiles where id = v_alice;

  perform wp_test.assert(found, 'signup creates a profile row');
  perform wp_test.assert_eq(v_profile.full_name, 'Alice Researcher', 'full_name from signup metadata');
  perform wp_test.assert_eq(v_profile.country, 'DE', 'country normalised to uppercase ISO code');
  perform wp_test.assert_eq(v_profile.timezone, 'Europe/Berlin', 'timezone from signup metadata');
  perform wp_test.assert_eq(v_profile.user_type::text, 'researcher', 'user_type from signup metadata');

  perform wp_test.assert(
    public.has_role(v_alice, 'user'::public.app_role),
    'signup assigns the default user role'
  );
  perform wp_test.assert(
    not public.is_admin(v_alice),
    'signup does not assign the admin role'
  );

  perform wp_test.assert(
    exists (
      select 1 from public.subscriptions s
      join public.plans p on p.id = s.plan_id
      where s.user_id = v_alice and p.key = 'free' and s.status = 'active'
    ),
    'signup creates an active free subscription'
  );

  select * into v_wallet from public.credit_wallets where user_id = v_alice;
  perform wp_test.assert_eq(v_wallet.balance, 30, 'welcome credits match the free plan allowance');
  perform wp_test.assert_eq(v_wallet.monthly_allowance, 30, 'wallet records the monthly allowance');

  perform wp_test.assert(
    exists (
      select 1 from public.credit_transactions
      where user_id = v_alice and type = 'signup_grant' and amount = 30
    ),
    'welcome grant is written to the ledger'
  );
end $$;

do $$
declare
  v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
  v_before integer;
begin
  select balance into v_before from public.credit_wallets where user_id = v_alice;
  -- Re-provisioning must never double-grant.
  perform public.provision_user(v_alice);
  perform wp_test.assert_eq(
    (select balance from public.credit_wallets where user_id = v_alice),
    v_before,
    'provision_user is idempotent'
  );
end $$;

-- =============================================================================
\echo '== 2. Entitlements ========================================================='
-- =============================================================================

do $$
declare
  v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
  v_ent jsonb;
begin
  v_ent := public.get_entitlements(v_alice);

  perform wp_test.assert_eq(v_ent -> 'plan' ->> 'key', 'free', 'entitlements report the free plan');
  perform wp_test.assert_eq((v_ent -> 'credits' ->> 'balance')::int, 30, 'entitlements report the balance');
  perform wp_test.assert_eq(
    (v_ent -> 'features' -> 'grammar_check' ->> 'credit_cost')::int, 1,
    'grammar_check cost comes from the feature catalogue'
  );
  perform wp_test.assert_eq(
    (v_ent -> 'features' -> 'grammar_check' ->> 'enabled')::boolean, true,
    'grammar_check is enabled on free'
  );
  perform wp_test.assert_eq(
    (v_ent -> 'features' -> 'deep_analysis' ->> 'enabled')::boolean, false,
    'deep_analysis is gated off the free plan'
  );
  perform wp_test.assert_eq(
    (v_ent -> 'features' -> 'ai_detection' ->> 'monthly_limit')::int, 5,
    'free plan caps ai_detection at its configured monthly limit'
  );
  perform wp_test.assert_eq(
    v_ent -> 'roles' ->> 0, 'user', 'entitlements expose the role list'
  );
end $$;

-- =============================================================================
\echo '== 3. Credit ledger ========================================================'
-- =============================================================================

do $$
declare
  v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
  v_res jsonb;
  v_tx  uuid;
begin
  v_res := public.consume_credits(v_alice, 'ai_detection', 2, 'AI detection scan', 'scan-001');
  perform wp_test.assert_eq((v_res ->> 'charged')::int, 2, 'consume_credits charges the requested amount');
  perform wp_test.assert_eq((v_res ->> 'balance')::int, 28, 'balance reflects the debit');

  -- A retried server action must not charge twice.
  v_res := public.consume_credits(v_alice, 'ai_detection', 2, 'AI detection scan', 'scan-001');
  perform wp_test.assert_eq((v_res ->> 'replayed')::boolean, true, 'repeat call is recognised as a replay');
  perform wp_test.assert_eq(
    (select balance from public.credit_wallets where user_id = v_alice), 28,
    'replayed call does not double-charge'
  );

  perform wp_test.assert_eq(
    (select balance_after from public.credit_transactions
     where user_id = v_alice and idempotency_key = 'scan-001'),
    28, 'ledger records the balance after the debit'
  );

  -- Refund path after a failed AI operation.
  select id into v_tx from public.credit_transactions
  where user_id = v_alice and idempotency_key = 'scan-001';

  v_res := public.refund_credits(v_alice, v_tx);
  perform wp_test.assert_eq((v_res ->> 'refunded')::int, 2, 'refund returns the charged credits');
  perform wp_test.assert_eq((v_res ->> 'balance')::int, 30, 'balance restored after refund');

  v_res := public.refund_credits(v_alice, v_tx);
  perform wp_test.assert_eq((v_res ->> 'replayed')::boolean, true, 'a consumption can only be refunded once');
end $$;

do $$
declare
  v_bob uuid := (select id from wp_test.fixtures where name = 'bob');
  v_caught boolean := false;
begin
  begin
    perform public.consume_credits(v_bob, 'deep_analysis', 9999, 'oversized request');
  exception when others then
    v_caught := sqlerrm like 'insufficient_credits%';
  end;
  perform wp_test.assert(v_caught, 'spending more than the balance raises insufficient_credits');
  perform wp_test.assert_eq(
    (select balance from public.credit_wallets where user_id = v_bob), 30,
    'a rejected spend leaves the balance untouched'
  );
end $$;

do $$
declare
  v_bob uuid := (select id from wp_test.fixtures where name = 'bob');
begin
  -- Purchased credits are spent only after the expiring plan allowance.
  perform public.grant_credits(v_bob, 50, 'purchase'::public.credit_transaction_type, 'Top-up 30', 'pack-001');
  perform wp_test.assert_eq(
    (select purchased_balance from public.credit_wallets where user_id = v_bob), 50,
    'purchased credits land in the purchased balance'
  );

  perform public.consume_credits(v_bob, 'ai_grading', 40, 'grading run', 'grade-001');
  perform wp_test.assert_eq(
    (select balance from public.credit_wallets where user_id = v_bob), 0,
    'plan allowance is spent first'
  );
  perform wp_test.assert_eq(
    (select purchased_balance from public.credit_wallets where user_id = v_bob), 40,
    'the remainder comes out of purchased credits'
  );
end $$;

-- =============================================================================
\echo '== 4. Usage tracking ======================================================='
-- =============================================================================

do $$
declare
  v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
  v_log uuid;
begin
  v_log := public.log_feature_usage(
    p_user_id => v_alice, p_feature_key => 'grammar_check',
    p_status => 'success', p_credits => 1, p_words => 820,
    p_duration_ms => 1450, p_provider => 'test', p_model => 'test-model'
  );
  perform wp_test.assert(v_log is not null, 'usage log row is created');

  perform wp_test.assert_eq(
    (select plan_key from public.usage_logs where id = v_log), 'free',
    'usage log snapshots the plan in effect'
  );
  perform wp_test.assert_eq(
    (select used_count from public.usage_counters
     where user_id = v_alice and feature_key = 'grammar_check' and period_start = public.month_start()),
    1, 'monthly counter increments on success'
  );

  perform public.log_feature_usage(
    p_user_id => v_alice, p_feature_key => 'grammar_check',
    p_status => 'failure', p_credits => 0, p_error_code => 'provider_timeout'
  );
  perform wp_test.assert_eq(
    (select used_count from public.usage_counters
     where user_id = v_alice and feature_key = 'grammar_check' and period_start = public.month_start()),
    1, 'a failed operation is logged but does not consume the monthly allowance'
  );
  perform wp_test.assert_eq(
    (select count(*)::int from public.usage_logs where user_id = v_alice and status = 'failure'),
    1, 'failures are still recorded for reliability reporting'
  );

  perform wp_test.assert_eq(
    (public.get_entitlements(v_alice) -> 'features' -> 'grammar_check' ->> 'used_this_period')::int,
    1, 'entitlements surface usage against the monthly limit'
  );
end $$;

-- =============================================================================
\echo '== 5. Plan assignment and renewal =========================================='
-- =============================================================================

do $$
declare
  v_bob uuid := (select id from wp_test.fixtures where name = 'bob');
  v_ent jsonb;
begin
  perform public.assign_plan(v_bob, 'pro');
  v_ent := public.get_entitlements(v_bob);

  perform wp_test.assert_eq(v_ent -> 'plan' ->> 'key', 'pro', 'assign_plan moves the user onto the new plan');
  perform wp_test.assert_eq(
    (v_ent -> 'features' -> 'deep_analysis' ->> 'enabled')::boolean, true,
    'upgrading unlocks the gated feature'
  );
  perform wp_test.assert_eq(
    (select count(*)::int from public.subscriptions where user_id = v_bob and status = 'active'),
    1, 'exactly one live subscription remains after an upgrade'
  );
  perform wp_test.assert_eq(
    (select count(*)::int from public.subscriptions where user_id = v_bob and status = 'canceled'),
    1, 'the previous subscription is retained as history'
  );
  perform wp_test.assert(
    (v_ent -> 'credits' ->> 'balance')::int >= 800,
    'the new plan allowance is granted on upgrade'
  );
end $$;

-- =============================================================================
\echo '== 6. Row Level Security ==================================================='
-- =============================================================================

-- --- an anonymous visitor ----------------------------------------------------
begin;
  set local role anon;
  set local request.jwt.claim.role = 'anon';

  do $$ begin
    perform wp_test.assert(
      (select count(*) from public.plans) = 4,
      'anonymous visitors can read the public plan catalogue (pricing page)'
    );
    perform wp_test.assert(
      (select count(*) from public.credit_packs) = 3,
      'anonymous visitors can read credit packs'
    );
  end $$;

  select wp_test.assert_denied(
    'select * from public.profiles', 'anonymous visitors cannot read profiles');
  select wp_test.assert_denied(
    'select * from public.credit_wallets', 'anonymous visitors cannot read wallets');
  select wp_test.assert_denied(
    'select * from public.usage_logs', 'anonymous visitors cannot read usage logs');
commit;

-- --- a signed-in user, reading -----------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claim.role = 'authenticated';
  set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000000';

  do $$
  declare v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
  begin
    execute format('set local request.jwt.claim.sub = %L', v_alice);

    perform wp_test.assert_eq(
      (select count(*)::int from public.profiles), 1,
      'a user sees exactly one profile -- their own'
    );
    perform wp_test.assert_eq(
      (select id from public.profiles), v_alice,
      'the visible profile is the caller''s'
    );
    perform wp_test.assert_eq(
      (select count(*)::int from public.credit_wallets), 1,
      'a user sees only their own wallet'
    );
    perform wp_test.assert_eq(
      (select count(*)::int from public.credit_transactions where user_id <> v_alice), 0,
      'a user cannot read another user''s credit history'
    );
    perform wp_test.assert_eq(
      (select count(*)::int from public.subscriptions where user_id <> v_alice), 0,
      'a user cannot read another user''s subscription'
    );
    perform wp_test.assert_eq(
      (select count(*)::int from public.usage_logs where user_id <> v_alice), 0,
      'a user cannot read another user''s usage logs'
    );
    perform wp_test.assert_eq(
      (select count(*)::int from public.user_roles where user_id <> v_alice), 0,
      'a user cannot enumerate other users'' roles'
    );
  end $$;

  select wp_test.assert_denied(
    'select * from public.audit_logs', 'a non-admin cannot read audit logs');
commit;

-- --- a signed-in user, writing ------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claim.role = 'authenticated';

  do $$
  declare v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
  begin
    execute format('set local request.jwt.claim.sub = %L', v_alice);
  end $$;

  select wp_test.assert_denied(
    'update public.credit_wallets set balance = 999999',
    'a user cannot inflate their own credit balance');
  select wp_test.assert_denied(
    'update public.credit_wallets set purchased_balance = 999999',
    'a user cannot grant themselves purchased credits');
  select wp_test.assert_denied(
    $q$insert into public.credit_transactions (user_id, type, amount, balance_after)
       select id, 'purchase', 5000, 5000 from wp_test.fixtures where name = 'alice'$q$,
    'a user cannot forge a credit transaction');
  select wp_test.assert_denied(
    $q$insert into public.user_roles (user_id, role)
       select id, 'admin' from wp_test.fixtures where name = 'alice'$q$,
    'a user cannot grant themselves the admin role');
  select wp_test.assert_denied(
    $q$update public.subscriptions set plan_id = (select id from public.plans where key = 'educator')$q$,
    'a user cannot upgrade their own subscription');
  select wp_test.assert_denied(
    $q$insert into public.usage_logs (user_id, feature_key)
       select id, 'grammar_check' from wp_test.fixtures where name = 'alice'$q$,
    'a user cannot fabricate usage records');
  select wp_test.assert_denied(
    $q$update public.plans set price_monthly_cents = 0$q$,
    'a user cannot rewrite the price list');
  select wp_test.assert_denied(
    $q$update public.features set credit_cost = 0$q$,
    'a user cannot zero out feature credit costs');
commit;

-- --- privileged functions are unreachable from a user session -----------------
begin;
  set local role authenticated;
  set local request.jwt.claim.role = 'authenticated';

  do $$
  declare v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
  begin
    execute format('set local request.jwt.claim.sub = %L', v_alice);
  end $$;

  select wp_test.assert_denied(
    $q$select public.grant_credits((select id from wp_test.fixtures where name = 'alice'), 10000)$q$,
    'a user cannot execute grant_credits');
  select wp_test.assert_denied(
    $q$select public.assign_plan((select id from wp_test.fixtures where name = 'alice'), 'educator')$q$,
    'a user cannot execute assign_plan');
  select wp_test.assert_denied(
    $q$select public.provision_user((select id from wp_test.fixtures where name = 'alice'))$q$,
    'a user cannot execute provision_user');
  select wp_test.assert_denied(
    $q$select public.log_feature_usage((select id from wp_test.fixtures where name = 'alice'), 'grammar_check')$q$,
    'a user cannot execute log_feature_usage');
  select wp_test.assert_denied(
    $q$select public.get_entitlements((select id from wp_test.fixtures where name = 'bob'))$q$,
    'a user cannot read another user''s entitlements');
commit;

-- --- the profile column guard --------------------------------------------------
begin;
  set local role authenticated;
  set local request.jwt.claim.role = 'authenticated';

  do $$
  declare
    v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
  begin
    execute format('set local request.jwt.claim.sub = %L', v_alice);

    update public.profiles set full_name = 'Alice Updated', country = 'FR' where id = v_alice;
    perform wp_test.assert_eq(
      (select full_name from public.profiles where id = v_alice), 'Alice Updated',
      'a user can edit their own display fields'
    );

    -- The guard silently restores protected columns rather than erroring, so the
    -- assertion is that the value did not move.
    update public.profiles set email = 'attacker@evil.test' where id = v_alice;
    perform wp_test.assert_eq(
      (select email from public.profiles where id = v_alice), 'alice@writepilot.test',
      'a user cannot change the email on their profile row'
    );
  end $$;
commit;

-- --- administrators ------------------------------------------------------------
do $$
declare v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
begin
  insert into public.user_roles (user_id, role) values (v_alice, 'admin')
  on conflict do nothing;
end $$;

begin;
  set local role authenticated;
  set local request.jwt.claim.role = 'authenticated';

  do $$
  declare
    v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
    v_bob   uuid := (select id from wp_test.fixtures where name = 'bob');
  begin
    execute format('set local request.jwt.claim.sub = %L', v_alice);

    perform wp_test.assert(public.is_admin(v_alice), 'the admin role is recognised');
    perform wp_test.assert_eq(
      (select count(*)::int from public.profiles), 2,
      'an admin can read every profile'
    );
    perform wp_test.assert(
      (select count(*) from public.credit_transactions where user_id = v_bob) > 0,
      'an admin can read another user''s credit history'
    );
    perform wp_test.assert(
      public.get_entitlements(v_bob) is not null,
      'an admin can read another user''s entitlements'
    );
  end $$;

  -- Even an admin cannot move money from a browser session; that is server work.
  select wp_test.assert_denied(
    'update public.credit_wallets set balance = 999999',
    'an admin still cannot edit a wallet directly from a user session');
commit;

-- =============================================================================
\echo '== 7. Notifications ========================================================'
-- =============================================================================

do $$
declare
  v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
  v_bob   uuid := (select id from wp_test.fixtures where name = 'bob');
begin
  -- Written by the system through the service role, never by the client.
  insert into public.notifications (user_id, type, title, body, action_url)
  values
    (v_alice, 'welcome', 'Welcome to WritePilot', 'Your credits are ready.', '/dashboard'),
    (v_alice, 'low_credits', '4 credits remaining', 'Top up to keep going.', '/usage'),
    (v_bob,   'welcome', 'Welcome to WritePilot', null, '/dashboard');

  perform wp_test.assert_eq(
    (select count(*)::int from public.notifications where user_id = v_alice and read_at is null),
    2, 'notifications start unread'
  );
end $$;

begin;
  set local role authenticated;
  set local request.jwt.claim.role = 'authenticated';

  do $$
  declare
    v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
    v_id    uuid;
  begin
    execute format('set local request.jwt.claim.sub = %L', v_alice);

    perform wp_test.assert_eq(
      (select count(*)::int from public.notifications), 2,
      'a user sees only their own notifications'
    );

    select id into v_id from public.notifications
    where user_id = v_alice and type = 'welcome';

    update public.notifications set read_at = now() where id = v_id;
    perform wp_test.assert(
      (select read_at from public.notifications where id = v_id) is not null,
      'a user can mark their own notification as read'
    );

    -- The column guard restores everything except read_at rather than raising.
    update public.notifications
    set title = 'Tampered', body = 'Tampered', action_url = '/admin'
    where id = v_id;

    perform wp_test.assert_eq(
      (select title from public.notifications where id = v_id),
      'Welcome to WritePilot',
      'a user cannot rewrite a notification''s title'
    );
    perform wp_test.assert_eq(
      (select action_url from public.notifications where id = v_id),
      '/dashboard',
      'a user cannot rewrite a notification''s action link'
    );

    -- Reassigning ownership is blocked by the policy's WITH CHECK clause,
    -- before the guard is even reached.
    perform wp_test.assert_eq(
      (select count(*)::int from public.notifications where user_id <> v_alice),
      0, 'a user cannot see another user''s notifications after an update attempt'
    );
  end $$;

  select wp_test.assert_denied(
    $q$insert into public.notifications (user_id, title)
       select id, 'Forged' from wp_test.fixtures where name = 'alice'$q$,
    'a user cannot create their own notifications');
commit;

do $$
declare v_bob uuid := (select id from wp_test.fixtures where name = 'bob');
begin
  perform wp_test.assert_eq(
    (select count(*)::int from public.notifications where user_id = v_bob),
    1, 'another user''s notifications are untouched'
  );
end $$;

-- =============================================================================
\echo '== 8. Cleanup =============================================================='
-- =============================================================================

do $$ begin
  delete from auth.users where email like '%@writepilot.test';
  perform wp_test.assert_eq(
    (select count(*)::int from public.profiles
     where email like '%@writepilot.test'),
    0, 'deleting an auth user cascades to their application data'
  );
  delete from wp_test.fixtures;
end $$;

\echo ''
\echo 'All database tests passed.'
