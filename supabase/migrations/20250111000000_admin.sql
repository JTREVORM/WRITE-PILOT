-- =============================================================================
-- WritePilot :: 0017 :: Administration
-- -----------------------------------------------------------------------------
-- Phase 11: running the platform.
--
-- The shape of this migration is decided by one rule stated in Phase 3 and kept
-- since: administering WritePilot does not require reading customers' writing.
-- So every function here returns counts, totals and account state, and not one
-- of them returns a document, a draft, a scan's text, a grade or a review. An
-- administrator can see that a user ran eleven grammar checks; they cannot see
-- what was checked. That is not an oversight to be fixed later — the access
-- simply does not exist, and the test suite asserts it.
--
-- The second rule is that the role check lives in the database. Each function
-- is SECURITY DEFINER and asks `is_admin(auth.uid())` itself, so EXECUTE can be
-- granted to `authenticated` without granting anything: a non-admin calling one
-- is refused by the function, not by a hidden button.
-- =============================================================================

-- Raises unless the caller is an administrator. Every function below opens with
-- this, so the check cannot be forgotten in one of them.
create or replace function public.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if v_actor is null or not public.is_admin(v_actor) then
    raise exception 'administrator role required' using errcode = '42501';
  end if;

  return v_actor;
end;
$$;

-- -----------------------------------------------------------------------------
-- admin_overview
-- -----------------------------------------------------------------------------
-- The numbers a person running the platform looks at first. Counts and totals
-- only: nothing here reads a row of anybody's writing.

create or replace function public.admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
begin
  perform public.require_admin();

  return jsonb_build_object(
    'generated_at', v_now,
    'users', jsonb_build_object(
      'total', (select count(*) from public.profiles),
      'new_7d', (select count(*) from public.profiles
                 where created_at >= v_now - interval '7 days'),
      'new_30d', (select count(*) from public.profiles
                  where created_at >= v_now - interval '30 days')
    ),
    'subscriptions', (
      select coalesce(jsonb_agg(row), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'plan_key', p.key,
          'plan_name', p.name,
          'count', count(*),
          'monthly_cents', p.price_monthly_cents
        ) as row
        from public.subscriptions s
        join public.plans p on p.id = s.plan_id
        where s.status in ('trialing', 'active', 'past_due')
        group by p.key, p.name, p.price_monthly_cents, p.sort_order
        order by p.sort_order
      ) rows
    ),
    'credits', jsonb_build_object(
      'outstanding', (select coalesce(sum(balance + purchased_balance), 0)
                      from public.credit_wallets),
      'consumed_30d', (select coalesce(-sum(amount), 0)
                       from public.credit_transactions
                       where type = 'consumption'
                         and created_at >= v_now - interval '30 days'),
      'refunded_30d', (select coalesce(sum(amount), 0)
                       from public.credit_transactions
                       where type = 'refund'
                         and created_at >= v_now - interval '30 days')
    ),
    'revenue', jsonb_build_object(
      'cents_30d', (select coalesce(sum(amount_cents), 0)
                    from public.payments
                    where status = 'succeeded'
                      and created_at >= v_now - interval '30 days'),
      'payments_30d', (select count(*) from public.payments
                       where status = 'succeeded'
                         and created_at >= v_now - interval '30 days')
    ),
    'usage_30d', (
      select coalesce(jsonb_agg(row), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'feature_key', u.feature_key,
          'feature_name', coalesce(f.name, u.feature_key),
          'runs', count(*),
          'successes', count(*) filter (where u.status = 'success'),
          'failures', count(*) filter (where u.status = 'failure'),
          'rejections', count(*) filter (where u.status = 'rejected'),
          'credits', coalesce(sum(u.credits_charged), 0)
        ) as row
        from public.usage_logs u
        left join public.features f on f.key = u.feature_key
        where u.created_at >= v_now - interval '30 days'
        group by u.feature_key, f.name
        order by count(*) desc
      ) rows
    ),
    'health', jsonb_build_object(
      'failures_24h', (select count(*) from public.usage_logs
                       where status = 'failure'
                         and created_at >= v_now - interval '24 hours'),
      'webhook_failures', (select count(*) from public.payment_events
                           where status = 'failed'),
      'webhooks_unprocessed', (select count(*) from public.payment_events
                               where status = 'received'
                                 and received_at < v_now - interval '15 minutes')
    )
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- admin_usage_series
-- -----------------------------------------------------------------------------
-- Runs per day, for the chart. Generated from a date series rather than from the
-- rows, so a day with no activity is a zero rather than a gap — a chart that
-- silently omits quiet days misreports the shape of the week.

