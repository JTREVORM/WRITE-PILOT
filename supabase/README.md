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
| `migrations/20250104000000_grammar_checks.sql` | `grammar_checks`, `grammar_suggestions`, the status guard |
| `migrations/20250105000000_naturalize.sql` | `naturalize_runs`, `naturalize_paragraphs` and their policies |
| `migrations/20250106000000_grading.sql` | `rubrics`, `rubric_criteria`, `grades`, `grade_criteria`, the derived total |
| `migrations/20250107000000_citations.sql` | `citation_checks`, `citation_entries`, `citation_findings`, the status guard |
| `migrations/20250108000000_workspace.sql` | `documents`, `assignments`, `assignment_drafts`, the storage bucket and its policies |
| `migrations/20250109000000_coaching.sql` | `analysis_runs`, `improvement_actions`, the priority guard |
| `migrations/20250110000000_payments.sql` | `billing_customers`, `payment_events`, `payments`, and the functions a webhook calls |
| `migrations/20250111000000_admin.sql` | Administrative metrics, account lookup and the audited admin actions |
| `harness/00_harness.sql` | Stand-in for the Supabase schemas the migrations rely on, used by the test script |
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
- grammar checks: accepting and dismissing a suggestion, and the guard that
  stops a user rewriting what a suggestion would insert
- naturalize runs: owner-only reads, no client writes (including the integrity
  findings), deletion, and the cascade to paragraph pairs
- rubrics and grades: the trigger-derived rubric total (including that a user
  cannot overwrite it), correcting a criterion but not moving it to another
  rubric, grades being read-only to their owner, and a grade surviving the
  deletion of the rubric it was produced against
- citation checks: marking a finding resolved and reopening it, the timestamp
  being stamped server-side, and the guard that stops a user rewriting a
  finding's message, severity or origin
- documents and assignments: the constraint that refuses a storage path outside
  its owner's folder, renaming a document but not rewriting its text or its
  path, creating an assignment directly as the user, and the two-sided policy
  that stops a user attaching someone else's document as their own draft
- reviews and improvements: ticking an improvement off and reopening it, and
  the guard that stops a user rewriting the advice, re-scoring their own
  priority list, relabelling advice as a measurement, or writing the coach's
  explanation themselves
- payments: that a redelivered webhook is claimed once, that a redelivered
  subscription event grants no second month while the next period does, that an
  unpaid subscription pays out nothing until it becomes active, that a
  redelivered credit pack grants nothing further, and that every function which
  mints an entitlement is denied to a signed-in user
- administration: that every admin function refuses a non-admin caller, that
  credit adjustments, plan changes and role grants are audited with their
  reason, that an adjustment without a reason is refused, that an administrator
  cannot remove their own admin role, and — twice over — that an administrator
  cannot read another account's documents or scans
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

**A user session may move `grammar_suggestions.status`, and nothing else.**
Accepting a suggestion is the user's own decision on their own document, so RLS
authorises it directly rather than routing it through the service role. The
column guard is what makes that safe: without it, "accept" could be turned into
a way to splice arbitrary text into the document the tool then hands back.

**A rubric's total is derived, never written.** `rubrics.total_points` is
re-summed by a trigger on `rubric_criteria`, so the header and the breakdown
cannot disagree however the criteria change. The rubric's own column guard makes
that total read-only to a user session, and lets the re-sum through by checking
`pg_trigger_depth()` — the guard applies to client statements, not to the
database's own derived write.

**A grade is not editable by the person it describes.** Its owner may read it and
delete it; there is no update grant, because a grade a user could rewrite is not
worth storing. Each grade snapshots the criterion names and maxima it was judged
against, so deleting a rubric clears the link (`on delete set null`) without
taking the grades with it.

**A citation finding records how it was produced.** `citation_findings.origin`
is `local` for the ones the server counted by comparing the text against the
reference list, and `model` for the ones judged against a style's rules. The
column guard pins it along with the message and the severity, so a user session
can move a finding's status and nothing else — otherwise "mark as resolved"
would be a way to rewrite what the checker found, and the stored report would
stop being a record of anything.

**A document's file path is access control, not naming.** Objects live at
`users/{user_id}/documents/{document_id}/{filename}` in a private bucket, and
the storage policies match on that second segment. The same rule is enforced
three times over: a check constraint on `documents.storage_path`, the storage
policies themselves, and a check in application code before any URL is signed.
Uploads are written by the server, so a client never chooses a path.

**An assignment is inserted by its owner, not by the service role.** It is the
one table here holding nothing derived — no credits, no model output, no counts
— so RLS is exactly the right place for the decision. `assignment_drafts` checks
both sides on insert: without the second clause a user could attach another
user's document to their own assignment and read its title back through the
join.

**Deleting a document does not delete the analyses run on it.** The
`document_id` columns on the analysis tables are `on delete set null`. A user
who removes a document has not asked to lose the grade they paid for, and each
analysis already stores the text it read.

**An improvement's priority is derived, not supplied.** `priority_score` is
computed by the server from the impact and effort ratings and stored, so a run's
ordering is fixed once made and can be ordered in the database. The column guard
pins it along with the advice itself: a user session that could re-score its own
list would have a list that means nothing, and one that could write `coaching`
could put words in the tutor's mouth.

**Exactly-once is a schema property, not a convention.** A payment provider
retries. `payment_events` is keyed on the provider's own event id, so a
redelivery collides and does no work. Underneath it every state change is keyed
independently — a plan allowance on the billing period, a credit pack on the
payment reference — so a delivery that somehow escaped the event log still
could not pay out twice.

**Nothing that grants an entitlement is callable from a session.** `EXECUTE` on
the payment functions is revoked from `public` as well as from `anon` and
`authenticated`: Postgres grants it to `public` by default on a new function,
and revoking only the two roles leaves that inherited grant in place. The suite
asserts the denial for each one rather than assuming it.

**Administration reads counts, never content.** Every administrative function
returns account state and totals; none selects a document, a draft, a scan's
text, a grade or a review. That is enforced below the functions as well: no
policy on those tables grants an administrator access to another account's
rows, so the restriction survives a future function that forgets it. The suite
asserts both halves.

**The admin role is checked in the database, not in the page.** Each admin
function is `SECURITY DEFINER` and calls `require_admin()` first, so `EXECUTE`
can be granted to `authenticated` without granting anything. A non-admin
calling one is refused by Postgres with `42501`, which is what makes the
client-side guard a convenience rather than the protection.

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
6. **Storage**: the `documents` bucket is created by the migration and must stay
   private. Nothing serves from it directly; the application mints short-lived
   signed URLs per download.
7. **Payments**: create the products and prices in the payment provider, then
   record their price ids in `plans.provider_price_id_monthly` /
   `provider_price_id_yearly` and `credit_packs.provider_price_id`. They are
   deliberately not environment variables — repricing should be an `update`.
   Register the webhook endpoint at `<origin>/api/webhooks/stripe` for
   `checkout.session.completed`, `customer.subscription.*` and `invoice.paid`,
   and set `STRIPE_WEBHOOK_SECRET` to its signing secret.

## Adding a table in a later phase

Every new table must:

1. `enable row level security`
2. revoke the inherited `anon` / `authenticated` grants, then grant only what its
   policies need
3. scope every policy by `auth.uid()`
4. gain coverage in `tests/database.test.sql` — including a test that proves the
   denial, not only the permission
