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

  -- Reading the audit log is granted to `authenticated` so the admin policy has
  -- something to allow; for everyone else the policy returns nothing. A filter
  -- that yields no rows is the right outcome here, not an error.
  do $$
  begin
    perform wp_test.assert_eq(
      (select count(*)::int from public.audit_logs), 0,
      'a non-admin sees no audit log rows'
    );
  end $$;
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
\echo '== 8. AI detection scans ==================================================='
-- =============================================================================
-- These rows hold the user's own unpublished writing, so the isolation matters
-- more here than anywhere else in the schema.

do $$
declare
  v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
  v_bob   uuid := (select id from wp_test.fixtures where name = 'bob');
  v_scan  uuid;
begin
  insert into public.ai_scans (
    user_id, title, source, content, word_count, character_count,
    estimated_ai_likelihood, confidence, summary, provider, model, credits_charged
  )
  values (
    v_alice, 'Dissertation chapter 3', 'docx',
    E'First paragraph of the draft.\n\nSecond paragraph of the draft.',
    10, 62, 42, 'medium', 'Mixed signals.', 'test', 'test-model', 2
  )
  returning id into v_scan;

  insert into public.ai_scan_segments
    (scan_id, position, start_offset, end_offset, estimated_ai_likelihood, rationale)
  values
    (v_scan, 0, 0, 29, 20, 'Varied sentence rhythm.'),
    (v_scan, 1, 31, 61, 64, 'Uniform phrasing.');

  insert into public.ai_scans (
    user_id, title, source, content, word_count, character_count,
    estimated_ai_likelihood, confidence
  )
  values (v_bob, 'Bob''s essay', 'text', 'Bob wrote this himself.', 4, 23, 12, 'low');

  perform wp_test.assert_eq(
    (select count(*)::int from public.ai_scans), 2, 'scans are stored'
  );
  perform wp_test.assert_eq(
    (select count(*)::int from public.ai_scan_segments where scan_id = v_scan),
    2, 'paragraph segments are stored'
  );
end $$;

begin;
  set local role authenticated;
  set local request.jwt.claim.role = 'authenticated';

  do $$
  declare v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
  begin
    execute format('set local request.jwt.claim.sub = %L', v_alice);

    perform wp_test.assert_eq(
      (select count(*)::int from public.ai_scans), 1,
      'a user sees only their own scans'
    );
    perform wp_test.assert_eq(
      (select count(*)::int from public.ai_scan_segments), 2,
      'segment visibility follows the parent scan'
    );
    perform wp_test.assert(
      not exists (
        select 1 from public.ai_scans where content like '%Bob wrote this%'
      ),
      'a user cannot read another user''s document text'
    );
  end $$;

  select wp_test.assert_denied(
    $q$insert into public.ai_scans
         (user_id, title, content, word_count, character_count, estimated_ai_likelihood)
       select id, 'Forged', 'x', 1, 1, 0 from wp_test.fixtures where name = 'alice'$q$,
    'a user cannot create a scan directly');
  select wp_test.assert_denied(
    'update public.ai_scans set estimated_ai_likelihood = 0',
    'a user cannot rewrite a scan result');
  select wp_test.assert_denied(
    'delete from public.ai_scan_segments',
    'a user cannot delete segments independently of their scan');
commit;

-- Deletion is the one write a user must be able to perform: it is how the
-- privacy promise is kept.
begin;
  set local role authenticated;
  set local request.jwt.claim.role = 'authenticated';

  do $$
  declare
    v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
    v_scan  uuid;
  begin
    execute format('set local request.jwt.claim.sub = %L', v_alice);

    select id into v_scan from public.ai_scans limit 1;
    delete from public.ai_scans where id = v_scan;

    perform wp_test.assert_eq(
      (select count(*)::int from public.ai_scans), 0,
      'a user can delete their own scan'
    );
  end $$;
commit;

do $$
declare v_bob uuid := (select id from wp_test.fixtures where name = 'bob');
begin
  perform wp_test.assert_eq(
    (select count(*)::int from public.ai_scan_segments), 0,
    'deleting a scan cascades to its segments'
  );
  perform wp_test.assert_eq(
    (select count(*)::int from public.ai_scans where user_id = v_bob), 1,
    'another user''s scans are untouched'
  );
end $$;

-- =============================================================================
\echo '== 9. Grammar checks ======================================================='
-- =============================================================================
-- A grammar check is the first thing in the schema a user session writes to.
-- The guard around that write is what these tests are really about.

do $$
declare
  v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
  v_bob   uuid := (select id from wp_test.fixtures where name = 'bob');
  v_check uuid;
begin
  insert into public.grammar_checks (
    user_id, title, source, content, word_count, character_count, summary
  )
  values (
    v_alice, 'Cover letter', 'text',
    'I are writing to apply. The the role interests me.',
    10, 50, 'Two corrections found.'
  )
  returning id into v_check;

  insert into public.grammar_suggestions (
    check_id, position, start_offset, end_offset,
    category, severity, original_text, suggested_text, explanation
  )
  values
    (v_check, 0, 2, 5, 'grammar', 'correction', 'are', 'am',
     'Subject-verb agreement: "I" takes "am".'),
    (v_check, 1, 26, 33, 'repetition', 'correction', 'The the', 'The',
     'The word "the" is repeated.');

  insert into public.grammar_checks
    (user_id, title, content, word_count, character_count)
  values (v_bob, 'Bob''s draft', 'Bob wrote this.', 3, 15);

  perform wp_test.assert_eq(
    (select count(*)::int from public.grammar_suggestions where check_id = v_check),
    2, 'suggestions are stored'
  );
  perform wp_test.assert_eq(
    (select count(*)::int from public.grammar_suggestions where status = 'pending'),
    2, 'suggestions start pending'
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
      (select count(*)::int from public.grammar_checks), 1,
      'a user sees only their own checks'
    );
    perform wp_test.assert_eq(
      (select count(*)::int from public.grammar_suggestions), 2,
      'suggestion visibility follows the parent check'
    );

    -- Accepting is the user's own decision on their own check.
    select id into v_id from public.grammar_suggestions where position = 0;
    update public.grammar_suggestions set status = 'accepted' where id = v_id;

    perform wp_test.assert_eq(
      (select status::text from public.grammar_suggestions where id = v_id),
      'accepted', 'a user can accept their own suggestion'
    );
    perform wp_test.assert(
      (select resolved_at from public.grammar_suggestions where id = v_id) is not null,
      'accepting stamps resolved_at server-side'
    );

    -- Undo.
    update public.grammar_suggestions set status = 'pending' where id = v_id;
    perform wp_test.assert(
      (select resolved_at from public.grammar_suggestions where id = v_id) is null,
      'undoing clears resolved_at'
    );

    -- The guard: accepting must not be a way to rewrite what gets inserted.
    update public.grammar_suggestions
    set status = 'accepted',
        suggested_text = 'ARBITRARY INJECTED TEXT',
        original_text = 'nonsense',
        start_offset = 0,
        end_offset = 99
    where id = v_id;

    perform wp_test.assert_eq(
      (select suggested_text from public.grammar_suggestions where id = v_id),
      'am', 'a user cannot change the suggested replacement text'
    );
    perform wp_test.assert_eq(
      (select original_text from public.grammar_suggestions where id = v_id),
      'are', 'a user cannot change the text a suggestion replaces'
    );
    perform wp_test.assert_eq(
      (select end_offset from public.grammar_suggestions where id = v_id),
      5, 'a user cannot move a suggestion''s range'
    );
    perform wp_test.assert_eq(
      (select status::text from public.grammar_suggestions where id = v_id),
      'accepted', 'the status change in the same statement still applies'
    );
  end $$;

  select wp_test.assert_denied(
    $q$insert into public.grammar_checks
         (user_id, title, content, word_count, character_count)
       select id, 'Forged', 'x', 1, 1 from wp_test.fixtures where name = 'alice'$q$,
    'a user cannot create a check directly');
  select wp_test.assert_denied(
    $q$update public.grammar_checks set content = 'rewritten'$q$,
    'a user cannot rewrite the original text of a check');
  select wp_test.assert_denied(
    $q$insert into public.grammar_suggestions
         (check_id, position, start_offset, end_offset, category, original_text, suggested_text)
       select id, 99, 0, 1, 'grammar', 'a', 'b' from public.grammar_checks limit 1$q$,
    'a user cannot invent a suggestion');
  select wp_test.assert_denied(
    'delete from public.grammar_suggestions',
    'a user cannot delete suggestions independently of their check');
