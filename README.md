# WritePilot

**Write smarter. Check deeper.**

AI-powered tools for writing, grading, grammar, citations and document
improvement — in one workspace, for students, researchers, educators and
professionals worldwide.

---

## Where the project stands

**Phases 1–12 are complete.** Authentication, profiles, roles, plans,
subscriptions, the credit ledger, usage tracking and Row Level Security (Phase
1); the streaming dashboard, notification centre, theme control and the rest of
the application shell (Phase 2); the AI Detector, the provider layer and
document text extraction (Phase 3); the Grammar Checker (Phase 4); Naturalize
(Phase 5); the AI Rubric Grader (Phase 6); the Citation Checker (Phase 7); the
document library and assignment workspace (Phase 8); the Writing Coach and its
priority improvement system (Phase 9); subscriptions, payments and plan
enforcement (Phase 10); the admin dashboard (Phase 11); the security, testing
and optimisation pass (Phase 12).

What remains is the public launch surfaces.

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, React 19, Server Components) |
| Language | TypeScript, strict |
| Styling | Tailwind CSS v4, CSS-first tokens |
| Database & auth | Supabase (Postgres, Auth, Storage, RLS) |
| AI | Anthropic (swappable — see the provider layer below) |
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
| `npm run test:interaction` | Browser check: every interactive surface, driven for real |
| `npm run test:security` | Browser check: the served headers, and that the CSP breaks nothing |
| `npm run test:webhook` | Drives the payment webhook with signed and forged deliveries |
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
    detection/         Likelihood meter, paragraph view, signals, scan form
    grammar/           Interactive workspace, readability panel, check form
    naturalize/        Comparison views, word diff, integrity panel, mode picker
    grading/           Grade meter, criterion breakdown, rubric editor, disclaimer
    citations/         Coverage figures, findings list, reference list, limits
    documents/         Library form, document actions, tool links, selection banner
    assignments/       Brief form, draft manager
    coach/             Improvement list, priority bands, disclaimer
    billing/           Plan grid, credit packs, billing portal button
    admin/             Stat tiles, usage chart, tool ranking, account panel
  lib/
    env/               Zod-validated environment, split public vs server-only
    theme/             Theme preference: cookie, server read, server action
    notifications/     In-app notification reads and mutations
    ai/                Provider contract and the Anthropic implementation
    text/              Sentence and paragraph segmentation, shared by features
    detection/         AI Detector: signals, scoring, prompt, orchestration
    grammar/           Grammar Checker: readability, locating, applying, prompt
    naturalize/        Naturalize: modes, word diff, integrity checks, prompt
    grading/           AI Grader: rubric normalisation, scoring, bands, prompt
    citations/         Citation Checker: parsing, cross-matching, merging, prompt
    assignments/       Assignments and their drafts
    coach/             Writing Coach: priority scoring, carried signals, prompts
    billing/           Payments: checkout, portal, webhook handling, status mapping
    admin/             Administration: metrics, account lookup, axis arithmetic
    documents/         Library, storage paths, signed URLs, text extraction
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

### The AI provider layer

`lib/ai` exposes one capability — "given a prompt and a schema, return data
matching that schema" — rather than a method per product feature. Each feature
owns its prompt and its response schema; the provider only knows how to talk to
a model. Swapping providers means adding a class beside the existing one and a
branch in `provider.ts`, with no feature code touched.

Responses are validated against a Zod schema on the way out, so nothing
downstream defends against a half-parsed result.

### How the AI Detector works

The result has two independent parts, which is what makes it explainable:

- **Measured signals** are computed locally from the text — sentence-length
  variation, lexical diversity, repeated four-word sequences, punctuation range,
  connective density. No model is involved, so they are reproducible, and they
  are shown to the user as observations about the writing.
- **The estimate** comes from the model, which is given those same measurements
  as evidence rather than being asked to judge blind.

Every AI feature follows the same order, and the detector is the reference
implementation:

1. check the input is worth analysing
2. check the entitlement — refuse before spending anything
3. resolve the provider — refuse before charging if it is unavailable
4. charge credits, idempotently
5. call the provider; on any failure, refund and record it
6. persist the result and record the success

Credits are charged *before* the provider call so two concurrent requests cannot
both pass a balance check and overspend. The refund path is what makes that
safe: a user is never billed for analysis they did not receive.

