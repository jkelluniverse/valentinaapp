# C39-DEMOS

**Status:** spec, awaiting ratification. Nothing built.
**Covers:** two public, walk-in demos for practitioners evaluating Psychefolio —
DEMO 1 (Psychefolio-branded, the lower tier: what you get without custom
branding) and DEMO 2 (Veritas-branded with mock data, the middle tier: what full
custom branding looks like; Valentina has given explicit permission to use her
branding).
**Does not cover:** a Studio demo, pricing changes, any link from /founders
until Jacob has walked it himself (dispatch), the Sept-23 provisioning demos
(`provisioning/demo-*.json`, PLATFORM §7 — untouched, a different thing).
**Governing rulings:** 209 (separate deployment, own Railway service, own
database, mail disabled at the CODE level not by allowlist) · 210 (walk-in, no
login, prominent always-available practitioner/client toggle on BOTH demos) ·
211 (mock data only, unconditionally — her permission covers branding, not
clients) · 212 (read-mostly with a nightly reset backstop, blocks server-side) ·
213 (subdomains of psychefolio.com, both in RESERVED_SLUGS). Plus the dispatch's
stays-current requirement: migrations must apply to the demo environment by the
same pre-deploy mechanism production uses.

Every claim below is against code read on 2026-10-01 at tip `6cc9853`, and
against the Railway project as the MCP tools describe it today. Secrets were not
read (ruling 73): variable NAMES come from the codebase's `process.env` reads,
never from the dashboard.

---

## 0. The facts that shape everything

**0.1 Railway already holds half of this.** The project (`valentina-app`) has
TWO environments, `production` and `Staging`, and FOUR services:

| service | in environments | created / last deploy | note |
|---|---|---|---|
| `valentinaapp` | production AND Staging | both deployed 2026-10-01T19:58:57Z from `claude/valentinaapp-github-repo-erf4xp` | **the Staging copy already redeploys on every push**, same `railway.json` (preDeployCommand `npx prisma migrate deploy`) |
| `Postgres` | production AND Staging | 2026-08-22 | the describe output shows the SAME volume id (`6fe8e985…`) in both environments — see §1.3 |
| `demo 1 postgres` | Staging only | 2026-09-28T17:07Z | **Jacob has already created the demo's database** (50 GB volume) |
| `Postgres-4MgC` | Staging only | 2026-09-28T17:13Z, six minutes later | purpose unknown; 50 GB volume; §12 Q1 |

The Staging app answers today at `valentinaapp-staging.up.railway.app`: health
`{"ok":true,"db":"up"}`, and `/api/tenant-kind` answers
`{"kind":"tenant","isDefault":true}` — whatever database it reads contains a
tenant with `DEFAULT_TENANT_ID`. Which database that is cannot be determined
from this session without a credential; §1.3 makes it Jacob's first step.

**0.2 Railway forbids the flat URL ruling 213 implies.** Railway's technical
specifications (docs.railway.com/networking/public-networking/specs-and-limits):
*"Subdomains and wildcards cannot overlap (`foo.hello.com` cannot exist with
`*.hello.com` unless owned by the same service)."* Production's `valentinaapp`
service owns `*.psychefolio.com` (list-domains: `valentinavelez.com`,
`psychefolio.com`, `*.psychefolio.com`). So `demo.psychefolio.com` can NOT be a
custom domain of any second service while that wildcard stands. The same page
says *"Wildcards can be used for any subdomain level (e.g. `*.example.com` or
`*.subdomain.example.com`)"* and *"Wildcards cannot be nested
(`*.*.yourdomain.com`)"*. §2 builds on exactly that.

**0.3 Everything already resolves per host.** `lib/tenancy/index.ts`:
`tenantByDomainChecked(host)` (P1's TenantDomain mapping) is consulted FIRST,
then `slugFromHost(host)` against `PLATFORM_DOMAIN` (one label only; a nested
subdomain returns null). Two demo tenants in one deployment is the ordinary
case this resolver was built for (A4 — answered: yes, by mapping rows AND by the
slug pattern, both).

**0.4 The portals authenticate in one place.** `lib/auth-guards.ts`
`getSessionUser()` is the single server-side identity (138 files call it or its
two `require*` wrappers; `auth()` directly only 4). The middleware
(`middleware.ts:92-97`) additionally bounces an unauthenticated `/practitioner*`
or `/space*` request to `/login`. A walk-in demo therefore needs exactly TWO
branch points, not a login-less fork of the app (§3).

**0.5 Every database path funnels through one object.** `lib/prisma-internal.ts`
constructs the ONE `PrismaClient`; `lib/prisma.ts` wraps it (scoped client);
`lib/tenancy/db.ts` reads through it (`tenantDb`, reads only); 17 lib/app files
import it raw (allowlisted). `$queryRaw` appears once in the app
(`app/api/health/route.ts`). A write block at the raw client covers all of them
(§5).

**0.6 Mail has one exit, with two switches already on it.** `lib/notify.ts:301`
is the only `fetch` to Resend (the endpoint is overridable by `RESEND_API_URL`,
a gate affordance). Before it: the non-production allowlist (`:261`) and
`demoTenantSuppressed` (`:217-225`: `tenant.status === "DEMO"` AND the address
is not `@fixture.test`). Neither is ruling 209's code-level disable — the first
is an allowlist, the second is per-tenant and lets fixture addresses through;
both silently do nothing outside a request (`catch → false`). Push:
`lib/push.ts` returns without sending when VAPID keys are absent.

**0.7 The payment providers degrade by design.** `squareConfigured()`
(`lib/square.ts:30`, `lib/payments/square.ts:31`), `webhookConfigured()`
(`lib/payments/square.ts:134`), `stripeConfigured()` (`lib/billing/stripe.ts:19`)
exist for exactly this. Whether every PAGE honours them with no key set is
something a walk proves, not a read (§10, check D).

**0.8 No existing seed is ruling-211 clean.** `prisma/staging-seed.ts` creates
the practitioner as `"Valentina Vélez"` / `valentina@example.com` and a client
`"Jacob Tony"` / `jacob@example.com` — real people's names. `seedDemoFixtures`
(`lib/provisioning.ts:145`) is one fictional client with a profile and two log
entries. `prisma/fixtures/seed-staging.ts` (FIXTURES-SPEC roster) covers the
most models (worksheet, assignment, response, note, lensResult, …) and is guarded
to staging. None covers: leads, charges/payments, agreements, courses, captures,
appointment REQUESTS (C40), availability exceptions, a second practitioner. A3
answered: the roster's SHAPE is reusable; its NAMES are not, and coverage has
gaps (§4.2).

**0.9 Assist Mode is the wrong tool for the toggle.** `lib/assist.ts`: a
signed-in PRACTITIONER's cookie grant (an `AssistGrant` row, 30 minutes,
audited, `forbidInAssist` walls around consent, payments, security, export,
sending messages). It needs a real session, writes a row per switch, goes one
direction only, and deliberately HIDES the surfaces a demo most wants to show.
A5 answered: no reuse; a demo-only persona switch (§3.2).

