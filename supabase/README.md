# WritePilot database

The schema is the security boundary. Row Level Security decides what a user can
read, and a small set of `SECURITY DEFINER` functions are the only way credits,
plans and usage records ever change. The application trusts neither the browser
nor its own UI code for those decisions.

## Layout

| File | Contents |
| --- | --- |
| `migrations/20250101000000_extensions_and_enums.sql` | Extensions, enums, shared trigger helpers |
| `migrations/20250101000100_identity.sql` | `profiles`, `user_roles`, authorization helpers |
| `migrations/20250101000200_catalog_and_billing.sql` | `features`, `plans`, `plan_features`, `subscriptions`, `credit_packs` |
| `migrations/20250101000300_credits_and_usage.sql` | `credit_wallets`, `credit_transactions`, `usage_logs`, `usage_counters`, `notifications`, `audit_logs` |
| `migrations/20250101000400_functions.sql` | Provisioning, credit ledger, usage logging, entitlements |
| `migrations/20250101000500_rls.sql` | Grants and every RLS policy |
| `migrations/20250101000600_seed_catalog.sql` | Starting plans, features, limits and credit packs |
| `migrations/20250102000000_notifications_guard.sql` | Column guard for user-visible notification updates |
| `migrations/20250103000000_ai_scans.sql` | `ai_scans`, `ai_scan_segments` and their policies |
| `tests/database.test.sql` | Behavioural tests, including the RLS denial cases |

## Applying it

Against a hosted project:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

Locally (requires Docker):

```bash
supabase start
supabase db reset   # applies every migration, then the seed
```

## Running the tests

```bash
npm run test:db      # rebuilds a scratch database, applies every migration, runs the suite
```

Or against any database directly:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/database.test.sql
```

Every assertion raises on failure, so a non-zero exit is a real regression. The
suite cleans up after itself and can be re-run. It covers:

- signup provisioning (profile, role, wallet, free subscription, welcome credits)
- credit debits, idempotent replays, refunds and the insufficient-credit path
- allowance credits being spent before purchased ones
- usage logging and monthly counters, including that failures do not consume an allowance
- plan changes and entitlement recalculation
- notification reads, marking as read, and the column guard that stops a user
  rewriting a notification's text
- detection scans: owner-only reads, no client writes, user-initiated deletion,
  and the cascade from a scan to its paragraph segments
- **Row Level Security**: that a user cannot read another user's data, cannot
  raise their own credit balance, cannot grant themselves a role, cannot change
  their own plan, and cannot execute any privileged function

## Design notes

**Configuration lives in tables, not code.** Plan prices, credit costs, monthly
limits and credit packs are rows. Changing what the Student plan costs, or what
an AI detection run charges, is an `update` — not a deploy.

**The ledger is the source of truth.** `credit_wallets.balance` is a cached
figure; `credit_transactions` is append-only and records every movement with the
balance that resulted. Both are written inside one transaction by
`grant_credits` / `consume_credits`, under a row lock, so they cannot drift.

**Allowance is spent before purchased credits.** Plan credits expire at the
period rollover; purchased credits do not. Spending the perishable ones first is
the outcome a user would choose.

**Columns RLS cannot protect are guarded by triggers.** RLS filters rows, not
columns, so a table a user may update needs a trigger to pin the fields they
must not change — the profile's identity columns, and everything on a
notification except its read state.

**Document text is owner-only, with no admin read path.** `ai_scans` stores the
text that was analysed, because a likelihood with no way to see which paragraphs
drove it is not actionable. Administering the platform does not require reading
customers' unpublished writing, so that access simply does not exist — and the
owner can delete a scan at any time.

**Roles are not in the JWT.** They live in `user_roles` and are read per request,
so revoking an admin takes effect immediately rather than at the next token
refresh.

**Idempotency is built in.** Every credit movement accepts an idempotency key, so
a retried server action, a redelivered webhook or a double-submitted form cannot
charge twice.

## Configuring the hosted project

1. **Authentication → URL Configuration**
   - Site URL: your production origin
   - Redirect URLs: `<origin>/auth/callback` and `<origin>/auth/confirm`
2. **Authentication → Providers → Email**: enable "Confirm email".
3. **Authentication → Policies**: set the minimum password length to 10 to match
   `src/lib/validation/auth.ts`.
4. **Email templates**: the app handles both link formats, so either works.
   - Default `{{ .ConfirmationURL }}` templates land on `/auth/callback`.
   - Templates using `{{ .TokenHash }}` should point at
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email`.
5. **Scheduled job**: call `public.renew_credit_period(user_id)` for each active
   subscriber at the start of their period (pg_cron, or an external scheduler).

## Adding a table in a later phase

Every new table must:

1. `enable row level security`
2. revoke the inherited `anon` / `authenticated` grants, then grant only what its
   policies need
3. scope every policy by `auth.uid()`
4. gain coverage in `tests/database.test.sql` — including a test that proves the
   denial, not only the permission