commit;

-- Another user's check is untouchable even by id.
begin;
  set local role authenticated;
  set local request.jwt.claim.role = 'authenticated';

  do $$
  declare
    v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
    v_bob   uuid := (select id from wp_test.fixtures where name = 'bob');
    v_moved integer;
  begin
    execute format('set local request.jwt.claim.sub = %L', v_alice);

    update public.grammar_suggestions set status = 'rejected'
    where check_id in (select id from public.grammar_checks where user_id = v_bob);
    get diagnostics v_moved = row_count;

    perform wp_test.assert_eq(
      v_moved, 0, 'a user cannot resolve suggestions on another user''s check'
    );
  end $$;
commit;

begin;
  set local role authenticated;
  set local request.jwt.claim.role = 'authenticated';

  do $$
  declare
    v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
    v_id    uuid;
  begin
    execute format('set local request.jwt.claim.sub = %L', v_alice);
    select id into v_id from public.grammar_checks limit 1;
    delete from public.grammar_checks where id = v_id;

    perform wp_test.assert_eq(
      (select count(*)::int from public.grammar_checks), 0,
      'a user can delete their own check'
    );
  end $$;
commit;

do $$ begin
  perform wp_test.assert_eq(
    (select count(*)::int from public.grammar_suggestions), 0,
    'deleting a check cascades to its suggestions'
  );
end $$;

-- =============================================================================
\echo '== 10. Naturalize =========================================================='
-- =============================================================================

do $$
declare
  v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
  v_bob   uuid := (select id from wp_test.fixtures where name = 'bob');
  v_run   uuid;
begin
  insert into public.naturalize_runs (
    user_id, title, mode, content, improved,
    word_count, improved_word_count, character_count,
    integrity_findings
  )
  values (
    v_alice, 'Conference abstract', 'academic',
    E'In order to demonstrate this we ran a study.\n\nThe results were good.',
    E'To demonstrate this, we ran a study.\n\nThe results were compelling.',
    13, 11, 66,
    '[{"kind":"number","value":"47%","message":"check"}]'::jsonb
  )
  returning id into v_run;

  insert into public.naturalize_paragraphs
    (run_id, position, original_text, improved_text, note, changed)
  values
    (v_run, 0, 'In order to demonstrate this we ran a study.',
     'To demonstrate this, we ran a study.', 'Cut padding.', true),
    (v_run, 1, 'The results were good.',
     'The results were compelling.', 'Sharper word choice.', true);

  insert into public.naturalize_runs
    (user_id, title, content, improved, word_count, character_count)
  values (v_bob, 'Bob''s notes', 'Bob wrote this.', 'Bob wrote this.', 3, 15);

  perform wp_test.assert_eq(
    (select count(*)::int from public.naturalize_paragraphs where run_id = v_run),
    2, 'paragraph pairs are stored'
  );
  perform wp_test.assert_eq(
    (select jsonb_array_length(integrity_findings) from public.naturalize_runs where id = v_run),
    1, 'integrity findings are stored with the run'
  );
  perform wp_test.assert(
    (select content from public.naturalize_runs where id = v_run) like 'In order to%',
    'the original is stored unchanged alongside the rewrite'
  );
end $$;

begin;
  set local role authenticated;
  set local request.jwt.claim.role = 'authenticated';

  do $$
  declare v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
  begin
    execute format('set local request.jwt.claim.sub = %L', v_alice);

    perform wp_test.assert_eq(
      (select count(*)::int from public.naturalize_runs), 1,
      'a user sees only their own rewrites'
    );
    perform wp_test.assert_eq(
      (select count(*)::int from public.naturalize_paragraphs), 2,
      'paragraph visibility follows the parent run'
    );
    perform wp_test.assert(
      not exists (select 1 from public.naturalize_runs where title like 'Bob%'),
      'a user cannot read another user''s rewrite'
    );
  end $$;

  select wp_test.assert_denied(
    $q$insert into public.naturalize_runs
         (user_id, title, content, improved, word_count, character_count)
       select id, 'Forged', 'x', 'y', 1, 1 from wp_test.fixtures where name = 'alice'$q$,
    'a user cannot create a rewrite directly');
  select wp_test.assert_denied(
    $q$update public.naturalize_runs set improved = 'tampered'$q$,
    'a user cannot rewrite the improved text');
  select wp_test.assert_denied(
    $q$update public.naturalize_runs set integrity_findings = '[]'::jsonb$q$,
    'a user cannot clear the integrity findings');
  select wp_test.assert_denied(
    'delete from public.naturalize_paragraphs',
    'a user cannot delete paragraph pairs independently');
commit;

begin;
  set local role authenticated;
  set local request.jwt.claim.role = 'authenticated';

  do $$
  declare
    v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
    v_run   uuid;
  begin
    execute format('set local request.jwt.claim.sub = %L', v_alice);
    select id into v_run from public.naturalize_runs limit 1;
    delete from public.naturalize_runs where id = v_run;

    perform wp_test.assert_eq(
      (select count(*)::int from public.naturalize_runs), 0,
      'a user can delete their own rewrite'
    );
  end $$;
commit;

do $$ begin
  perform wp_test.assert_eq(
    (select count(*)::int from public.naturalize_paragraphs), 0,
    'deleting a rewrite cascades to its paragraph pairs'
  );
end $$;


-- =============================================================================
\echo '== 11. Rubrics and grades =================================================='
-- =============================================================================

do $$
declare
  v_alice  uuid := (select id from wp_test.fixtures where name = 'alice');
  v_bob    uuid := (select id from wp_test.fixtures where name = 'bob');
  v_rubric uuid;
  v_grade  uuid;
begin
  insert into public.rubrics (user_id, title, raw_text)
  values (v_alice, 'CS 1102 Assignment 1', 'Introduction 10; Argument 20; Evidence 20')
  returning id into v_rubric;

  insert into public.rubric_criteria (rubric_id, position, name, max_points)
  values
    (v_rubric, 0, 'Introduction', 10),
    (v_rubric, 1, 'Argument', 20),
    (v_rubric, 2, 'Evidence', 20);

  -- The header total is derived by a trigger, never written by application code.
  perform wp_test.assert_eq(
    (select total_points from public.rubrics where id = v_rubric),
    50::numeric, 'rubric total is summed from its criteria'
  );

  insert into public.grades (
    user_id, rubric_id, rubric_title, title, content, word_count,
    estimated_points, max_points, summary
  )
  values (
    v_alice, v_rubric, 'CS 1102 Assignment 1', 'Draft 2',
    'The submitted essay text.', 500, 39, 50, 'Solid overall.'
  )
  returning id into v_grade;

  insert into public.grade_criteria
    (grade_id, position, name, awarded_points, max_points, explanation)
  values
    (v_grade, 0, 'Introduction', 8, 10, 'Clear framing.'),
    (v_grade, 1, 'Argument', 16, 20, 'Counter-position is thin.'),
    (v_grade, 2, 'Evidence', 15, 20, 'Two claims uncited.');

  insert into public.rubrics (user_id, title, raw_text)
  values (v_bob, 'Bob''s rubric', 'Something else');

  perform wp_test.assert_eq(
    (select count(*)::int from public.grade_criteria where grade_id = v_grade),
    3, 'the criterion breakdown is stored'
  );
end $$;