**0.10 noindex precedent.** Both portal layouts emit
`robots: { index: false, follow: false }`; `app/robots.ts` is `force-static`
and allows `/`, `/book`, `/privacy`. A6: the demo deployment must refuse
indexing on EVERY response, including the public pages, because its public
pages are the demo too (§8).

**0.11 Fresh-database migrations are proven.** The local scratch database was
built by `prisma migrate deploy` alone: `_prisma_migrations` holds 56 rows, all
finished, `00_init` → `55_appointment_requests`. The demo database starts empty
and gets the same command from `railway.json` (§9).

---

## 1. Topology (ruling 209)

**1.1 The recommendation: the existing Staging environment BECOMES the demo
environment.** Rename `Staging` → `demo` (a label; nothing in code reads it
except `RAILWAY_ENVIRONMENT_NAME`, whose only consumers are the non-production
mail allowlist and the staging-only seed route — both fail closed on any name
that is not `production`). Point its `valentinaapp` service at `demo 1
postgres`. This gives, with zero new plumbing:

- own Railway service instance and own database (209) — the service row is
  shared with production as a definition, but each environment runs its own
  instance with its own variables, domains and database; that IS Railway's
  separation model;
- deploys on every push to the deploy branch, already observed (0.1);
- `npx prisma migrate deploy` before every start, the SAME mechanism, the SAME
  `railway.json` — the stays-current requirement by construction (§9).

**1.2 The alternative, if Jacob wants Staging kept for something else:** a new
environment `demo` duplicated from production's service settings, same branch.
Identical in every property above; one more environment to pay for. The spec
is indifferent; the ledger records which.

**1.3 Jacob's first step is a READ in the dashboard, before anything else:**
open the Staging `valentinaapp` service → Variables → confirm which Postgres
service `DATABASE_URL` references. The `Postgres` service appears in BOTH
environments with the same volume id (0.1). If Staging's app reads the
PRODUCTION database today, the Staging deployment is a second live app on her
real data and must be repointed (or deleted) before any demo work — and that is
true whether or not C39 proceeds. The spec cannot settle this; only the
dashboard can. **Do not paste the value anywhere, this session included.**

