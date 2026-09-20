# Launch checklist

Everything a deployment needs that a build cannot check for itself. Ordered so
that each step can be verified before the next one depends on it.

Nothing here is optional theatre: each item is something that, left undone,
either breaks the product or quietly makes it dishonest.

---

## 1. Environment

Copy `.env.example` and fill it in. The application boots without the optional
integrations and reports each unavailable feature as unavailable rather than
failing at the point of use — so a partial configuration is a safe state to
deploy, not a broken one.

| Variable | Required | Without it |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | The app will not start |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | The app will not start |
| `NEXT_PUBLIC_SITE_URL` | Yes | Auth redirects, canonicals and the sitemap point at localhost |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | No credits, plans, usage or AI runs |
| `ANTHROPIC_API_KEY` | For the tools | Every AI feature reports itself unavailable |
| `STRIPE_SECRET_KEY` | For payments | Plans are shown but cannot be bought |
| `STRIPE_WEBHOOK_SECRET` | For payments | **Every webhook is refused**, so nothing a customer pays for takes effect |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | For email | Notification email is skipped; Supabase still sends auth email |

Confirm `NEXT_PUBLIC_SITE_URL` is the real origin before anything else. It is
the one value that is wrong in a way nothing complains about: sign-in links,
canonical URLs and the sitemap will all point somewhere else.

## 2. Database

```bash
supabase link --project-ref <ref>
supabase db push
```

Then, in the Supabase dashboard:

- **Authentication → URL Configuration** — set the Site URL, and add
  `<origin>/auth/callback` and `<origin>/auth/confirm` as redirect URLs.
- **Authentication → Providers → Email** — enable "Confirm email".
- **Authentication → Policies** — set the minimum password length to 10, to
  match `src/lib/validation/auth.ts`.
- **Storage** — confirm the `documents` bucket exists and is **private**. The
  migration creates it that way; confirm nothing has changed it.

Verify the schema behaves as it claims:

```bash
npm run test:db
```

## 3. Scheduled jobs

Two functions need a scheduler (pg_cron, or anything that can call a function
on a timer):

| Function | Cadence | Why |
| --- | --- | --- |
| `public.renew_credit_period(user_id)` | At each subscriber's period start | Without it, allowances never refresh and paying customers run out |
| `public.prune_rate_limits()` | Daily | Without it, the rate-limit table grows without bound |

## 4. Payments

1. Create the products and prices in Stripe.
2. Record the price ids in the database — `plans.provider_price_id_monthly`,
   `plans.provider_price_id_yearly`, `credit_packs.provider_price_id`. They are
   deliberately not environment variables: repricing should be an `update`, not
   a deploy. A plan with no price id shows as "not available yet" rather than
   offering a button that fails on Stripe's own page.
3. Register the webhook endpoint at `<origin>/api/webhooks/stripe` for:
   `checkout.session.completed`, `customer.subscription.created`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.paid`.
4. Put its signing secret in `STRIPE_WEBHOOK_SECRET`.
5. Verify the endpoint before taking a payment:

   ```bash
   STRIPE_WEBHOOK_SECRET=whsec_… npm run test:webhook
   ```

   Four deliveries — unsigned, wrongly signed, correctly signed but replayed an
   hour later, and correctly signed. Only the last may be accepted.

## 5. The first administrator

There is no bootstrap route, on purpose: a URL that grants the admin role is a
URL somebody will find. Grant it once, directly:

```sql
insert into public.user_roles (user_id, role)
select id, 'admin' from public.profiles where email = 'you@example.com';
```

Every subsequent grant goes through `/admin`, which audits it. Note that an
administrator cannot remove their own admin role — the database refuses it — so
an installation cannot lose its last administrator by accident.

## 6. Verify the deployment

Against the real origin, with the site running:

```bash
npm run verify                                   # lint, types, unit tests, build
BASE_URL=https://your-origin npm run test:security
BASE_URL=https://your-origin npm run test:seo
BASE_URL=https://your-origin EXPECT_PRODUCTION=1 npm run test:security
```

The last one additionally asserts that the development-only preview routes
return 404. If any of them is reachable in production, stop and find out why
before announcing anything.

Then, by hand, once:

- Register an account and confirm the email arrives.
- Run one tool and confirm credits are deducted, and that a deliberate failure
  refunds them.
- Buy the cheapest plan in Stripe test mode and confirm the plan changes **only
  after** the webhook arrives — not when the browser reaches the success page.
- Delete a document and confirm the file is gone from storage.

## 7. What to watch afterwards

`/admin` reports the two things that fail quietly:

- **Failed webhooks.** Each is stored against its provider event id with the
  error, so it can be diagnosed and replayed. A customer who paid and did not
  get their plan shows up here first.
- **AI failures in the last 24 hours.** A provider outage looks like a spike;
  every failed run has already refunded its credits.

## 8. Before announcing

- Read `/academic-integrity` and make sure it is still true of the product.
- Have counsel review `/privacy` and `/terms`. Both currently carry a notice
  saying they are pending that review; remove it when it has happened, and not
  before.
- Confirm `/.well-known/security.txt` names a mailbox somebody actually reads.