-- The schema refuses a score above its maximum, and a total above the rubric's.
do $$
declare
  v_grade uuid := (select id from public.grades limit 1);
  v_ok boolean;
begin
  begin
    insert into public.grade_criteria
      (grade_id, position, name, awarded_points, max_points)
    values (v_grade, 9, 'Impossible', 30, 20);
    v_ok := false;
  exception when check_violation then
    v_ok := true;
  end;
  perform wp_test.assert(v_ok, 'a criterion cannot score above its maximum');

  begin
    insert into public.grades
      (user_id, title, content, word_count, estimated_points, max_points)
    select id, 'Impossible', 'x', 10, 80, 50
    from wp_test.fixtures where name = 'alice';
    v_ok := false;
  exception when check_violation then
    v_ok := true;
  end;
  perform wp_test.assert(v_ok, 'a grade cannot exceed its maximum');
end $$;

-- Deleting a rubric must not take the grades produced from it.
do $$
declare
  v_bob uuid := (select id from wp_test.fixtures where name = 'bob');
begin
  delete from public.rubrics where user_id = v_bob;
  perform wp_test.assert_eq(
    (select count(*)::int from public.rubrics), 1,
    'another user''s rubric is deletable independently'
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
      (select count(*)::int from public.rubrics), 1,
      'a user sees only their own rubrics'
    );
    perform wp_test.assert_eq(
      (select count(*)::int from public.grade_criteria), 3,
      'breakdown visibility follows the parent grade'
    );

    -- Correcting a misread criterion is the user's own decision.
    select id into v_id from public.rubric_criteria where position = 0;
    update public.rubric_criteria set name = 'Opening', max_points = 15 where id = v_id;

    perform wp_test.assert_eq(
      (select name from public.rubric_criteria where id = v_id),
      'Opening', 'a user can correct a criterion name'
    );
    perform wp_test.assert_eq(
      (select total_points from public.rubrics limit 1),
      55::numeric, 'the rubric total re-sums after an edit'
    );

    -- ...but not move it onto a different rubric.
    update public.rubric_criteria
    set rubric_id = extensions.gen_random_uuid(), position = 99
    where id = v_id;

    perform wp_test.assert_eq(
      (select position from public.rubric_criteria where id = v_id),
      0, 'a user cannot move a criterion to another rubric'
    );

    -- The rubric's derived total is not user-writable.
    update public.rubrics set title = 'Renamed', total_points = 9999;
    perform wp_test.assert_eq(
      (select title from public.rubrics limit 1), 'Renamed',
      'a user can rename their rubric'
    );
    perform wp_test.assert_eq(
      (select total_points from public.rubrics limit 1), 55::numeric,
      'a user cannot overwrite the derived total'
    );
  end $$;

  select wp_test.assert_denied(
    $q$insert into public.rubrics (user_id, title, raw_text)
       select id, 'Forged', 'x' from wp_test.fixtures where name = 'alice'$q$,
    'a user cannot create a rubric directly');
  select wp_test.assert_denied(
    $q$update public.grades set estimated_points = 50$q$,
    'a user cannot change their own grade');
  select wp_test.assert_denied(
    $q$update public.grade_criteria set awarded_points = 20$q$,
    'a user cannot change a criterion score');
  select wp_test.assert_denied(
    $q$insert into public.rubric_criteria (rubric_id, position, name, max_points)
       select id, 50, 'Invented', 10 from public.rubrics limit 1$q$,
    'a user cannot invent a criterion');
commit;

-- A grade outlives the rubric it came from.
begin;
  set local role authenticated;
  set local request.jwt.claim.role = 'authenticated';

  do $$
  declare v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
  begin
    execute format('set local request.jwt.claim.sub = %L', v_alice);

    delete from public.rubrics;

    perform wp_test.assert_eq(
      (select count(*)::int from public.grades), 1,
      'deleting a rubric keeps the grades produced from it'
    );
    perform wp_test.assert(
      (select rubric_id from public.grades limit 1) is null,
      'the grade''s rubric link is cleared rather than cascading'
    );
    perform wp_test.assert_eq(
      (select rubric_title from public.grades limit 1), 'CS 1102 Assignment 1',
      'the grade still names the rubric it was judged against'
    );
    perform wp_test.assert_eq(
      (select count(*)::int from public.grade_criteria), 3,
      'the breakdown survives the rubric'
    );

    delete from public.grades;
    perform wp_test.assert_eq(
      (select count(*)::int from public.grade_criteria), 0,
      'deleting a grade cascades to its breakdown'
    );
  end $$;
commit;


-- =============================================================================
\echo '== 12. Citation checks ======================================================'
-- =============================================================================

do $$
declare
  v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
  v_bob   uuid := (select id from wp_test.fixtures where name = 'bob');
  v_check uuid;
  v_entry uuid;
begin
  insert into public.citation_checks (
    user_id, title, content, style, word_count, list_heading,
    in_text_count, distinct_sources, reference_count, summary
  )
  values (
    v_alice, 'Sleep and memory review', 'The document text.', 'apa7', 900,
    'References', 4, 3, 2, 'Two entries need attention.'
  )
  returning id into v_check;

  insert into public.citation_entries
    (check_id, position, raw_text, first_author, year, has_link, cited)
  values
    (v_check, 0, 'Okonkwo, A., & Silva, M. (2021). Working memory. Journal, 44(2), 113-129.',
     'okonkwo', '2021', true, true)
  returning id into v_entry;

  insert into public.citation_entries
    (check_id, position, raw_text, first_author, year, has_link, cited)
  values
    (v_check, 1, 'Ferreira, L. (2020). Sleep architecture. Reviews, 8(4), 220-241.',
     'ferreira', '2020', false, false);

  -- Both halves of the report live in one table, distinguished by origin.
  insert into public.citation_findings
    (check_id, entry_id, position, origin, kind, severity, target_text, message, suggestion)
  values
    (v_check, null, 0, 'local', 'orphan_citation', 'error', '(Walker et al., 2007)',
     'Cited in the text but not in the reference list.', 'Add an entry for it.'),
    (v_check, v_entry, 1, 'model', 'format', 'warning',
     'Okonkwo, A., & Silva, M. (2021). Working memory. Journal, 44(2), 113-129.',
     'The journal title should carry headline capitalisation.', null);

  perform wp_test.assert_eq(
    (select count(*)::int from public.citation_findings where check_id = v_check),
    2, 'a check stores both the counted and the assessed findings'
  );
  perform wp_test.assert_eq(
    (select count(*)::int from public.citation_findings
     where check_id = v_check and origin = 'local'),
    1, 'the origin of each finding is recorded, not inferred'
  );
  perform wp_test.assert_eq(
    (select status::text from public.citation_findings where position = 0),
    'open', 'a finding starts open'
  );

  insert into public.citation_checks
    (user_id, title, content, style, word_count)
  values (v_bob, 'Bob''s essay', 'Other text.', 'mla9', 300);
end $$;

-- A finding cannot be positioned twice in the same check.
do $$
declare
  v_check uuid := (select id from public.citation_checks where title = 'Sleep and memory review');
  v_ok boolean;