**1.4 Variables on the demo environment** (names only; values are Jacob's):

| set | value | why |
|---|---|---|
| `DEMO_DEPLOYMENT` | `1` | the one code-level switch every demo behaviour keys on (§3, §5, §7, §8) |
| `NEXT_PUBLIC_DEMO_DEPLOYMENT` | `1` | the same fact for client components (`app/error.tsx` copy, §5.5); baked at build on this environment |
| `PLATFORM_DOMAIN` | `demo.psychefolio.com` | §2 — the demo's own apex for `slugFromHost` |
| `DATABASE_URL` | reference to `demo 1 postgres` | 209 |
| `AUTH_SECRET`, `JOBS_SECRET` | NEW random values, different from production's | a demo JWT or job call must never validate against production, nor the reverse |
| `PUBLIC_APP_URL` | `https://portal.demo.psychefolio.com` | absolute links in copy |
| `RAILWAY_ENVIRONMENT_NAME` | (Railway sets it) | must not read `production` — the gate's env guard and the mail allowlist both key on it |

| UNSET (absent, not blank) | why |
|---|---|
| `RESEND_API_KEY`, `PLATFORM_RESEND_API_KEY`, `NOTIFY_FROM_EMAIL`, `PLATFORM_FROM_EMAIL` | mail — the belt under §7's braces |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | push |
| `SQUARE_*`, `STRIPE_*`, `PAYMENT_PROVIDER` | money (A2); `squareConfigured()` etc. report false |
| `TRANSCRIPTION_*`, `ASSEMBLYAI_*`, `RECORDING_PROVIDER`, `REMARKABLE_SENDER_ALLOWLIST` | ingress routes are 410 or secret-gated already; nothing to receive |
| `ANTHROPIC_API_KEY` | AI features — §10 check D decides whether they degrade or need copy (A7, new) |
| `PLATFORM_ADMIN_EMAILS` | no admin console on a demo |
| `EMAIL_TEAM_ALLOWLIST` | nothing may be allowlisted — 209 says not by allowlist |

`PAYMENT_TOKEN_ENC_KEY`: the build/gates require one; the demo needs a NEW
random 64-hex value (no token is ever stored — §5 blocks the model — but the
module loads it at import).

---

## 2. URLs (ruling 213, under 0.2's constraint)

**2.1 Proposed hosts:**

| demo | host | tenant slug (demo DB) | brand |
|---|---|---|---|
| DEMO 1 | `portal.demo.psychefolio.com` | `portal` | Psychefolio default: `journey-v1` / `warm-clay` / `branding.portalTitle = "Psychefolio"` — exactly what `lib/signup.ts:173-176` gives a new practice, with the practice name set to the fictional practice |
| DEMO 2 | `veritas.demo.psychefolio.com` | `veritas` | tenant #1's row values copied: `layoutKey`, `skinKey`, `branding` (portalTitle `veritas`, logoKey if present), modules — the builder reads them from `provisioning/`-style config committed as `provisioning/c39-veritas-demo.json`, NOT from the production database |
| the memorable one | `demo.psychefolio.com` | — | caught by production's `*.psychefolio.com`; production middleware answers this ONE host with a 308 to `https://portal.demo.psychefolio.com/` (§2.4) |

Both slugs are ALREADY in `RESERVED_SLUGS` (`lib/signup-config.ts:25,35`:
`"veritas"`, `"portal"`), as is `"demo"` (`:26`). Ruling 213 is satisfied
today; the gate pins all three (§10 check A) so a future edit cannot un-reserve
them. No real practice can ever take `portal.psychefolio.com` or
`veritas.psychefolio.com` either — the same list guards production signup.

**2.2 Railway side (Jacob):** on the demo environment's `valentinaapp` service
add the custom domain `*.demo.psychefolio.com` — permitted ("any subdomain
level"), not nested-wildcard, and not overlapping production's `*.psychefolio.com`
by Railway's own rule (overlap is `foo.hello.com` vs `*.hello.com`; §12 Q2 asks
Jacob to confirm the dashboard accepts it, since the doc states the rule and
not every corner of it). Railway hands back two CNAMEs (`*.demo` and
`_acme-challenge.demo`) and one TXT; all three go into DNS.

**2.3 DNS caveat, stated now so it is not discovered later:** Railway's
Cloudflare notes say a domain deeper than one level under a proxied zone needs
either DNS-only records (grey cloud) or Cloudflare's Advanced Certificate
Manager. If psychefolio.com's DNS is Cloudflare-proxied, the `*.demo` records
must be DNS-only. If DNS is elsewhere, nothing applies.

**2.4 The one production change this spec asks for:** `middleware.ts` — when
the request host is exactly `demo.${PLATFORM_DOMAIN}` AND the deployment is NOT
a demo (`!process.env.DEMO_DEPLOYMENT`), redirect to
`https://portal.demo.${PLATFORM_DOMAIN}${pathname}` (308). Today that host
resolves to no tenant and C26 serves the neutral shell; after this it serves
the front door of the demo. Tenant hosts never match (`demo` is reserved, so no
practice owns it). Gate-pinned in §10 check A and in `audits/host-tenancy-verify`'s
redirect leg.

**2.5 The demo deployment's own view of `psychefolio.com`:** with
`PLATFORM_DOMAIN = demo.psychefolio.com`, `isPlatformHost()` is true only for
`demo.psychefolio.com` and `www.demo.psychefolio.com` — hosts DNS never sends
to this service (0.2/2.1). `/founders`, `/platform`, `/join`, `/signup` are
therefore unreachable on the demo by construction; §10 check A asserts 404 for
`/founders` on both demo hosts (ruling 203 guard, host-aware).

---

## 3. Walk-in and the toggle (ruling 210)

**3.1 Arrival.** `https://portal.demo.psychefolio.com/` → 307 → `/practitioner`
(the demo deployment's middleware branch; today a non-default tenant's `/`
goes to `/book`). The visitor lands INSIDE the practitioner portal of the
fictional practice, signed in as its practitioner persona, with the demo bar
across the top (3.3). Same for `veritas.demo…`. `/login` on a demo host → 307
`/practitioner` too; there is nothing to log into. The public pages (`/book`,
`/privacy`) stay reachable and ARE part of the demo — a visitor can walk the
funnel as a stranger would; the resulting Lead/Appointment rows are allowed
writes (§5) and vanish at the reset (§6).

**3.2 Persona resolution — two branch points, both fail-closed.**

(a) `getSessionUser()`: FIRST, if `process.env.DEMO_DEPLOYMENT` is set, resolve
the request tenant; if `tenant.status === "DEMO"` AND the demo integrity check
(§4.3) currently passes, read cookie `psf-demo-view` (`practitioner` |
`client`; absent = `practitioner`) and return the tenant's designated persona
User for that role (found by a fixed fixture email per tenant, e.g.
`practitioner@portal.fixture.test`, `client@portal.fixture.test`). Every
other case — flag unset, tenant not DEMO, integrity failing, persona row
missing — falls through to the existing code unchanged. **The flag alone never
signs anyone in**: a DEMO_DEPLOYMENT value leaking onto production would still
find `ACTIVE` tenants and change nothing. §10 check C proves that with a
positive control (flag ON, an ACTIVE tenant → `/practitioner` still 307s to
`/login`).

(b) `middleware.ts`: the `isProtected && !req.auth?.user → /login` bounce is
skipped when `DEMO_DEPLOYMENT` is set (the edge runtime reads env). The real
gate is (a) — the middleware is "only a coarse convenience" by its own comment,
and (a) still refuses when the tenant is not DEMO, so the demo host's
`/practitioner` without a persona row falls through to `requirePractitioner()`
→ `/login` → 307 `/practitioner` — a loop. The builder breaks it by having
`/login` on a demo host render a plain "demo unavailable" page when (a) returns
null, instead of redirecting. Gate check C covers the integrity-fail branch
and must see that page, not a loop (Playwright reports `ERR_TOO_MANY_REDIRECTS`
as a failure).

`assistedBy` is never set in demo; Assist Mode's entry action is denied by §5
(`assistGrant` is not an allowed model) so its button leads to the friendly
block copy — which is itself a truthful demo of the feature's existence.

**3.3 The demo bar** (`components/demo/DemoBar.tsx`, server component, rendered
by BOTH portal layouts — `app/practitioner/layout.tsx:47` and
`app/space/layout.tsx:142-143`, exactly where `<DemoBanner />` renders today, so
it appears under both layout trees (`journey-v1`, `dashboard-v1`) without
touching a shell — and only when (a) resolved a persona). Contents, left to right, wrapping on mobile:

- "You're walking the **practitioner** side" / "…the **client** side";
- a toggle button: "See the client side" / "See the practitioner side" —
  a server action that sets the cookie and redirects to the other portal's
  home (`/space` ↔ `/practitioner`). This is the ONE write a demo visitor makes
  that is not a database write;
- "Reset the demo" (§6.3), behind a confirm;
- the fictional notice (today's `DemoBanner` copy, kept: "Demonstration space —
  everyone here is fictional"), and a "Psychefolio" link to the platform site.

Mobile-first (ruling 207): designed and gate-measured at 375, 390, 768, 1440;
the bar must never push the shell's own header off-screen (a collapsed-container
detector exactly as `audits/founders-visual-verify.ts` does it, same threshold,
same justification). EN and ES (law 7): copy in `messages/{en,es}/demo.json`;
the persona User's `locale` drives the portal language, and the language switch
in the client portal is an allowed `User.update` on `locale` only (§5.2).

**3.4 Personas.** Each demo tenant seeds exactly one practitioner and one
"featured" client who is the persona for client view — the client with the
richest record (messages, worksheets, a chart, an upcoming appointment, an
agreement). Other seeded clients exist to populate the practitioner's lists.
Persona passwords are random and never printed; nothing can log in as them
(no login exists on the demo, and `/api/auth/*` still works but the persona
is served regardless of session — the gate asserts a bogus credentials POST
changes nothing).

---

## 4. Mock data only, ENFORCED (ruling 211)

**4.1 What enforcement means here.** The demo database can only ever contain
fiction if (i) nothing but the seed writes identities into it, (ii) the seed
is fictional by construction, and (iii) the deployment REFUSES to be a demo the
moment either fails. (i) is §5 (no `User.create` outside the seed; §5.2) and
§1.3 (no production dump — the database starts empty and is only ever
migrated and seeded). (ii) is 4.2. (iii) is 4.3, and it is the part that makes
211 a mechanism rather than an intention.

**4.2 The seed: `prisma/demo-seed.ts`.** Deterministic (fixed anchor relative to
"now" at run time so appointments are always in the near future; hashed
placements as `prisma/fixtures` already does), idempotent (truncate-then-create
inside §6's reset scope), fictional roster committed in
`prisma/fixtures/demo-roster.json` — every person has a name that is not a
real person's in this program (no Valentina, no Jacob, no Vélez, no client
name that has ever appeared in this repository's fixtures as a real person),
every email ends in `@fixture.test`, every phone is a 555 number, every
birthplace is real geography attached to a fictional person. Two tenants from
two config files (`provisioning/c39-portal-demo.json`,
`provisioning/c39-veritas-demo.json`), both `status: "DEMO"`, `TenantBilling`
plan `FOUNDING_COMP` (as `lib/billing/provision.ts:27` already does for demos),
`TenantDomain` rows for both hosts, ids that are NOT `DEFAULT_TENANT_ID`.

Coverage per tenant (the practitioner must have something to show on every
tab, the client on every tab): users (1 practitioner, 1 featured client, 5
clients), consentGrant, clientProfile (with birth data → charts via
`ensureChart` on first view, an allowed write), schedulingConfig,
availabilityRule ×5, appointments (past completed ×6 with notes, upcoming
SCHEDULED ×3, one REQUESTED for C40's requests block), leads (NEW ×2,
REQUESTED ×1), conversations + messages (one unread from a client), logEntry ×8
with recordItems, psycheNode/Edge (the First Map), worksheet + assignment +
response, note ×3 (one drafted), course + chapter + lesson + enrollment,
agreementTemplate ×2 (one ACTIVE) + one signed agreement, priceBook + package +
sessionCredit (so Payments has rows; no charge ever reaches a provider), prompt
+ libraryFolder + libraryItem (via `ensureLibrary` shape), practiceSetting rows
(`bookingRequiresApproval` ON for DEMO 2 so the request flow shows, OFF for
DEMO 1 so both copies of ruling 224 are demonstrable). Captures, recordings,
reMarkable, external scheduling connections: NONE (their routes are disabled
or secret-gated; the pages show their empty states, which is honest).

**4.3 The integrity check: `lib/demo/integrity.ts`.** `demoIntegrity()` runs
three raw counts: (1) `User` rows whose email does not end `@fixture.test`
→ must be 0; (2) `Tenant` rows whose status is not `DEMO` → must be 0
(the platform tenant is not seeded on the demo DB); (3) scoped rows whose
`tenantId` is not one of the demo tenants' ids (sampled over `user`,
`appointment`, `lead`, `message`, `logEntry`) → must be 0. Result cached 5
minutes in-process. Consumers: §3.2(a) refuses walk-in while it fails; §6's
reset runs it before AND after and refuses to run when the BEFORE fails for
reason (2) — a database with an ACTIVE tenant is not a demo database and
nothing may be deleted from it; `/api/health` on a demo deployment adds
`demo: "ok" | "FAIL"` to its body. Failure logs one line per 5 minutes:
`[demo-integrity] FAIL reason=<1|2|3> count=<n>`. §10 check B inserts one
non-fixture user and watches walk-in refuse, then removes it and watches it
return (positive control, ruling 110).

**4.4 DEMO 2 and her name.** Her permission covers BRANDING. The spec therefore
gives the Veritas demo a fictional practitioner ("Dr. Elena Marchetti" or
whatever the roster says) wearing Veritas's layout, skin, wordmark and colours.
If the Architect or Jacob rules that her own name on the practitioner persona
is branding too, it is a one-line roster change — but the default is the
narrower reading (§12 Q3).

---

## 5. Read-mostly, blocked server-side (ruling 212)

**5.1 Where the block lives.** `lib/prisma-internal.ts`: when
`process.env.DEMO_DEPLOYMENT` is set, the exported `rawPrisma` is
`base.$extends(demoWriteGuard)` — a Prisma 5 query extension on `$allModels`
`$allOperations`. Every path in 0.5 inherits it: the scoped client, `tenantDb`,
all 17 raw importers, every `$transaction` form. `$queryRaw`/`$executeRaw` are
outside the extension's model operations; the only app use is `SELECT 1`, and
`scripts/guard-prisma.ts` already build-guards raw SQL to the allowlist. The
extension is one file, one function, gate-covered; not a 55-file edit of
server actions, and not a greyed button anywhere.

**5.2 The policy — default DENY, explicit ALLOW, deletes never:**

| rule | models / methods | why |
|---|---|---|
| DENY always | `delete`, `deleteMany` on every model | a visitor emptying the cast empties the demo for everyone until 04:10 |
| ALLOW (create/update/upsert/updateMany/createMany) | `logEntry`, `recordItem`, `entryDeepening`, `psycheNode`, `psycheEdge`, `psycheExtraction`, `message`, `conversation`, `appointment`, `lead`, `worksheet`, `worksheetAssignment`, `worksheetResponse`, `note`, `prompt`, `assignment`, `promptResponse`, `libraryFolder`, `libraryItem`, `course`, `chapter`, `lesson`, `enrollment`, `lessonProgress`, `sessionPrep`, `clientGoal`, `beliefWork`, `interventionOutcome`, `askRecordAnswer`, `resonanceMark`, `integrationGuide`, `agreementTemplate`, `agreement`, `agreementEvent`, `agreementFile`, `practiceSetting`, `schedulingConfig`, `availabilityRule`, `availabilityException`, `clientProfile`, `clientHintState`, `humanDesignChart`, `birthChartCore`, `lensResult`, `integrativeProfile`, `integrativeReading`, `artifactVersion`, `reading`, `patternArchetype`, `patternLink`, `patternElection`, `stageChange`, `activityEvent`, `auditEvent`, `intakeFlow`, `intakeAnswer`, `consentGrant`, `invite` | the content a visitor plausibly touches; all of it is reset nightly; none of it leaves the deployment |
| ALLOW, field-restricted | `user.update` where `data` keys ⊆ `{ locale }` | the language switch; anything else on `user` (password, email, name, role, active, sessionVersion, mustChangePassword) is denied |
| DENY (everything not listed) | `user` (create/other updates), `tenant`, `tenantDomain`, `tenantModule`, `tenantBilling`, `connectedPaymentAccount`, `charge`, `payment`, `externalPayment`, `squareCustomerLink`, `priceBook`, `package`, `sessionCredit`, `webhookEvent`, `externalSchedulingConnection`, `assistGrant`, `pushSubscription`, `emailChangeRequest`, `passwordResetToken`, `deletionRequest`, `sessionCapture`, `recordingConsent`, `recordingDraft`, `sessionTranscript`, `noteScan`, `handwrittenNote`, `psycheAudit`, `practitionerProspect`, and any model added later (new models are denied until listed) | identity, tenancy, money, provider plumbing, storage, and anything that changes WHO the demo is |

`priceBook`/`package`/`sessionCredit` are denied although seeded: editing
rates is a money surface, and the Billing pages demonstrate well as read-only.
`practiceSetting` is ALLOWED on purpose and is the one judgment ruling 212's
"read-mostly" turns on: flipping `bookingRequiresApproval` in the demo changes
`/book`'s copy for the next visitor until the reset. A practitioner evaluating
the product should be able to flip a setting and see the product obey; the
cross-visitor cost is bounded to one day and to a demo. §12 Q4 asks for the
ruling either way.

**5.3 Behaviour on deny.** The extension throws `DemoWriteBlockedError(model,
method)` and logs ONE line: `[demo-block] model=<m> method=<op> path=<pathname
if known>`. It does not return a fake row (callers would proceed as if the
write happened — the C40 lesson: a status is not an outcome).

**5.4 The reset scope.** `lib/demo/reset-scope.ts` — an `AsyncLocalStorage`
flag; the extension consults it FIRST and passes everything through while set.
Only §6's route and the seed enter it. Nothing on a request path can (the
module is not imported by any page or action; `scripts/guard-prisma.ts` gains
one more scan: `reset-scope` may be imported only by `lib/demo/*`,
`prisma/demo-seed.ts`, `app/api/jobs/demo-reset/route.ts`).