**The model is never asked for character offsets.** It scores numbered
paragraphs; the offsets are computed server-side from the same split that
produced the numbering. That keeps every highlight on the passage it describes
instead of trusting a model to count characters.

**On honesty.** No band is labelled "AI-generated" — the strongest is "strong
indicators", which is what the measurement can support. Confidence is reported
from the amount of text available, the false-positive disclaimer appears beside
every result rather than behind a link, and the prompt explicitly instructs
against penalising non-native English writers. These are covered by tests, not
just convention.

### How the Grammar Checker works

Every suggestion is a replacement of one exact fragment. The model quotes the
fragment and names the sentence it came from; `locate.ts` finds that fragment
*inside that sentence* and computes the offsets. Anything it cannot find
verbatim is dropped — failing closed costs a suggestion, whereas guessing
corrupts someone's document.

The stored text is never rewritten. The corrected version is derived on every
render by applying whichever suggestions the user has accepted, which is what
makes undo exact: rejecting everything returns the original characters. That
property is asserted directly in the tests.

The interaction is optimistic — accept, dismiss and undo land immediately and
persist in the background — and `status` is the one column a user session can
move. A database trigger pins the rest, so accepting a suggestion can never be
turned into a way to splice arbitrary text into the document.

Readability (Flesch Reading Ease, Flesch–Kincaid grade) is computed locally from
published formulas, so it is reproducible. It is reported as a property of the
text, with the audience described in words and an explicit note that dense
specialist prose scoring low is normal rather than a fault.

The prompt spends as much space on what *not* to flag as on what to find:
regional spelling, the serial comma, contractions, technical terms and quoted
material are all left alone. A checker that flattens a writer's voice into house
style is worse than one that finds fewer issues.

### How Naturalize works

Seven modes, because "better" depends on what the writing is for — the same
paragraph improved for a supervisor reads differently from one improved for a
general audience. Each mode's guidance lives beside its interface label so the
two cannot drift apart.

The model rewrites **numbered paragraphs** and returns them under the same
numbers. Pairing by index rather than by matching text means the comparison
always lines a rewrite up against what the writer actually wrote, and a response
that reshapes the document is detectable. A paragraph the model does not return
falls back to the original: leaving the writer's own words in place is always
safer than dropping them.

**The comparison is a real word-level diff**, not two blocks of text side by
side. It is a longest-common-subsequence over tokens that carry their own
whitespace, so either side reassembles byte for byte — a property the tests
assert directly, because a comparison that shows text present in neither version
is worse than no comparison.

**Meaning preservation is checked, not promised.** After every rewrite the
result is compared against the original for figures, citations, quotations and
links. Anything missing is reported to the user, prominently, with what to do
about it. The scope is deliberately narrow — these are unambiguous to detect and
consequential to lose, whereas flagging every proper noun would bury the
findings that matter. A rewrite that keeps almost none of the original wording
is also flagged, except in the modes that are explicitly meant to cut.

Both versions are kept. The original is never replaced, because the whole point
is that the writer chooses which one to keep.

### How the AI Grader works

A rubric and a grade are separate things, and the schema keeps them separate. A
rubric is extracted once from whatever the institution supplied — a brief, a
marking grid, a paragraph of requirements — and is then reusable. A lecturer
marking thirty submissions, or a student checking four drafts, pays for the
extraction once and grades against identical criteria every time. That the
criteria were identical is then demonstrable rather than asserted.

**The arithmetic is ours.** The model is asked to judge each criterion and is
never asked to add them up; a total it volunteers is discarded. Every awarded
score is clamped into the range its criterion allows before it is stored, so a
model returning 12 out of 10 costs nothing and loses nothing. The rubric's own
total is summed by a database trigger, which means no code path — ours or a
future one — can leave the header disagreeing with the criteria beneath it.

**An extracted rubric is correctable.** Points carried into a criterion's name
("Argument (20 marks)") are stripped, duplicates are merged keeping the larger
allocation, and anything the user still disagrees with can be edited in place.
A column guard means only the name, description and points can move: a criterion
cannot be grafted onto another rubric by editing one field, and the derived
total is not user-writable.