create or replace function public.admin_usage_series(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 90);
begin
  perform public.require_admin();

  return (
    select coalesce(jsonb_agg(row order by day), '[]'::jsonb)
    from (
      select
        d.day::date as day,
        jsonb_build_object(
          'day', d.day::date,
          'runs', count(u.id),
          'successes', count(u.id) filter (where u.status = 'success'),
          'failures', count(u.id) filter (where u.status = 'failure'),
          'credits', coalesce(sum(u.credits_charged), 0)
        ) as row
      from generate_series(
        date_trunc('day', now()) - ((v_days - 1) || ' days')::interval,
        date_trunc('day', now()),
        interval '1 day'
      ) as d(day)
      left join public.usage_logs u
        on u.created_at >= d.day
       and u.created_at < d.day + interval '1 day'
      group by d.day
    ) rows
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- admin_find_users
-- -----------------------------------------------------------------------------
-- Account lookup by email or name. Returns account state — plan, credits,
-- roles, when they joined — and nothing they have written.

create or replace function public.admin_find_users(
  p_query text default null,
  p_limit integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 100);
  v_query text := nullif(trim(coalesce(p_query, '')), '');
begin
  perform public.require_admin();

  return (
    select coalesce(jsonb_agg(row), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'id', pr.id,
        'email', pr.email,
        'full_name', pr.full_name,
        'country', pr.country,
        'user_type', pr.user_type,
        'created_at', pr.created_at,
        'plan_key', pl.key,
        'plan_name', pl.name,
        'subscription_status', s.status,
        'credits', coalesce(w.balance, 0) + coalesce(w.purchased_balance, 0),
        'roles', coalesce(
          (select jsonb_agg(r.role order by r.role)
           from public.user_roles r where r.user_id = pr.id),
          '[]'::jsonb
        )
      ) as row
      from public.profiles pr
      left join public.credit_wallets w on w.user_id = pr.id
      left join public.subscriptions s
        on s.user_id = pr.id
       and s.status in ('trialing', 'active', 'past_due', 'paused')
      left join public.plans pl on pl.id = s.plan_id
      where v_query is null
         or pr.email::text ilike '%' || v_query || '%'
         or coalesce(pr.full_name, '') ilike '%' || v_query || '%'
      order by pr.created_at desc
      limit v_limit
    ) rows
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- admin_user_detail
-- -----------------------------------------------------------------------------
-- One account, in more depth. Per-feature run counts, recent credit movements,
-- how many documents exist — never their titles, and never their contents.

create or replace function public.admin_user_detail(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
begin
  perform public.require_admin();

  select * into v_profile from public.profiles where id = p_user_id;
  if not found then
    raise exception 'admin_user_detail: no such user' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'profile', jsonb_build_object(
      'id', v_profile.id,
      'email', v_profile.email,
      'full_name', v_profile.full_name,
      'country', v_profile.country,
      'timezone', v_profile.timezone,
      'user_type', v_profile.user_type,
      'created_at', v_profile.created_at
    ),
    'roles', coalesce(
      (select jsonb_agg(r.role order by r.role)
       from public.user_roles r where r.user_id = p_user_id),
      '[]'::jsonb
    ),
    'subscription', (
      select jsonb_build_object(
        'plan_key', pl.key,
        'plan_name', pl.name,
        'status', s.status,
        'interval', s.billing_interval,
        'current_period_end', s.current_period_end,
        'cancel_at_period_end', s.cancel_at_period_end,
        'provider', s.provider
      )
      from public.subscriptions s
      join public.plans pl on pl.id = s.plan_id
      where s.user_id = p_user_id
        and s.status in ('trialing', 'active', 'past_due', 'paused')
      limit 1
    ),
    'credits', (
      select jsonb_build_object(
        'balance', coalesce(w.balance, 0),
        'purchased', coalesce(w.purchased_balance, 0),
        'monthly_allowance', coalesce(w.monthly_allowance, 0),
        'period_end', w.period_end
      )
      from public.credit_wallets w where w.user_id = p_user_id
    ),
    -- Counts only. What is in these rows is the user's business.
    'content_counts', jsonb_build_object(
      'documents', (select count(*) from public.documents where user_id = p_user_id),
      'assignments', (select count(*) from public.assignments where user_id = p_user_id),
      'scans', (select count(*) from public.ai_scans where user_id = p_user_id),
      'grades', (select count(*) from public.grades where user_id = p_user_id)
    ),
    'usage_30d', (
      select coalesce(jsonb_agg(row), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'feature_key', u.feature_key,
          'runs', count(*),
          'failures', count(*) filter (where u.status = 'failure'),
          'credits', coalesce(sum(u.credits_charged), 0)
        ) as row
        from public.usage_logs u
        where u.user_id = p_user_id
          and u.created_at >= now() - interval '30 days'
        group by u.feature_key
        order by count(*) desc
      ) rows
    ),
    'recent_credits', (
      select coalesce(jsonb_agg(row), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'type', t.type,
          'amount', t.amount,
          'balance_after', t.balance_after,
          'reason', t.reason,
          'created_at', t.created_at
        ) as row
        from public.credit_transactions t
        where t.user_id = p_user_id
        order by t.created_at desc
        limit 10
      ) rows
    )
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Actions
-- -----------------------------------------------------------------------------
-- Everything an administrator can change, and every one of them audited. The
-- audit row is written in the same transaction as the change, so there is no
-- state in which one happened without the other.