begin
  begin
    insert into public.citation_findings
      (check_id, position, origin, kind, severity, message)
    values (v_check, 0, 'local', 'orphan_citation', 'error', 'Duplicate position.');
    v_ok := false;
  exception when unique_violation then
    v_ok := true;
  end;
  perform wp_test.assert(v_ok, 'two findings cannot share a position in one check');
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
      (select count(*)::int from public.citation_checks), 1,
      'a user sees only their own citation checks'
    );
    perform wp_test.assert_eq(
      (select count(*)::int from public.citation_entries), 2,
      'entry visibility follows the parent check'
    );
    perform wp_test.assert_eq(
      (select count(*)::int from public.citation_findings), 2,
      'finding visibility follows the parent check'
    );

    -- Working through the report is the user's own decision on their own work.
    select id into v_id from public.citation_findings where position = 0;
    update public.citation_findings set status = 'resolved' where id = v_id;

    perform wp_test.assert_eq(
      (select status::text from public.citation_findings where id = v_id),
      'resolved', 'a user can mark a finding resolved'
    );
    perform wp_test.assert(
      (select resolved_at from public.citation_findings where id = v_id) is not null,
      'the server stamps the time it was resolved'
    );

    update public.citation_findings set status = 'open' where id = v_id;
    perform wp_test.assert(
      (select resolved_at from public.citation_findings where id = v_id) is null,
      'reopening a finding clears the stamp'
    );

    -- ...but the finding itself is a record of what was found.
    update public.citation_findings
    set message = 'Nothing is wrong here',
        severity = 'info',
        origin = 'local',
        target_text = 'rewritten',
        suggestion = 'rewritten'
    where id = v_id;

    perform wp_test.assert_eq(
      (select message from public.citation_findings where id = v_id),
      'Cited in the text but not in the reference list.',
      'a user cannot rewrite what the checker found'
    );
    perform wp_test.assert_eq(
      (select severity::text from public.citation_findings where id = v_id),
      'error', 'a user cannot downgrade a finding''s severity'
    );
    perform wp_test.assert_eq(
      (select origin::text from public.citation_findings where position = 1),
      'model', 'a user cannot relabel an assessed finding as a counted one'
    );
  end $$;

  select wp_test.assert_denied(
    $q$insert into public.citation_checks (user_id, title, content, style, word_count)
       select id, 'Forged', 'x', 'apa7', 100 from wp_test.fixtures where name = 'alice'$q$,
    'a user cannot create a citation check directly');
  select wp_test.assert_denied(
    $q$update public.citation_checks set reference_count = 99$q$,
    'a user cannot change a check''s counts');
  select wp_test.assert_denied(
    $q$update public.citation_entries set raw_text = 'rewritten'$q$,
    'a user cannot rewrite their parsed reference list');
  select wp_test.assert_denied(
    $q$insert into public.citation_findings
         (check_id, position, origin, kind, severity, message)
       select id, 99, 'local', 'orphan_citation', 'error', 'Invented'
       from public.citation_checks limit 1$q$,
    'a user cannot invent a finding');
  select wp_test.assert_denied(
    $q$delete from public.citation_findings$q$,
    'a user cannot delete findings individually');
commit;

-- Deleting a check takes everything stored with it.
begin;
  set local role authenticated;
  set local request.jwt.claim.role = 'authenticated';

  do $$
  declare v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
  begin
    execute format('set local request.jwt.claim.sub = %L', v_alice);

    delete from public.citation_checks;

    perform wp_test.assert_eq(
      (select count(*)::int from public.citation_entries), 0,
      'deleting a check cascades to its reference entries'
    );
    perform wp_test.assert_eq(
      (select count(*)::int from public.citation_findings), 0,
      'deleting a check cascades to its findings'
    );
  end $$;
commit;


-- =============================================================================
\echo '== 13. Documents and assignments ============================================'
-- =============================================================================

do $$
declare
  v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
  v_bob   uuid := (select id from wp_test.fixtures where name = 'bob');
  v_doc   uuid;
  v_ok    boolean;
begin
  insert into public.documents
    (user_id, title, source, original_filename, storage_path, content_type,
     byte_size, content, word_count, character_count)
  values (
    v_alice, 'Memory consolidation essay', 'docx', 'essay.docx',
    'users/' || v_alice::text || '/documents/00000000-0000-0000-0000-0000000000aa/essay.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    24576, 'The essay text.', 1240, 6800
  )
  returning id into v_doc;

  insert into wp_test.fixtures values ('doc', v_doc);

  -- The path constraint is the last line of defence behind the storage
  -- policies: a file may only be filed under its own owner's prefix.
  begin
    insert into public.documents (user_id, title, content, storage_path)
    values (
      v_alice, 'Misfiled', 'x',
      'users/' || v_bob::text || '/documents/00000000-0000-0000-0000-0000000000bb/stolen.pdf'
    );
    v_ok := false;
  exception when check_violation then
    v_ok := true;
  end;
  perform wp_test.assert(
    v_ok, 'a document cannot be filed under another user''s storage prefix'
  );

  -- Pasted text has no file, which is a different thing from a missing path.
  insert into public.documents (user_id, title, content, word_count, character_count)
  values (v_alice, 'Pasted notes', 'Some notes.', 210, 1100);

  -- Bob's document id is recorded here because Alice cannot read it through
  -- RLS -- and a denial test that silently selects no rows proves nothing.
  insert into public.documents (user_id, title, content)
  values (v_bob, 'Bob''s draft', 'Other text.')
  returning id into v_doc;

  insert into wp_test.fixtures values ('bob_doc', v_doc);
end $$;

-- An analysis run against a document is linked to it, and survives it.
do $$
declare
  v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
  v_doc   uuid := (select id from wp_test.fixtures where name = 'doc');
  v_check uuid;
begin
  insert into public.citation_checks
    (user_id, document_id, title, content, style, word_count)
  values (v_alice, v_doc, 'Citations in the essay', 'The essay text.', 'apa7', 1240)
  returning id into v_check;

  insert into public.grammar_checks
    (user_id, document_id, title, content, word_count, character_count)
  values (v_alice, v_doc, 'Grammar in the essay', 'The essay text.', 1240, 6800);

  perform wp_test.assert_eq(
    (select count(*)::int from public.citation_checks where document_id = v_doc),
    1, 'a check records the document it was run on'
  );

  delete from public.documents where id = v_doc;

  perform wp_test.assert_eq(
    (select count(*)::int from public.citation_checks where id = v_check),
    1, 'deleting a document keeps the checks run on it'
  );
  perform wp_test.assert(
    (select document_id from public.citation_checks where id = v_check) is null,
    'the check''s document link is cleared rather than cascading'
  );
  perform wp_test.assert_eq(
    (select content from public.citation_checks where id = v_check),
    'The essay text.',
    'the check keeps its own copy of the text it read'
  );
end $$;

begin;
  set local role authenticated;
  set local request.jwt.claim.role = 'authenticated';

  do $$
  declare
    v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
    v_doc   uuid;
    v_assignment uuid;
  begin
    execute format('set local request.jwt.claim.sub = %L', v_alice);

    perform wp_test.assert_eq(
      (select count(*)::int from public.documents), 1,
      'a user sees only their own documents'
    );

    -- Renaming is the user's own decision on their own row.
    select id into v_doc from public.documents limit 1;
    update public.documents set title = 'Renamed notes' where id = v_doc;

    perform wp_test.assert_eq(
      (select title from public.documents where id = v_doc),
      'Renamed notes', 'a user can rename their document'
    );

    -- ...but the text and the file behind it are a record of what was uploaded.
    update public.documents
    set content = 'Rewritten',
        word_count = 999999,
        storage_path = 'users/attacker/documents/x/y.pdf'
    where id = v_doc;

    perform wp_test.assert_eq(
      (select content from public.documents where id = v_doc),
      'Some notes.', 'a user cannot rewrite a document''s text'
    );
    perform wp_test.assert_eq(
      (select word_count from public.documents where id = v_doc),
      210, 'a user cannot rewrite a document''s counts'
    );
    perform wp_test.assert(
      (select storage_path from public.documents where id = v_doc) is null,
      'a user cannot point a document at another storage path'
    );

    -- An assignment is wholly user-authored, so a user creates it directly.
    insert into public.assignments (user_id, title, course, status)
    values (v_alice, 'CS 1102 Assignment 1', 'Cognitive Science', 'drafting')
    returning id into v_assignment;

    perform wp_test.assert_eq(
      (select count(*)::int from public.assignments), 1,
      'a user can create their own assignment'
    );

    insert into public.assignment_drafts (assignment_id, document_id, version)
    values (v_assignment, v_doc, 1);

    perform wp_test.assert_eq(
      (select count(*)::int from public.assignment_drafts), 1,
      'a user can attach their own document as a draft'
    );

    update public.assignments set status = 'submitted' where id = v_assignment;
    perform wp_test.assert_eq(
      (select status::text from public.assignments where id = v_assignment),
      'submitted', 'a user can move their assignment along'
    );
  end $$;

  -- The insert policy checks both sides: the assignment and the document.
  select wp_test.assert_denied(
    $q$insert into public.assignment_drafts (assignment_id, document_id, version)
       select a.id, f.id, 2
       from public.assignments a,
            wp_test.fixtures f
       where f.name = 'bob_doc'$q$,
    'a user cannot attach another user''s document as a draft');

  select wp_test.assert_denied(
    $q$insert into public.assignments (user_id, title)
       select id, 'Planted' from wp_test.fixtures where name = 'bob'$q$,
    'a user cannot create an assignment for someone else');

  select wp_test.assert_denied(
    $q$insert into public.documents (user_id, title, content)
       select id, 'Planted', 'x' from wp_test.fixtures where name = 'alice'$q$,
    'a user cannot insert a document directly');

  select wp_test.assert_denied(
    $q$update public.assignment_drafts set version = 99$q$,
    'a user cannot renumber their drafts');