**Nothing here is a grade.** The wording is fixed in one module so no screen can
quietly present an estimate as a mark. The figure is shown as points against a
stated maximum — "39 / 50", with the percentage secondary — because a bare
percentage reads exactly like a mark. There is no letter-grade conversion, and
that is deliberate: letter boundaries belong to an institution, and inventing
one would dress a guess up as a registrar's decision. The band is always written
out beside its colour, and the standing qualification sits next to the number
rather than behind a link.

Grades are not editable by their owner — a grade a user could rewrite is not
worth storing — and they outlive the rubric they came from, because each one
snapshots the criteria it was judged against.

### How the Citation Checker works

The check has two halves, and they are never blended into one undifferentiated
list of "issues".

**The first half is arithmetic.** Which sources are cited, which are listed, and
whether those two sets agree is bookkeeping, and bookkeeping is the last thing
that should be handed to a language model. Citations are parsed out of the prose
— parenthetical, narrative, and the numbered form none of the supported styles
use — the reference list is found and split into entries, and the two are
matched on author and year. A source cited and never listed, an entry listed and
never cited, a year that disagrees between the two, a duplicated entry: all of
these are counted, locally, before any model is involved. They cost nothing to
compute and they are stated as fact, because they are.

The parser is tuned to under-claim. "(Table 2)" and "(p < 0.05)" have exactly
the shape of an MLA citation, and telling a writer to add a reference for Table 2
is the most annoying possible false positive, so cross-references are excluded by
name. A citation the parser misses costs the user nothing; one it invents costs
them an afternoon.

**The second half is a reading.** Whether an entry follows APA 7 is a judgement,
and that is the only thing the model is asked. It is told what it cannot see —
italics, indentation and small caps do not survive text extraction, so it may
never report them — and what it cannot know: it cannot verify that a source
exists, that a DOI resolves, or that a work supports the claim it is cited for,
and it is forbidden from implying otherwise.

Every finding is stored with its origin, and the interface labels them
**Checked** and **Assessed** and lets you filter to either. A user who wants to
know which half of the report is arithmetic is entitled to an answer.

The parsed reference list is shown back as it was read. If the checker found
three entries where the document has five, every count on the page is wrong, and
the writer is the only person in a position to notice.

### How the workspace works

Until Phase 8 every tool took a paste or an upload, used it once and kept its
own copy. That is fine for a single check and falls apart across a piece of work
drafted four times: the same essay gets uploaded to five tools and nothing
connects them.

**A document is added once and reused.** Every tool accepts three kinds of
input — pasted text, an uploaded file, or a document from the library — through
one resolver, and a tool opened from the library shows which document it is
about to read. The run is stored against that document, which is what fills in
the history on the document's own page: what has been checked, what it said, and
a link straight back to it.

**Files are private, by path and by policy.** Every object lives at
`users/{user_id}/documents/{document_id}/{filename}` in a private bucket. That
prefix is not a naming convention — it is what the storage policies match on, so
building it is a module of its own with tests for the cases that matter: a
filename carrying `../` is reduced to its last segment before anything else
happens, and the path is checked against the caller's own id again at the moment
a download URL is signed. A database constraint refuses to store a path outside
its owner's folder at all. Downloads are short-lived signed URLs, minted per
request; nothing in the bucket is ever public.

**Deleting a document does not delete the checks run on it.** Every analysis
keeps its own copy of the text it read — it has to, or a stored report would
stop matching what it reported on — so the link is cleared rather than
cascading, and the analyses remain, deletable on their own. The confirmation
says so before the click rather than after, because someone deleting their
writing is entitled to know exactly what that reaches.

**An assignment is the one thing here a user writes themselves.** No credits, no
model, nothing derived — so assignments are created and edited directly through
RLS rather than through a privileged function, and the policies are the whole of
the protection. Attaching a draft is checked on both sides: the assignment and
the document must both belong to the caller. Draft versions are numbered by the
server in the order they were attached, so the list is a record of how the work
progressed rather than something a client can renumber.

### How the Writing Coach works

Every other tool answers one question about a draft. This one answers "what
should I do next", which is the question someone with one evening before a
deadline actually has. Its output is therefore a list to work through, not a
report to read.