**5.5 Friendly copy for Jacob's demo, honestly bounded.** A denied write
inside a server action surfaces as a thrown error → `app/error.tsx`. In
production Next strips server error messages from the client; the boundary
sees only a digest. So `app/error.tsx` branches on
`process.env.NEXT_PUBLIC_DEMO_DEPLOYMENT` (build-time, demo environment only):
heading "That part is switched off in the demo", body "This is a demonstration
space, so a few actions — deleting, payments, account changes — are turned off
here. Everything else is yours to explore.", button "Back to the demo". EN/ES.
**Limitation, stated:** on the demo deployment a GENUINE render error wears the
same copy. The digest still pairs it with the server log, and the demo is
otherwise the same build production runs green. Acceptable for a demo; written
into the component's header per ruling 109.

**5.6 Writes on READ paths must be ALLOWED, enumerated so the walk can prove
it.** Found by reading every `page.tsx`/`layout.tsx` and the lib functions
they call: `getOrCreateConfig` → `schedulingConfig.create` (14 pages);
`getOrCreateConversation` → `conversation.create` (2); `ensureLibrary` →
`libraryFolder.upsert` (1); `ensureChart` → `birthChartCore`/`lensResult`/
`humanDesignChart.upsert` + `clientProfile.update` (2); `discoveryActive` →
`clientHintState.upsert` (1); `ensureReading` → `integrativeReading` (1).
All are in the ALLOW set. `app/practitioner/captures/page.tsx:63` updates
`sessionCapture` on view (a stuck-capture nudge) — DENIED model; the builder
wraps that one call so a `DemoWriteBlockedError` is caught and the page
renders (it is a side effect, not the page's content), and records it in the
ledger as the one read path that writes a denied model. §10 check E walks
every GET of both portals under both personas and asserts ZERO `[demo-block]`
lines — a blocked write during a GET is a defect in this spec's table, not a
feature.

---

## 6. The reset (ruling 212's backstop)

**6.1 Route:** `POST /api/jobs/demo-reset`, `force-dynamic`, `maxDuration 300`.
Guards in order, each its own refusal: (1) `JOBS_SECRET` timing-safe compare as
`app/api/jobs/tick/route.ts:27-37` does → 401; (2) `DEMO_DEPLOYMENT` unset →
403 `{ error: "not a demo deployment" }`; (3) `RAILWAY_ENVIRONMENT_NAME ===
"production"` → 403 (belt; the seed-fixtures route's own guard); (4)
`demoIntegrity()` reason (2) failing → 403 `{ error: "database holds a
non-DEMO tenant — refusing to reset" }` and `[demo-reset] REFUSED`. Then, inside
the reset scope and one transaction per tenant: delete scoped rows for the demo
tenants' ids in dependency order (the seed owns the order), re-run
`prisma/demo-seed.ts` in-process, run `demoIntegrity()` again, answer
`{ ok: true, tenants: 2, seeded: {…counters} }` and log `[demo-reset] applied
tenants=2 ms=<n>`. This route resolves its tenants from the DATABASE, never from
the host → `audits/host-tenancy-verify.ts` inventory kind `m2m-host-exempt`;
the inventory pin moves 18 → 19 and the walk 16 → 17 (ruling 246's reference
updates with the C39 commit).

**6.2 Schedule:** a SECOND cron-job.org job, nightly 04:10 America/New_York,
`POST https://portal.demo.psychefolio.com/api/jobs/demo-reset` with the demo's
`JOBS_SECRET` as a Bearer header (not a query string — it is a new job, so
there is no reason to repeat the existing job's URL-secret shape).
`docs/EXTERNAL-SERVICES.md` §1 gets a second table and a second "what silently
breaks it" list. The production tick (job 8110930) is NOT pointed at the demo
and the demo does not need a tick: nothing there must be reminded, charged or
auto-completed; stale fixture appointments are re-anchored by the nightly seed.

**6.3 "Reset the demo" in the bar:** a server action with guards (2)–(4)
above plus an in-process rate limit (one reset per 10 minutes per instance; a
second press inside the window gets "The demo was just reset — give it a few
minutes"). Anyone can press it; a reset only ever restores the seed. The
confirm step says what it does ("Puts everything back the way the demo
started. Anyone else walking it right now will see that too.").

---

## 7. Mail, push, providers — disabled at the CODE level (ruling 209; A1, A2)

**7.1 Mail.** `lib/notify.ts` `send()`: a new FIRST check, before the
allowlist and before `demoTenantSuppressed`:

```ts
if (process.env.DEMO_DEPLOYMENT) {
  console.info("[notify] DEMO deployment — send refused at the code level");
  return { ok: false, skipped: true };
}
```

Unconditional on recipient — fixture addresses included — and placed in the
one function every email passes through (0.6). This is the braces; the absent
keys (§1.4) are the belt; `demoTenantSuppressed` stays as a third layer that
also fires for any DEMO tenant anywhere. Same shape in `lib/push.ts`
`ensureConfigured()` → `false` with one log line. §10 check F boots the gate
server WITH `RESEND_API_KEY` set and `RESEND_API_URL` pointed at a local sink,
drives three mail-producing actions (book a call, send a message, flip a
notification setting) and asserts the sink saw **0** requests and the log saw
3 `[notify] DEMO deployment` lines; positive control: the same server with the
flag unset → sink ≥ 1 (ruling 110). A1 answered: nothing crashes because the
refusal is a normal `skipped` result every caller already handles.

**7.2 Payments and billing.** No key → `squareConfigured()`,
`webhookConfigured()`, `stripeConfigured()` false. The spec adds nothing here
on purpose; §10 check D is the proof (every page 200 with no provider env), and
any page that 500s is a defect C39 fixes with degrade copy, logged in the
ledger by page. The webhook routes (`/api/webhooks/square`, `/api/webhooks/stripe`
etc.) answer 503/400 unsigned as they do in production — unchanged, pinned.

**7.3 AI (A7, new).** `ANTHROPIC_API_KEY` is read in 13 files. Unset on the
demo, check D decides: pages that degrade keep their copy; pages that break get
a one-line "Not available in the demo" state. The spec does not guess which.

---

## 8. noindex (A6)

Three layers, all keyed on `DEMO_DEPLOYMENT`: (1) `next.config.mjs` `headers()`
adds `X-Robots-Tag: noindex, nofollow` to `/(.*)` (read at build on the demo
environment; applies to every route including `/book` and `/api`); (2)
`app/robots.ts` returns `disallow: ["/"]` and no sitemap; (3) the public layout's
`generateMetadata` adds `robots: { index: false, follow: false }`. Production
is byte-identical: all three branch on a variable production does not have, and
§10 check G asserts the header is ABSENT with the flag unset (positive control)
and PRESENT on every one of 12 sampled routes with it set.

---

## 9. Staying current with the product

Same repository, same deploy branch, same `railway.json`, same preDeployCommand
(§1.1). A push deploys production and the demo in parallel, independently; a
demo deploy failure never blocks production and vice versa (Railway deploys
per environment). Migrations apply to the demo database by `npx prisma migrate
deploy` — the dispatch's requirement verbatim, and 0.11 proves the fresh-DB
path. The seed re-runs nightly, so a new column shows its default and a new
table shows its empty state until the seed is extended.

**Standing-rule candidate (§12 Q5):** every spec that adds a client-visible
model adds its demo seed rows in the same commit, and
`audits/demo/demo-verify.ts` counts seeded models against `SCOPED_MODELS` and
prints the uncovered ones in its SCOPE line, so coverage debt is visible on
every sweep rather than discovered on a sales call.

---

## 10. Acceptance — `audits/demo/demo-verify.ts` (ports 3188 / 3189)

Two servers from one build on the scratch database: **DEMO** (3188:
`DEMO_DEPLOYMENT=1`, `PLATFORM_DOMAIN=demo.c39.test`, `RESEND_API_KEY=sink`,
`RESEND_API_URL=http://127.0.0.1:3190`, NO Square/Stripe/VAPID/Anthropic env)
and **CONTROL** (3189: identical minus `DEMO_DEPLOYMENT`). Playwright with
`--host-resolver-rules=MAP portal.demo.c39.test 127.0.0.1, MAP
veritas.demo.c39.test 127.0.0.1` and navigation to the tenant host (the
server-action Origin lesson from C40). Self-cleaning: the seed's own reset
scope tears down and recreates both demo tenants before and after. Refuses a
Railway `DATABASE_URL` and `RAILWAY_ENVIRONMENT_NAME=production`.

| check | asserts | positive control (ruling 110) |
|---|---|---|
| A — reservations & routing | `RESERVED_SLUGS` contains `portal`, `veritas`, `demo`; CONTROL redirects host `demo.c39.test` `/` → `https://portal.demo.c39.test/` 308; DEMO `/` → `/practitioner` 307 on both hosts; `/login` → `/practitioner`; `/founders` 404 on both demo hosts | CONTROL `/founders` on a platform host 200 |
| B — integrity | fresh seed → `demoIntegrity()` ok; insert one `real@person.example` user → walk-in refused ("demo unavailable", no redirect loop), `/api/health` body `demo:"FAIL"`, reset route 200 still (reason 1 does not block reset; reason 2 does); remove it → ok again; insert an ACTIVE tenant → reset route 403 with the quoted body | the 403 body text, not the status (ruling 243) |
| C — walk-in fail-closed | DEMO + ACTIVE-tenant host → `/practitioner` 307 `/login`; CONTROL (flag off) + DEMO tenant → 307 `/login` | both arms are the control of each other |
| D — degrade walk | every `page.tsx` under `app/practitioner` and `app/space` (54 + 30 at tip) GET 200 under both hosts × both personas, no provider env, no AI key; any 500 printed by path | CONTROL walk with a signed-in fixture → same 200 set |
| E — read paths never write | during check D's walk the DEMO server log has ZERO `[demo-block]` lines | check H produces ≥ 1 on purpose |
| F — mail/push refused in code | three mail-producing actions → sink 0 hits, 3 `[notify] DEMO deployment` lines; push subscribe → `[push] DEMO deployment` line | CONTROL same three actions → sink ≥ 1 |
| G — noindex | 12 sampled routes (public, portal, api) carry `X-Robots-Tag: noindex, nofollow`; `/robots.txt` disallows `/` | CONTROL: header absent on all 12 |
| H — the block | as client persona: write a journal entry → row exists; as practitioner: delete that client → `[demo-block] model=user method=delete`, page shows the §5.5 copy (DOM read, not payload — the C40 lesson); edit own password → blocked; switch locale → allowed, portal renders in ES | the journal write succeeded (ALLOW arm) |
| I — toggle | bar present on both portals, both hosts, four viewports; no collapsed container (founders detector, 5 px/char); click toggle → cookie set, lands on `/space`, bar says client; back → practitioner; bar copy EN then ES | — |
| J — reset | after H's writes: `POST /api/jobs/demo-reset` with the gate's JOBS_SECRET → `{ok:true, tenants:2}`; the journal row is gone; the roster counts equal the seed's; bar button → same, second press inside 10 min → rate-limit copy; wrong secret → 401; CONTROL → 403 `not a demo deployment` | row present before, absent after |
| K — inventory | `audits/host-tenancy-verify.ts` walk 17, inventory 19, new route kind `m2m-host-exempt` | existing pins move exactly +1 each |

SCOPE line (ruling 208): `SCOPE host=portal.demo.c39.test,veritas.demo.c39.test
viewports=375,390,768,1440 build=<sha> seed-models=<n>/<SCOPED_MODELS.length>
NOT covered: Railway domain acceptance (§2.2), DNS, cron-job.org job, the
production database question (§1.3), real Chromium against production`.
Registered in `scripts/regress.sh` as `demo` (entry 50, before stamp-audit).

---

## 11. Jacob's dashboard steps (nothing pasted here — ruling 73)

1. **Read first (§1.3):** Staging `valentinaapp` → Variables → which Postgres
   does `DATABASE_URL` reference? Tell me only "production", "demo 1 postgres",
   or "other".
2. Tell me what `Postgres-4MgC` is for (§12 Q1). If it was a duplicate click,
   delete it — two idle 50 GB volumes cost money.
3. Rename environment `Staging` → `demo` (or create `demo`, §1.2).
4. Set the variables of §1.4; remove the ones listed UNSET. Generate the new
   `AUTH_SECRET`, `JOBS_SECRET`, `PAYMENT_TOKEN_ENC_KEY` in the dashboard.
5. Add custom domain `*.demo.psychefolio.com` to the demo environment's
   `valentinaapp`; create the two CNAMEs and the TXT at the DNS provider
   (DNS-only if Cloudflare-proxied, §2.3).
6. After the C39 deploy: cron-job.org → new job, nightly 04:10
   America/New_York, `POST https://portal.demo.psychefolio.com/api/jobs/demo-reset`,
   header `Authorization: Bearer <demo JOBS_SECRET>`.
7. Trigger the first reset once by hand from the dashboard's job page; then
   walk both demos yourself before any link exists anywhere (dispatch).

Build order inside C39, each its own commit on the deploy branch (push =
deploy, both environments): (i) `RESERVED_SLUGS` pin + §2.4 redirect + §8
headers + §7 code switches — all inert on production, gate A/F/G; (ii) the
block, the integrity check, the reset route, the seed — inert on production
(flag unset), gates B/E/H/J/K; (iii) walk-in, personas, the bar, `/login`
page, `error.tsx` copy — gates C/D/I. Ruling-48 on every push as always;
production bytes must not move on any of the three (root 37295 / 35 / 6
pinned, `/book` "Confirm my call" ×1).

---

## 12. Open questions for ruling

- **Q1** `Postgres-4MgC` — what is it? (Fact, not a decision; blocks nothing.)
- **Q2** Does Railway's dashboard accept `*.demo.psychefolio.com` on the demo
  service while production holds `*.psychefolio.com`? The published rule says
  yes (overlap is defined as `foo.hello.com` vs `*.hello.com`); the dashboard
  is the authority. If it refuses, the fallback is `*.demo.psychefolio.app`
  (Jacob owns psychefolio.app) — which would amend ruling 213 and needs a
  ruling before I build §2.
- **Q3** DEMO 2's practitioner persona: fictional name under Veritas branding
  (the spec's default, §4.4), or her name?
- **Q4** `practiceSetting` ALLOWED in the demo (§5.2) — ratify or deny.
- **Q5** The standing rule in §9: every new client-visible model ships with
  demo seed rows, coverage printed in the SCOPE line.
- **Q6** Reset time 04:10 America/New_York, and the in-bar reset button at all
  (§6.3) — Jacob's call; the spec includes it.

## 13. Out of scope (dispatch, restated)

Studio demo. Pricing changes. Any link from /founders or anywhere else until
Jacob has walked both demos himself. Changing the Sept-23 provisioning demos.
Pointing the production tick at the demo. A login on the demo.