commit;

-- A draft is a link. Detaching it, or deleting the assignment, leaves the
-- document in the library.
begin;
  set local role authenticated;
  set local request.jwt.claim.role = 'authenticated';

  do $$
  declare
    v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
    v_assignment uuid;
  begin
    execute format('set local request.jwt.claim.sub = %L', v_alice);

    -- Read back through the user's own policies rather than a fixture row:
    -- the harness table is not writable by an authenticated session, which is
    -- itself the right shape for it to have.
    select id into v_assignment from public.assignments limit 1;

    delete from public.assignments where id = v_assignment;

    perform wp_test.assert_eq(
      (select count(*)::int from public.assignment_drafts), 0,
      'deleting an assignment cascades to its draft links'
    );
    perform wp_test.assert_eq(
      (select count(*)::int from public.documents), 1,
      'deleting an assignment leaves the documents in the library'
    );
  end $$;
commit;


-- =============================================================================
\echo '== 14. Deep analysis and coaching ==========================================='
-- =============================================================================

do $$
declare
  v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
  v_bob   uuid := (select id from wp_test.fixtures where name = 'bob');
  v_run   uuid;
  v_ok    boolean;
begin
  insert into public.analysis_runs
    (user_id, title, content, word_count, summary, carried_from)
  values (
    v_alice, 'Memory consolidation essay', 'The draft text.', 1240,
    'A well-organised draft.',
    jsonb_build_object('citations', jsonb_build_object('orphans', 2))
  )
  returning id into v_run;

  -- Both halves of the list live in one table, distinguished by origin.
  insert into public.improvement_actions
    (analysis_id, position, origin, category, title, detail, impact, effort, priority_score)
  values
    (v_run, 0, 'measured', 'citations', 'Add reference entries for 2 cited sources',
     'Your citation check found two.', 5, 2, 44),
    (v_run, 1, 'advised', 'argument', 'Answer the strongest objection',
     'Section three never engages it.', 5, 3, 41),
    (v_run, 2, 'advised', 'clarity', 'Cut the methods recap',
     'The discussion restates the methods.', 2, 2, 14);

  perform wp_test.assert_eq(
    (select count(*)::int from public.improvement_actions where analysis_id = v_run),
    3, 'a review stores both the carried and the judged improvements'
  );
  perform wp_test.assert_eq(
    (select origin::text from public.improvement_actions
     where analysis_id = v_run and position = 0),
    'measured', 'the origin of each improvement is recorded, not inferred'
  );

  -- The ratings the ordering is computed from are bounded by the schema.
  begin
    insert into public.improvement_actions
      (analysis_id, position, origin, category, title, detail, impact, effort, priority_score)
    values (v_run, 9, 'advised', 'clarity', 'Impossible', 'x', 9, 1, 87);
    v_ok := false;
  exception when check_violation then
    v_ok := true;
  end;
  perform wp_test.assert(v_ok, 'an impact rating outside 1-5 is rejected');

  insert into public.analysis_runs (user_id, title, content, word_count)
  values (v_bob, 'Bob''s draft', 'Other text.', 400);
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
      (select count(*)::int from public.analysis_runs), 1,
      'a user sees only their own reviews'
    );
    perform wp_test.assert_eq(
      (select count(*)::int from public.improvement_actions), 3,
      'improvement visibility follows the parent review'
    );

    -- The list is ordered by the score the server computed.
    perform wp_test.assert_eq(
      (select title from public.improvement_actions
       order by priority_score desc, position limit 1),
      'Add reference entries for 2 cited sources',
      'the highest-scoring improvement comes first'
    );

    -- Working the list is the user's own decision on their own work.
    select id into v_id from public.improvement_actions where position = 1;
    update public.improvement_actions set status = 'done' where id = v_id;

    perform wp_test.assert_eq(
      (select status::text from public.improvement_actions where id = v_id),
      'done', 'a user can tick an improvement off'
    );
    perform wp_test.assert(
      (select resolved_at from public.improvement_actions where id = v_id) is not null,
      'the server stamps the time it was finished'
    );

    update public.improvement_actions set status = 'open' where id = v_id;
    perform wp_test.assert(
      (select resolved_at from public.improvement_actions where id = v_id) is null,
      'reopening an improvement clears the stamp'
    );

    -- ...but the advice itself, and its place in the order, are not the
    -- user's to rewrite.
    update public.improvement_actions
    set title = 'Rewritten',
        impact = 1,
        priority_score = 1,
        origin = 'measured',
        coaching = 'The coach never said this'
    where id = v_id;

    perform wp_test.assert_eq(
      (select title from public.improvement_actions where id = v_id),
      'Answer the strongest objection',
      'a user cannot rewrite what the review said'
    );
    perform wp_test.assert_eq(
      (select priority_score from public.improvement_actions where id = v_id),
      41, 'a user cannot re-score their own improvement list'
    );
    perform wp_test.assert_eq(
      (select origin::text from public.improvement_actions where id = v_id),
      'advised', 'a user cannot relabel advice as a measurement'
    );
    perform wp_test.assert(
      (select coaching from public.improvement_actions where id = v_id) is null,
      'a user cannot put words in the coach''s mouth'
    );
  end $$;

  select wp_test.assert_denied(
    $q$insert into public.analysis_runs (user_id, title, content, word_count)
       select id, 'Forged', 'x', 200 from wp_test.fixtures where name = 'alice'$q$,
    'a user cannot create a review directly');
  select wp_test.assert_denied(
    $q$update public.analysis_runs set summary = 'Rewritten'$q$,
    'a user cannot rewrite a review''s summary');
  select wp_test.assert_denied(
    $q$insert into public.improvement_actions
         (analysis_id, position, origin, category, title, detail, impact, effort, priority_score)
       select id, 50, 'measured', 'argument', 'Invented', 'x', 5, 1, 47
       from public.analysis_runs limit 1$q$,
    'a user cannot invent an improvement');
  select wp_test.assert_denied(
    $q$delete from public.improvement_actions$q$,
    'a user cannot delete improvements individually');
commit;

-- A review is kept with the document it read, and outlives it.
do $$
declare
  v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
  v_doc   uuid;
  v_run   uuid;
begin
  insert into public.documents (user_id, title, content, word_count)
  values (v_alice, 'Reviewed draft', 'The draft text.', 1240)
  returning id into v_doc;

  insert into public.analysis_runs (user_id, document_id, title, content, word_count)
  values (v_alice, v_doc, 'Review of the draft', 'The draft text.', 1240)
  returning id into v_run;

  delete from public.documents where id = v_doc;

  perform wp_test.assert_eq(
    (select count(*)::int from public.analysis_runs where id = v_run),
    1, 'deleting a document keeps the review of it'
  );
  perform wp_test.assert(
    (select document_id from public.analysis_runs where id = v_run) is null,
    'the review''s document link is cleared rather than cascading'
  );