**The ordering is ours.** A model asked to review a document will return twenty
things in the order it noticed them, which is not advice. So it judges two
things per improvement — how much the work improves if this is done, and how
much work it is — and the arithmetic that turns those into a rank happens in a
pure module with tests. Impact dominates and effort breaks ties: between a large
improvement that takes an hour and a trivial one that takes a minute, the large
one is still the better use of the hour. A model that also volunteered a
priority would be scoring its own homework.

**It reads what you have already paid for.** By the time someone asks for a full
review they have often run a grammar check, a citation check, maybe a grade.
Those are facts about this document, so they are carried forward as
improvements — "add reference entries for the two cited sources that are not in
your list" — and the model is told not to repeat them. Each item is labelled
**Measured** or **Advised**, the same distinction the Citation Checker makes,
and for the same reason.

**One signal is deliberately not carried: the AI Detector's likelihood.**
Turning that number into a to-do list would be building the "make your writing
undetectable" product, whatever the wording on the button. A detection estimate
is information about how a text reads, not an instruction to change it, and the
coach never treats it as one. Both prompts also forbid commenting on whether
the writing appears AI-assisted.

**Coaching is priced per improvement.** "What should I do" and "I don't
understand what you mean by that" are different questions, so the review
produces the list and the coach explains any one item on it for a separate,
smaller charge. An explanation already bought is handed back without charging
again. The tutor is told to teach the principle and demonstrate it on one of the
writer's own sentences, never to rewrite sections — the point is that they can
do it again next time without paying for it.

### How payments work

The money is held by the payment provider. What lives here is the record of
what it told us and what we did about it.

**A browser is never told what was bought.** A checkout session's success URL
is a page anyone can type into the address bar, so it is treated as one: it
says "we're setting this up", never "you're on Pro now". Entitlements change
when the provider says so over a signed webhook, and not a moment before. The
interaction checks assert that the page makes no claim the webhook has not yet
justified.

**A provider retries, so exactly-once is a schema property.** Each delivery is
claimed by inserting the provider's own event id as a primary key; the second
arrival collides and does no work at all. Underneath that, every state change
is keyed on something stable too — an allowance is granted per billing period,
a credit pack per payment reference — so even a delivery that slipped past the
event log could not pay out twice. Both layers are asserted directly.

**The provider is the source of truth.** Subscription events rewrite our record
from what the provider currently says rather than applying a delta. Events
arrive out of order; a state reasserted is harmless, a delta applied twice is
not. The plan is read from the price on the subscription rather than from the
metadata set at checkout, because a user who upgrades inside the provider's own
portal never passes through our checkout.

**Nothing that grants anything is reachable from a session.** `EXECUTE` on
every payment function is revoked from `public` as well as from `anon` and
`authenticated` — Postgres grants it to `public` by default, and revoking only
the two roles leaves the inherited grant in place. The database suite proves
each one is denied to a signed-in user.

**Verification is testable without an account.** A webhook signature is an HMAC
over the request body and touches no network, so `npm run test:webhook` drives
the real endpoint with four deliveries — unsigned, wrongly signed, correctly
signed but replayed an hour later, and correctly signed — and asserts that only
the last is accepted.

**Repricing is a data change.** Prices, allowances, limits and the provider's
price ids are rows in `plans` and `credit_packs`, so the pricing page renders
whatever the catalogue says. A plan with no provider price id says it cannot be
bought rather than offering a button that fails on the provider's own page.

### How administration works

One rule decides the shape of the whole feature: **administering WritePilot does
not require reading customers' writing.**

So every administrative function returns counts, totals and account state, and
not one of them returns a document, a draft, a scan's text, a grade or a review.
An administrator can see that an account ran eleven grammar checks; they cannot
see what was checked. That is not an omission waiting to be filled in — the
access does not exist, and the test suite proves it twice: once that the
functions contain no content, and once that an administrator reading the tables
directly sees zero rows belonging to anyone else.

**The role check lives in the database.** Each function is `SECURITY DEFINER`
and asks `is_admin()` itself, so `EXECUTE` is granted to every authenticated
session and a non-admin calling one directly is refused by Postgres rather than
by a missing button. The page guard decides what is rendered; the function
decides what is permitted; a bug in the first is a wrong-looking page rather
than a privilege escalation.

**Every change is audited, with a reason.** Credit adjustments, plan changes and
role grants each write an audit row in the same transaction as the change. A
credit adjustment without a reason is refused outright — an adjustment nobody
can explain six months later is indistinguishable from an unauthorised one.

