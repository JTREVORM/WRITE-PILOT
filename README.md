# WritePilot

**Write smarter. Check deeper.**

AI-powered tools for writing, grading, grammar, citations and document
improvement — in one workspace, for students, researchers, educators and
professionals worldwide.

---

## Where the project stands

**Phases 1 and 2 are complete.** Authentication, profiles, roles, plans,
subscriptions, the credit ledger, usage tracking and Row Level Security (Phase
1); the streaming dashboard, notification centre, theme control and the rest of
the application shell (Phase 2).

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
| `npm test` | Unit tests (entitlement policy, routing, theme, formatting) |
| `npm run test:db` | Rebuilds a scratch Postgres and runs the schema/RLS suite |
| `npm run test:responsive` | Browser check: overflow and console errors, light and dark |
| `npm run test:interaction` | Browser check: drawer, notifications, theme, skip link |
| `npm run verify` | Lint, typecheck, unit tests and build |
| `npm run db:push` | Apply migrations to the linked project |
| `npm run db:types` | Regenerate `src/types/database.ts` from the local database |

The two browser checks need a running dev server (`npm run dev`).
`test:interaction` drives `/shell-preview`, a development-only route that renders
the signed-in shell with fixture data — the shell is otherwise only reachable
behind authentication, which is how two layout bugs reached the repository in
Phase 1. It returns 404 in production.

## Architecture

```
src/
  app/
    (marketing)/       Public pages — landing, privacy, terms
    (auth)/            Sign in, register, password reset
    (app)/             Everything behind authentication
    auth/              OAuth and email-token route handlers
  components/
    ui/                Buttons, cards, fields, alerts, badges, page header, icons…
    layout/            App shell, sidebar, mobile drawer, notifications, theme
    auth/              Forms bound to server actions
    dashboard/         Streamed sections, stat cards, quick actions, setup notice
  lib/
    env/               Zod-validated environment, split public vs server-only
    theme/             Theme preference: cookie, server read, server action
    notifications/     In-app notification reads and mutations
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

### The application shell

The frame awaits only what is cheap — the session, the profile and the user's
roles. Credits and notifications each sit behind their own `<Suspense>`
boundary, so navigation is interactive before those queries resolve. The
dashboard does the same for each of its sections.

Anything that reads data in the shell degrades rather than throwing: a failed
entitlement read yields "no plan, no credits", which every feature gate already
treats as a refusal, instead of blanking the page.

Two constraints are easy to break here and worth knowing:

- **Navigation config holds icon *names*, not components.** The config is read on
  the server and handed to Client Components; a component is a function and
  cannot be serialized across that boundary. `components/ui/icon.tsx` maps names
  to components on whichever side renders them.
- **The mobile drawer renders through a portal.** Its trigger sits in the sticky
  header, which uses a backdrop blur — and an element with a backdrop filter
  becomes the containing block for its `position: fixed` descendants. Rendered in
  place, the drawer is clipped to the height of the header bar.

### Theme

Light, dark or follow-the-system, stored in a cookie and rendered into the HTML
by the server, so a returning visitor never sees a flash of the wrong palette.
"System" deliberately renders no `data-theme` attribute — the server cannot know
the visitor's OS preference, so it defers to the media query instead of guessing.
Tailwind's `dark:` variant is redefined in `globals.css` to fire under both
conditions; without that, utilities would ignore a visitor who chose dark while
their OS is light.

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
| 2 | Dashboard and application shell | **Complete** |
| 3 | AI Detector | Next |
| 4–7 | Grammar, Naturalize, AI Grader, Citations | Planned |
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