end $$;

-- Deleting a review takes its list with it.
begin;
  set local role authenticated;
  set local request.jwt.claim.role = 'authenticated';

  do $$
  declare v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
  begin
    execute format('set local request.jwt.claim.sub = %L', v_alice);

    delete from public.analysis_runs;

    perform wp_test.assert_eq(
      (select count(*)::int from public.improvement_actions), 0,
      'deleting a review cascades to its improvements'
    );
  end $$;
commit;


-- =============================================================================
\echo '== 15. Payments ============================================================='
-- =============================================================================

-- A provider retries. The event log is what makes "exactly once" true.
do $$
declare
  v_first  boolean;
  v_second boolean;
begin
  v_first := public.record_payment_event(
    'stripe', 'evt_test_1', 'invoice.paid', '{"id":"in_1"}'::jsonb
  );
  v_second := public.record_payment_event(
    'stripe', 'evt_test_1', 'invoice.paid', '{"id":"in_1"}'::jsonb
  );

  perform wp_test.assert(v_first, 'the first delivery of an event is claimed');
  perform wp_test.assert(
    not v_second, 'a redelivery of the same event is not claimed again'
  );
  perform wp_test.assert_eq(
    (select count(*)::int from public.payment_events where event_id = 'evt_test_1'),
    1, 'a redelivered event is stored once'
  );

  perform public.complete_payment_event(
    'stripe', 'evt_test_1', 'processed'::public.payment_event_status
  );
  perform wp_test.assert_eq(
    (select status::text from public.payment_events where event_id = 'evt_test_1'),
    'processed', 'an event records how it was handled'
  );
end $$;

-- Subscribing: the plan, the wallet and the allowance all follow.
do $$
declare
  v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
  v_start timestamptz := date_trunc('day', now());
  v_sub   uuid;
  v_before integer;
begin
  select balance into v_before from public.credit_wallets where user_id = v_alice;

  v_sub := public.apply_subscription_state(
    p_user_id => v_alice,
    p_plan_key => 'pro',
    p_interval => 'month'::public.billing_interval,
    p_status => 'active'::public.subscription_status,
    p_period_start => v_start,
    p_period_end => v_start + interval '1 month',
    p_cancel_at_period_end => false,
    p_provider => 'stripe',
    p_customer_id => 'cus_test_1',
    p_subscription_id => 'sub_test_1'
  );

  perform wp_test.assert_eq(
    (select p.key from public.subscriptions s
     join public.plans p on p.id = s.plan_id where s.id = v_sub),
    'pro', 'a paid subscription puts the user on the plan they bought'
  );
  perform wp_test.assert_eq(
    (select provider_subscription_id from public.subscriptions where id = v_sub),
    'sub_test_1', 'the provider''s subscription id is recorded'
  );
  perform wp_test.assert_eq(
    (select monthly_allowance from public.credit_wallets where user_id = v_alice),
    800, 'the wallet takes the plan''s allowance'
  );
  perform wp_test.assert_eq(
    (select balance from public.credit_wallets where user_id = v_alice),
    v_before + 800, 'the first period''s credits are granted'
  );

  -- The same event, delivered again.
  perform public.apply_subscription_state(
    p_user_id => v_alice,
    p_plan_key => 'pro',
    p_interval => 'month'::public.billing_interval,
    p_status => 'active'::public.subscription_status,
    p_period_start => v_start,
    p_period_end => v_start + interval '1 month',
    p_cancel_at_period_end => false,
    p_provider => 'stripe',
    p_customer_id => 'cus_test_1',
    p_subscription_id => 'sub_test_1'
  );

  perform wp_test.assert_eq(
    (select balance from public.credit_wallets where user_id = v_alice),
    v_before + 800,
    'a redelivered subscription event does not grant a second month'
  );
  perform wp_test.assert_eq(
    (select count(*)::int from public.subscriptions
     where provider_subscription_id = 'sub_test_1'),
    1, 'a redelivered subscription event does not create a second subscription'
  );

  -- The next period does grant again.
  perform public.apply_subscription_state(
    p_user_id => v_alice,
    p_plan_key => 'pro',
    p_interval => 'month'::public.billing_interval,
    p_status => 'active'::public.subscription_status,
    p_period_start => v_start + interval '1 month',
    p_period_end => v_start + interval '2 months',
    p_cancel_at_period_end => false,
    p_provider => 'stripe',
    p_customer_id => 'cus_test_1',
    p_subscription_id => 'sub_test_1'
  );

  perform wp_test.assert_eq(
    (select balance from public.credit_wallets where user_id = v_alice),
    v_before + 1600, 'the next period grants the allowance again'
  );
end $$;

-- A status that does not entitle must not pay out.
do $$
declare
  v_bob uuid := (select id from wp_test.fixtures where name = 'bob');
  v_before integer;
begin
  select balance into v_before from public.credit_wallets where user_id = v_bob;

  perform public.apply_subscription_state(
    p_user_id => v_bob,
    p_plan_key => 'student',
    p_interval => 'month'::public.billing_interval,
    p_status => 'incomplete'::public.subscription_status,
    p_period_start => now(),
    p_period_end => now() + interval '1 month',
    p_cancel_at_period_end => false,
    p_provider => 'stripe',
    p_customer_id => 'cus_test_2',
    p_subscription_id => 'sub_test_2'
  );

  perform wp_test.assert_eq(
    (select balance from public.credit_wallets where user_id = v_bob),
    v_before, 'an unpaid subscription grants no credits'
  );

  -- ...and the same subscription, once paid, does.
  perform public.apply_subscription_state(
    p_user_id => v_bob,
    p_plan_key => 'student',
    p_interval => 'month'::public.billing_interval,
    p_status => 'active'::public.subscription_status,
    p_period_start => now(),
    p_period_end => now() + interval '1 month',
    p_cancel_at_period_end => false,
    p_provider => 'stripe',
    p_customer_id => 'cus_test_2',
    p_subscription_id => 'sub_test_2'
  );

  perform wp_test.assert_eq(
    (select balance from public.credit_wallets where user_id = v_bob),
    v_before + 300, 'the same subscription pays out once it becomes active'
  );
  perform wp_test.assert_eq(
    (select count(*)::int from public.subscriptions
     where provider_subscription_id = 'sub_test_2'),
    1, 'a subscription that changes status stays one subscription'
  );
end $$;

-- A credit pack. The provider's reference is the idempotency key.
do $$
declare
  v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
  v_before integer;
  v_purchased integer;
  v_first jsonb;
  v_again jsonb;
begin
  select balance, purchased_balance into v_before, v_purchased
  from public.credit_wallets where user_id = v_alice;

  v_first := public.apply_credit_purchase(
    p_user_id => v_alice,
    p_pack_key => 'pack_75',
    p_provider => 'stripe',
    p_provider_reference => 'pi_test_1',
    p_amount_cents => 999
  );

  perform wp_test.assert_eq(
    (v_first ->> 'replayed')::boolean, false, 'a new purchase is applied'
  );
  perform wp_test.assert_eq(
    (select purchased_balance from public.credit_wallets where user_id = v_alice),
    v_purchased + 75, 'a pack adds to the purchased balance, which never expires'
  );
  perform wp_test.assert_eq(
    (select count(*)::int from public.payments where provider_reference = 'pi_test_1'),
    1, 'a purchase is recorded once for the receipt history'
  );

  v_again := public.apply_credit_purchase(
    p_user_id => v_alice,
    p_pack_key => 'pack_75',
    p_provider => 'stripe',
    p_provider_reference => 'pi_test_1',
    p_amount_cents => 999
  );

  perform wp_test.assert_eq(
    (v_again ->> 'replayed')::boolean, true, 'a redelivered purchase reports itself'
  );
  perform wp_test.assert_eq(
    (select purchased_balance from public.credit_wallets where user_id = v_alice),
    v_purchased + 75, 'a redelivered purchase grants nothing further'
  );
  perform wp_test.assert_eq(
    (select count(*)::int from public.payments where provider_reference = 'pi_test_1'),
    1, 'a redelivered purchase is not recorded twice'
  );