**An administrator cannot remove their own admin role.** It is the one change
that cannot be undone by the person making it, so the database refuses it and
an installation cannot lose its last administrator to a misclick.

**The charts follow the data's job, not decoration.** Runs-per-day is one
series, so there is no legend — the caption names what is plotted, and a box
with one swatch would only restate it. Days with no activity render as
zero-height columns rather than being dropped, because a chart that omits quiet
days misreports the shape of the month. The tool ranking is a magnitude
comparison in a single hue rather than nine categorical colours, since the
question is "which is biggest", not "which is which". Failures are stated in
words beside their count, never as a colour alone. The figures behind every
chart are also available as a table.

### Security posture

The protections built alongside each feature are described with that feature.
What Phase 12 added is the layer that sits across all of them.

**A nonce-based Content Security Policy**, issued per request from the proxy —
the only place early enough to mint a nonce. Next reads it back out of the
request's own header and applies it to every script it emits, which is what
makes `'strict-dynamic'` workable without hand-tagging tags. Three decisions in
the policy look like mistakes until you know why, and each is commented where
it is made: `connect-src` names the Supabase origin, because the browser client
talks to it directly and a policy that locks users out of their own accounts
gets switched off within a day; `style-src-attr` allows inline attributes,
because a meter's width is data computed per render and has no nonce mechanism,
while `style-src` itself stays strict so an injected `<style>` block is still
refused; and `'unsafe-eval'` is development-only, where React needs it to
reconstruct server stacks in the browser.

The policy is verified by loading real pages in a real browser and failing on
any violation the page reports — in development *and* against a production
build, because the production policy is the strict one. That check found a real
error on its first run: development had been given both a nonce and
`'unsafe-inline'` for styles, and a browser **ignores** `'unsafe-inline'` as
soon as a nonce appears beside it. The combination is not lenient, it is strict
and surprising. It is now either/or, with a unit test asserting that no
directive ever carries both.

**Rate limits**, separate from entitlements and counted in Postgres.
Entitlements answer "can this account afford this?"; limits answer "is this
account, or this address, going faster than the service should serve?" A user
with two thousand credits still should not open forty concurrent analyses, and
a sign-in form should not accept ten thousand passwords for one email address.
The counter lives in the database because the application runs as more than one
instance, and a limit each instance counts for itself is not a limit. It fails
**open**: a limiter that takes the product down when its own bookkeeping breaks
has caused a worse outage than the one it prevents, and the authorisation
checks underneath it are unaffected either way.

The window is floored from `clock_timestamp()` rather than `now()`. `now()` is
the transaction's start time and does not advance inside one, so a request that
held a transaction across a window boundary would have kept counting against
the window it started in — a slow request quietly exempting itself from the
limit meant to catch it.

**An index behind every foreign key.** Postgres indexes the referenced side of a
foreign key automatically and the referencing side never, which is fine until
the referenced row is deleted: enforcing `on delete set null` then scans the
whole child table, inside the deleting transaction. Deleting a rubric, or
closing an account, is an ordinary user action that triggers exactly that, so
each such column is now indexed — partially, where the column is null for most
rows.

**The development-only preview routes are asserted absent in production**, by
fetching them from a built server and requiring a 404, rather than trusting
that the guard was not edited out.

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
| 3 | AI Detector | **Complete** |
| 4 | Grammar Checker | **Complete** |
| 5 | Naturalize | **Complete** |
| 6 | AI Rubric Grader | **Complete** |
| 7 | Citation Checker | **Complete** |
| 8 | Document and assignment workspaces | **Complete** |
| 9 | Writing Coach and priority improvements | **Complete** |
| 10 | Subscriptions, payments, plan enforcement | **Complete** |
| 11 | Admin dashboard and analytics | **Complete** |
| 12 | Security, testing, optimisation | **Complete** |
| 13 | Landing page, SEO, legal, launch | Next |

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
| `ANTHROPIC_API_KEY` | No | **Secret.** Without it, AI tools report as unavailable and charge nothing |
| `AI_PROVIDER` | No | Defaults to `anthropic` |
| `AI_MODEL` | No | Defaults to `claude-opus-5`; changeable without a deploy |
| `AI_TIMEOUT_MS` | No | Upper bound on one analysis (default 120000) |