create or replace function public.admin_adjust_credits(
  p_user_id uuid,
  p_credits integer,
  p_reason  text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.require_admin();
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_result jsonb;
begin
  if v_reason is null then
    raise exception 'admin_adjust_credits: a reason is required' using errcode = '22023';
  end if;

  if p_credits is null or p_credits = 0 then
    raise exception 'admin_adjust_credits: amount must be non-zero' using errcode = '22023';
  end if;

  if p_credits > 0 then
    v_result := public.grant_credits(
      p_user_id => p_user_id,
      p_credits => p_credits,
      p_type    => 'admin_adjustment'::public.credit_transaction_type,
      p_reason  => v_reason,
      p_reference_type => 'admin',
      p_reference_id => v_actor
    );
  else
    -- A deduction is a ledger movement like any other, so it goes through the
    -- same wallet lock rather than an update in passing.
    update public.credit_wallets
    set balance = greatest(balance + p_credits, 0)
    where user_id = p_user_id;

    insert into public.credit_transactions (
      user_id, type, amount, balance_after, reason, reference_type, reference_id
    )
    select
      p_user_id, 'admin_adjustment'::public.credit_transaction_type, p_credits,
      w.balance + w.purchased_balance, v_reason, 'admin', v_actor
    from public.credit_wallets w
    where w.user_id = p_user_id
    returning jsonb_build_object('balance_after', balance_after) into v_result;
  end if;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (
    v_actor, 'admin'::public.app_role, 'admin.credits.adjust', 'profile', p_user_id,
    jsonb_build_object('credits', p_credits, 'reason', v_reason)
  );

  return coalesce(v_result, '{}'::jsonb);
end;
$$;

create or replace function public.admin_set_plan(
  p_user_id  uuid,
  p_plan_key text,
  p_reason   text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.require_admin();
  v_sub uuid;
begin
  v_sub := public.assign_plan(p_user_id => p_user_id, p_plan_key => p_plan_key);

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (
    v_actor, 'admin'::public.app_role, 'admin.plan.set', 'profile', p_user_id,
    jsonb_build_object('plan_key', p_plan_key, 'reason', p_reason)
  );

  return v_sub;
end;
$$;

/*
 * Granting and revoking roles.
 *
 * An administrator may not remove their own admin role. It is the one change
 * that cannot be undone by the person making it, and "I clicked the wrong row"
 * should not be how an installation loses its last administrator.
 */
create or replace function public.admin_set_role(
  p_user_id uuid,
  p_role    public.app_role,
  p_grant   boolean,
  p_reason  text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := public.require_admin();
begin
  if not p_grant
     and p_role = 'admin'::public.app_role
     and p_user_id = v_actor
  then
    raise exception 'admin_set_role: an administrator cannot remove their own admin role'
      using errcode = '42501';
  end if;

  if p_grant then
    insert into public.user_roles (user_id, role)
    values (p_user_id, p_role)
    on conflict (user_id, role) do nothing;
  else
    delete from public.user_roles where user_id = p_user_id and role = p_role;
  end if;

  insert into public.audit_logs (actor_id, actor_role, action, entity_type, entity_id, metadata)
  values (
    v_actor, 'admin'::public.app_role,
    case when p_grant then 'admin.role.grant' else 'admin.role.revoke' end,
    'profile', p_user_id,
    jsonb_build_object('role', p_role, 'reason', p_reason)
  );

  return true;
end;
$$;

-- -----------------------------------------------------------------------------
-- Execution rights
-- -----------------------------------------------------------------------------
-- EXECUTE is granted to `authenticated` on purpose: each function asks
-- `is_admin()` itself, in the database, so a non-admin calling one directly is
-- refused by the function rather than by an absent button. `public` is revoked
-- first because Postgres grants it by default on a new function.

revoke execute on function public.require_admin() from public, anon, authenticated;
revoke execute on function public.admin_overview() from public, anon;
revoke execute on function public.admin_usage_series(integer) from public, anon;
revoke execute on function public.admin_find_users(text, integer) from public, anon;
revoke execute on function public.admin_user_detail(uuid) from public, anon;
revoke execute on function public.admin_adjust_credits(uuid, integer, text) from public, anon;
revoke execute on function public.admin_set_plan(uuid, text, text) from public, anon;
revoke execute on function public.admin_set_role(uuid, public.app_role, boolean, text) from public, anon;

grant execute on function public.admin_overview() to authenticated;
grant execute on function public.admin_usage_series(integer) to authenticated;
grant execute on function public.admin_find_users(text, integer) to authenticated;
grant execute on function public.admin_user_detail(uuid) to authenticated;
grant execute on function public.admin_adjust_credits(uuid, integer, text) to authenticated;
grant execute on function public.admin_set_plan(uuid, text, text) to authenticated;
grant execute on function public.admin_set_role(uuid, public.app_role, boolean, text) to authenticated;

-- The audit log's policy already restricts reads to administrators; without a
-- grant, the policy never gets the chance to allow one.
grant select on public.audit_logs to authenticated;