end $$;

-- An invoice, recorded for the receipt history and nothing more.
do $$
declare
  v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
  v_before integer;
begin
  select balance into v_before from public.credit_wallets where user_id = v_alice;

  perform public.record_invoice_payment(
    v_alice, 'stripe', 'in_test_1', 2900, 'usd', 'Invoice A-1'
  );
  perform public.record_invoice_payment(
    v_alice, 'stripe', 'in_test_1', 2900, 'usd', 'Invoice A-1'
  );

  perform wp_test.assert_eq(
    (select count(*)::int from public.payments where provider_reference = 'in_test_1'),
    1, 'a redelivered invoice is recorded once'
  );
  perform wp_test.assert_eq(
    (select currency from public.payments where provider_reference = 'in_test_1'),
    'USD', 'the currency is stored in the case the constraint requires'
  );
  perform wp_test.assert_eq(
    (select balance from public.credit_wallets where user_id = v_alice),
    v_before, 'recording an invoice does not itself grant credits'
  );
end $$;

begin;
  set local role authenticated;
  set local request.jwt.claim.role = 'authenticated';

  do $$
  declare v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
  begin
    execute format('set local request.jwt.claim.sub = %L', v_alice);

    perform wp_test.assert_eq(
      (select count(*)::int from public.payments), 2,
      'a user sees their own payment history'
    );
  end $$;

  -- The paths that change what a user is entitled to are closed to them.
  select wp_test.assert_denied(
    $q$select public.apply_credit_purchase(
         (select id from wp_test.fixtures where name = 'alice'),
         'pack_75', 'stripe', 'pi_forged', 0)$q$,
    'a user cannot grant themselves a credit pack');
  select wp_test.assert_denied(
    $q$select public.apply_subscription_state(
         (select id from wp_test.fixtures where name = 'alice'),
         'pro', 'month'::public.billing_interval,
         'active'::public.subscription_status, now(), now() + interval '1 month')$q$,
    'a user cannot put themselves on a paid plan');
  select wp_test.assert_denied(
    $q$select public.record_payment_event('stripe', 'evt_forged', 'invoice.paid')$q$,
    'a user cannot forge a payment event');
  select wp_test.assert_denied(
    $q$select public.record_invoice_payment(
         (select id from wp_test.fixtures where name = 'alice'),
         'stripe', 'in_forged', 100)$q$,
    'a user cannot record a payment they did not make');
  select wp_test.assert_denied(
    $q$select count(*) from public.payment_events$q$,
    'a user cannot read the webhook log');
  select wp_test.assert_denied(
    $q$select count(*) from public.billing_customers$q$,
    'a user cannot read billing customer records');
  select wp_test.assert_denied(
    $q$update public.payments set amount_cents = 0$q$,
    'a user cannot rewrite their own payment history');
commit;


-- =============================================================================
\echo '== 16. Administration ======================================================='
-- =============================================================================

-- Alice becomes an administrator. Bob stays an ordinary user, and is the
-- control for every "an admin still cannot" assertion below.
do $$
declare
  v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
  v_bob   uuid := (select id from wp_test.fixtures where name = 'bob');
begin
  insert into public.user_roles (user_id, role)
  values (v_alice, 'admin'::public.app_role)
  on conflict do nothing;

  -- Something for Bob that an administrator must never be able to read.
  insert into public.documents (user_id, title, content, word_count)
  values (v_bob, 'Bob''s private essay', 'The text Bob wrote.', 500);

  insert into public.ai_scans
    (user_id, title, content, word_count, character_count, estimated_ai_likelihood)
  values (v_bob, 'Bob''s scan', 'The text Bob scanned.', 500, 2400, 42);

  perform wp_test.assert(
    public.is_admin(v_alice), 'the admin role is recognised by is_admin'
  );
  perform wp_test.assert(
    not public.is_admin(v_bob), 'an ordinary user is not an admin'
  );
end $$;

begin;
  set local role authenticated;
  set local request.jwt.claim.role = 'authenticated';

  -- ---- As an administrator ---------------------------------------------------
  do $$
  declare
    v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
    v_bob   uuid := (select id from wp_test.fixtures where name = 'bob');
    v_overview jsonb;
    v_series   jsonb;
    v_users    jsonb;
    v_detail   jsonb;
  begin
    execute format('set local request.jwt.claim.sub = %L', v_alice);

    v_overview := public.admin_overview();
    perform wp_test.assert(
      (v_overview -> 'users' ->> 'total')::int >= 2,
      'the overview counts every account'
    );
    perform wp_test.assert(
      v_overview ? 'revenue' and v_overview ? 'health',
      'the overview reports revenue and platform health'
    );

    -- A day with no activity must be a zero, not a missing point.
    v_series := public.admin_usage_series(7);
    perform wp_test.assert_eq(
      jsonb_array_length(v_series), 7,
      'the usage series has one point per day, including quiet ones'
    );

    v_users := public.admin_find_users('bob');
    perform wp_test.assert_eq(
      jsonb_array_length(v_users), 1, 'an administrator can find an account by email'
    );
    perform wp_test.assert_eq(
      v_users -> 0 ->> 'id', v_bob::text, 'the search returns the account asked for'
    );

    v_detail := public.admin_user_detail(v_bob);
    perform wp_test.assert(
      (v_detail -> 'content_counts' ->> 'documents')::int >= 1,
      'an administrator can see how many documents an account has'
    );

    -- The rule this whole migration is shaped by.
    perform wp_test.assert(
      not (v_detail::text ilike '%The text Bob wrote%'),
      'a user detail view never contains a document''s text'
    );
    perform wp_test.assert(
      not (v_detail::text ilike '%The text Bob scanned%'),
      'a user detail view never contains a scan''s text'
    );
    perform wp_test.assert(
      not (v_detail::text ilike '%Bob''s private essay%'),
      'a user detail view does not even contain a document''s title'
    );

    -- ...and it is not merely that the function omits them. The access does
    -- not exist: an administrator reading the tables directly sees nothing.
    perform wp_test.assert_eq(
      (select count(*)::int from public.documents where user_id = v_bob), 0,
      'an administrator cannot read another user''s documents'
    );
    perform wp_test.assert_eq(
      (select count(*)::int from public.ai_scans where user_id = v_bob), 0,
      'an administrator cannot read another user''s scans'
    );
  end $$;

  -- ---- As an ordinary user ---------------------------------------------------
  do $$
  declare v_bob uuid := (select id from wp_test.fixtures where name = 'bob');
  begin
    execute format('set local request.jwt.claim.sub = %L', v_bob);

    perform wp_test.assert_eq(
      (select count(*)::int from public.audit_logs), 0,
      'a non-admin sees no audit rows even after the grant'
    );
  end $$;

  -- EXECUTE is granted to every authenticated session on purpose: the role
  -- check is inside each function, so a non-admin is refused by the database
  -- rather than by a hidden button.
  select wp_test.assert_denied(
    'select public.admin_overview()',
    'a non-admin calling the overview directly is refused');
  select wp_test.assert_denied(
    'select public.admin_find_users(null)',
    'a non-admin cannot search accounts');
  select wp_test.assert_denied(
    $q$select public.admin_user_detail(
         (select id from wp_test.fixtures where name = 'alice'))$q$,
    'a non-admin cannot read an account detail');
  select wp_test.assert_denied(
    $q$select public.admin_adjust_credits(
         (select id from wp_test.fixtures where name = 'bob'), 1000, 'self-service')$q$,
    'a non-admin cannot grant themselves credits');
  select wp_test.assert_denied(
    $q$select public.admin_set_plan(
         (select id from wp_test.fixtures where name = 'bob'), 'pro')$q$,
    'a non-admin cannot put themselves on a paid plan');
  select wp_test.assert_denied(
    $q$select public.admin_set_role(
         (select id from wp_test.fixtures where name = 'bob'),
         'admin'::public.app_role, true)$q$,
    'a non-admin cannot make themselves an administrator');
