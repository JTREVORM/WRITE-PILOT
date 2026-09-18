# WritePilot

**Write smarter. Check deeper.**

AI-powered tools for writing, grading, grammar, citations and document
improvement — in one workspace, for students, researchers, educators and
professionals worldwide.

---

## Where the project stands

**Phase 1 (foundation) is complete.** Authentication, profiles, roles, plans,
subscriptions, the credit ledger, usage tracking, Row Level Security, the
application shell and the reusable UI foundation are built and tested.

The AI tools themselves — detector, grammar, naturalize, grader, citations —
arrive in later phases. They are visible in the navigation marked "Soon" rather
than linking to routes that do not exist.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, React 19, Server Components) |
| Language | TypeScript, strict |
| Styling | Tailwind CSS v4, CSS-first tokens |
| Database & auth | Supabase (Postgres, Auth, Storage, RLS) |
| Email | Resend (transactional); Supabase Auth sends account mail |
| Hosting | Vercel-ready |

## Getting started

```bash
npm install
cp .env.example .env.local     # then fill in your Supabase values
npm run dev
```

Apply the database schema to your Supabase project:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

See [`supabase/README.md`](./supabase/README.md) for the full schema tour and the
hosted-project configuration checklist.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | Unit tests (entitlement policy, routing, formatting) |
| `npm run test:db` | Database and RLS tests against `$DATABASE_URL` |
| `npm run verify` | Lint, typecheck, unit tests and build |
| `npm run db:push` | Apply migrations to the linked project |
| `npm run db:types` | Regenerate `src/types/database.ts` from the local database |

`scripts/responsive-check.mjs` drives Chromium across mobile, tablet and desktop
viewports, checking for horizontal overflow and console errors. Run it against a
running dev server: `node scripts/responsive-check.mjs`.

## Architecture

```
src/
  app/
    (marketing)/       Public pages — landing, privacy, terms
    (auth)/            Sign in, register, password reset
    (app)/             Everything behind authentication
    auth/              OAuth and email-token route handlers
  components/
    ui/                Buttons, cards, fields, alerts, badges, progress…
    layout/            App shell, sidebar, mobile drawer, account menu
    auth/              Forms bound to server actions
    dashboard/         Stat cards, quick actions
  lib/
    env/               Zod-validated environment, split public vs server-only
    supabase/          Browser, server, proxy and service-role clients
    auth/              Sessions, role guards, server actions, provisioning
    entitlements/      Plan and credit policy — the gate before every AI call
    credits/           Credit movements through the database functions
    usage/             Usage recording and reporting
    email/             Resend client, templates, notifications
    config/            Site, routes, navigation, countries
  types/               Database contract
supabase/
  migrations/          Schema, functions, RLS, seed
  tests/               Database and RLS test suite
```

### Security model

Security is enforced by the database, not by the interface.

- **Row Level Security on every table.** A user can read their own rows and
  nothing else. Grants are stated explicitly rather than inherited.
- **Money-adjacent state is read-only from the browser.** Credits, plans and
  usage records have no user-writable policy at all. They change only through
  `SECURITY DEFINER` functions whose `EXECUTE` is revoked from `anon` and
  `authenticated`, called server-side with the service role.
- **Roles live in a table, not a token claim,** and are re-read each request.
- **The service-role key never reaches the browser.** `src/lib/supabase/admin.ts`
  imports `server-only`, so referencing it from a Client Component is a build
  error rather than a leak.
- **Protected columns are guarded by a trigger.** RLS cannot restrict columns, so
  a user updating their own profile cannot alter its id, email or creation date.
- **Route protection is defence in depth.** `src/proxy.ts` saves a round trip;
  the layout re-checks the session server-side, because a direct RSC request can
  bypass the proxy.
- **Redirect targets are sanitised** so `?next=` cannot become an open redirect.

### Entitlements

Every feature asks one question through one module:

```ts
const entitlements = await getEntitlements(user.id);
const access = checkFeatureAccess(entitlements, "ai_detection", { words });

if (!access.allowed) {
  // access.reason is "not_in_plan" | "monthly_limit_reached"
  //   | "insufficient_credits" | "input_too_long" | "unknown_feature"
  // and access.message is ready to show the user.
}
```

The rules live in the database, so a plan change takes effect immediately and
identically everywhere. `checkFeatureAccess` is a pure function in
`lib/entitlements/access.ts` and is unit tested.

### Configuration, not constants

Plan prices, credit costs, monthly limits, word caps and credit packs are rows in
Postgres. Repricing a plan or changing what a grammar check costs is an `update`,
not a deploy. Nothing in `src/` hard-codes a price or a limit.

## Product principles

These are product decisions, and the code follows them:

- **AI detection is an estimate.** It is presented as an estimated likelihood,
  never as proof of authorship, always with a note that false positives happen —
  particularly for non-native English writers.
- **An AI grade is not a grade.** It is an AI-assisted estimate meant to guide
  revision, and is never presented as an official mark.
- **Naturalize improves writing; it does not disguise authorship.** WritePilot is
  not marketed as a way to defeat integrity systems, and no feature is built for
  that purpose.
- **Documents are private by default** and deletable by their owner.

The canonical wording lives in `src/lib/config/site.ts` so it stays consistent
across every surface.

## Roadmap

| Phase | Scope | Status |
| --- | --- | --- |
| 1 | Foundation: auth, profiles, plans, credits, usage, RLS, shell | **Complete** |
| 2 | Dashboard and application shell | Next |
| 3–7 | AI Detector, Grammar, Naturalize, AI Grader, Citations | Planned |
| 8 | Document and assignment workspaces | Planned |
| 9 | Writing Coach and priority improvements | Planned |
| 10 | Subscriptions, payments, plan enforcement | Planned |
| 11 | Admin dashboard and analytics | Planned |
| 12 | Security, testing, optimisation | Planned |
| 13 | Landing page, SEO, legal, launch | Planned |

## Environment

See `.env.example` for the full list with notes. Secrets are never committed;
`.env*` is gitignored.

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Safe in the browser; RLS protects the data |
| `NEXT_PUBLIC_SITE_URL` | Yes | Must match the Supabase redirect allow-list |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | **Secret.** Bypasses RLS. Server-side only |
| `RESEND_API_KEY` | No | Without it, notification email is skipped, not failed |
| `RESEND_FROM_EMAIL` | No | Verified sender address |