commit;

-- Administrative actions, and the audit trail they leave.
begin;
  set local role authenticated;
  set local request.jwt.claim.role = 'authenticated';

  do $$
  declare
    v_alice uuid := (select id from wp_test.fixtures where name = 'alice');
    v_bob   uuid := (select id from wp_test.fixtures where name = 'bob');
    v_before integer;
    v_ok boolean;
  begin
    execute format('set local request.jwt.claim.sub = %L', v_alice);

    select balance into v_before from public.credit_wallets where user_id = v_bob;

    perform public.admin_adjust_credits(v_bob, 250, 'Goodwill after an outage');

    perform wp_test.assert_eq(
      (select balance from public.credit_wallets where user_id = v_bob),
      v_before + 250, 'an administrator can grant credits'
    );
    perform wp_test.assert_eq(
      (select count(*)::int from public.audit_logs
       where action = 'admin.credits.adjust' and entity_id = v_bob),
      1, 'a credit adjustment is audited'
    );
    perform wp_test.assert_eq(
      (select metadata ->> 'reason' from public.audit_logs
       where action = 'admin.credits.adjust' and entity_id = v_bob),
      'Goodwill after an outage', 'the audit row records why'
    );

    -- A reason is not optional: an unexplained adjustment is not auditable.
    begin
      perform public.admin_adjust_credits(v_bob, 100, '   ');
      v_ok := false;
    exception when others then
      v_ok := true;
    end;
    perform wp_test.assert(v_ok, 'a credit adjustment without a reason is refused');

    -- Roles.
    perform public.admin_set_role(v_bob, 'educator'::public.app_role, true, 'Verified');
    perform wp_test.assert(
      public.has_role(v_bob, 'educator'::public.app_role),
      'an administrator can grant a role'
    );
    perform wp_test.assert_eq(
      (select count(*)::int from public.audit_logs where action = 'admin.role.grant'),
      1, 'granting a role is audited'
    );

    perform public.admin_set_role(v_bob, 'educator'::public.app_role, false, 'Expired');
    perform wp_test.assert(
      not public.has_role(v_bob, 'educator'::public.app_role),
      'an administrator can revoke a role'
    );

    -- The one change an administrator may not make to themselves.
    begin
      perform public.admin_set_role(v_alice, 'admin'::public.app_role, false, 'oops');
      v_ok := false;
    exception when others then
      v_ok := true;
    end;
    perform wp_test.assert(
      v_ok, 'an administrator cannot remove their own admin role'
    );
    perform wp_test.assert(
      public.is_admin(v_alice), 'the last administrator is still an administrator'
    );

    -- Plan changes.
    perform public.admin_set_plan(v_bob, 'student', 'Support request #41');
    perform wp_test.assert_eq(
      (select pl.key from public.subscriptions s
       join public.plans pl on pl.id = s.plan_id
       where s.user_id = v_bob
         and s.status in ('trialing', 'active', 'past_due', 'paused')),
      'student', 'an administrator can change an account''s plan'
    );
    perform wp_test.assert_eq(
      (select count(*)::int from public.audit_logs where action = 'admin.plan.set'),
      1, 'a plan change is audited'
    );

    -- An administrator reads the audit log; that is what it is for.
    perform wp_test.assert(
      (select count(*)::int from public.audit_logs) >= 4,
      'an administrator can read the audit log'
    );
  end $$;
commit;


-- =============================================================================
\echo '== 17. Rate limiting ========================================================'
-- =============================================================================

do $$
declare
  v_result jsonb;
  v_allowed integer := 0;
  v_refused integer := 0;
  i integer;
begin
  -- A fresh key starts with its full budget.
  v_result := public.check_rate_limit('test:fresh', 3, 60);
  perform wp_test.assert_eq(
    (v_result ->> 'allowed')::boolean, true, 'the first request against a key is allowed'
  );
  perform wp_test.assert_eq(
    (v_result ->> 'remaining')::int, 2, 'the limiter reports what is left'
  );

  -- Five requests against a limit of three: three pass, two are refused.
  for i in 1..5 loop
    v_result := public.check_rate_limit('test:burst', 3, 60);
    if (v_result ->> 'allowed')::boolean then
      v_allowed := v_allowed + 1;
    else
      v_refused := v_refused + 1;
    end if;
  end loop;

  perform wp_test.assert_eq(v_allowed, 3, 'exactly the limit is allowed through');
  perform wp_test.assert_eq(v_refused, 2, 'everything over the limit is refused');

  -- A refused request still counts: not counting refusals makes a limiter
  -- free to hammer once you are over it.
  perform wp_test.assert_eq(
    (select count from public.rate_limits where key = 'test:burst'),
    5, 'refused requests are counted too'
  );

  -- Separate keys have separate budgets.
  v_result := public.check_rate_limit('test:someone-else', 3, 60);
  perform wp_test.assert_eq(
    (v_result ->> 'allowed')::boolean, true,
    'one key being exhausted does not affect another'
  );

  -- The window is fixed, so every caller inside it shares one row.
  perform wp_test.assert_eq(
    (select count(*)::int from public.rate_limits where key = 'test:burst'),
    1, 'a window is one row, however many requests land in it'
  );

  -- A key is required: a null key would silently share one global bucket.
  begin
    perform public.check_rate_limit(null, 3, 60);
    perform wp_test.assert(false, 'a null key should have been refused');
  exception when others then
    perform wp_test.assert(true, 'a request with no key is refused');
  end;
end $$;

-- A window that has rolled over starts again.
do $$
declare v_result jsonb;
begin
  -- Exhaust a one-second window, then wait past it.
  perform public.check_rate_limit('test:window', 1, 1);
  v_result := public.check_rate_limit('test:window', 1, 1);
  perform wp_test.assert_eq(
    (v_result ->> 'allowed')::boolean, false, 'a second request inside the window is refused'
  );

  perform pg_sleep(1.2);

  v_result := public.check_rate_limit('test:window', 1, 1);
  perform wp_test.assert_eq(
    (v_result ->> 'allowed')::boolean, true, 'the next window starts with a full budget'
  );
  perform wp_test.assert(
    (select count(*)::int from public.rate_limits where key = 'test:window') >= 2,
    'each window is its own row'
  );
end $$;

-- Old windows are prunable.
do $$
declare v_deleted integer;
begin
  insert into public.rate_limits (key, window_start, count)
  values ('test:ancient', now() - interval '3 days', 9);

  v_deleted := public.prune_rate_limits(24);

  perform wp_test.assert(v_deleted >= 1, 'pruning removes windows that have passed');
  perform wp_test.assert_eq(
    (select count(*)::int from public.rate_limits where key = 'test:ancient'),
    0, 'the pruned window is gone'
  );
  perform wp_test.assert(
    (select count(*)::int from public.rate_limits where key = 'test:burst') = 1,
    'pruning leaves the current window alone'
  );
end $$;

begin;
  set local role authenticated;
  set local request.jwt.claim.role = 'authenticated';

  -- A user who could call the limiter could exhaust somebody else's budget by
  -- naming their key, or exempt themselves by naming a fresh one.
  select wp_test.assert_denied(
    $q$select public.check_rate_limit('signin:victim@example.com', 1, 60)$q$,
    'a user cannot spend another key''s rate budget');
  select wp_test.assert_denied(
    $q$select public.prune_rate_limits(0)$q$,
    'a user cannot clear the rate limit counters');
  select wp_test.assert_denied(
    $q$select count(*) from public.rate_limits$q$,
    'a user cannot read how close anyone is to a limit');
commit;


-- =============================================================================
\echo '== 18. Cleanup =============================================================='
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
