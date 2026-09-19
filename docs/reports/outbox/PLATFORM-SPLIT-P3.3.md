# PLATFORM SPLIT — P3.3 REPORT (the default-tenant fallback is gone)

**There is no longer any code path by which an unknown host becomes Valentina.**
`slugFromHost` returned `"valentina"` for every host it could not parse; the data
layer turned that into her tenant id and read and wrote her rows. Both are gone.
An unmapped host now resolves to nothing, and the two layers refuse in the two
different ways they should: the chrome renders C26's unresolved shell, the data
layer throws (ruling 112).

## What was built

**`lib/tenancy/index.ts` — the chrome resolver.** `slugFromHost` returns
`string | null`; the three fallback returns are `null`. `resolveTenant` treats a
null slug as `unresolved`. **`FRESH_DB_SHELL` is deleted** — it was a hardcoded
copy of tenant #1's identity (id, display name, skin) served when the default row
was absent, the one place her practice existed as a literal in application code
rather than as data. An empty database is now unresolved, which is what it is.

**`lib/prisma.ts` — the data resolver.** An unresolvable host throws
`TenantUnresolvedError`. So does an unknown SLUG, which used to default to her id
with the comment "behaves like the default host". The two layers deliberately
diverge there: default-host CONTENT on a subdomain nobody owns is harmless, the
same content backed by HER ROWS is not. That divergence is ruling 113 in one
branch.

**`middleware.ts`** — the duplicated `"valentina"` literal is gone with its
short-circuit. `/api/tenant-kind` answers the same question truthfully for that
host at the cost of one cached in-process hop on the rarest path.

**Out of a request, a caller STATES its tenant.** `getTenantResolution()` outside
a request used to answer "the default practice". It now consults the ambient
`withTenantScope(T, …)` the data layer has required since C24.1 (ruling 24) and
is `unresolved` without one. This closes a real gap rather than opening one: the
two layers previously DISAGREED out of a request, the data layer honouring the
stated tenant while `getTenant()` still answered Valentina. A request's tenant
still always wins; nothing a wrapper does can reach the request path.

**`audits/host-tenancy-verify.ts` (NEW, rulings 113/114/122)** — the inventory
gate. It discovers every route under `app/api` that reaches tenant-scoped data
without a user session (9 today) and fails when one is unclassified, when a
classified route disappears, or when the `m2m-host-exempt` set is anything but
`/api/jobs/tick` and `/api/square/webhook`, each with its reason and tracking
item. Its limitations are written into the file (ruling 109).

**`audits/tick-refusal-verify.ts` (NEW)** — the demonstration that an
empty-but-successful tick run is impossible, asserted over HTTP against the built
app rather than claimed.

**Migration 51** maps the staging host. **`audits/_fixtures/local-domains.ts`**
maps the loopback hosts for gates and local development — a fixture, never a
migration, so production data never regains the claim that some host is hers by
default.

## THE ORDER TO BUILD ARRIVED WITH TWO QUESTIONS OPEN. HERE IS HOW EACH RESOLVED.

**Question 1 — the exemption — dissolved once its mechanism was pinned down, and
ruling 122 stands unchanged.** The preflight recommended dropping it because both
live callers use the mapped host, so a runtime escape hatch would never fire
except in the one case that must refuse loudly. That objection was to a RUNTIME
exemption. Ruling 114 asks for "a transitional exemption + scanner + tracking
item", and ruling 113's subject is Host as a TENANCY SOURCE for
machine-to-machine callbacks — so the exemption belongs in the scanner, not in
the resolver. As built there is **no runtime fallback for anyone**: both exempt
routes resolve through `TenantDomain` exactly like every other host, and a
provider repointed at an unmapped host gets a loud refusal, which is what the
preflight asked for. What the exemption records is the weaker, still-true fact
that their tenant is decided by Host AT ALL, with the tracking items that retire
it. Both positions are satisfied; neither was traded away.

**Question 2 — the gate fixture — answered by measurement, and it reversed my own
recommendation.** The preflight recommended a migration seeding `localhost`. It
should not be a migration: that would write "some host belongs to Valentina by
default" into PRODUCTION data, which is ruling 85's claim restated in a new
location, and the row would be both unreachable and untrue there. It is a
fixture. The fixture is also closer to production than what it replaces — a gate
that used to ride the fallback now exercises the `TenantDomain` mapping, which is
the path production uses.

## THE PROBE SWEEP — 19 of 38 RED, measured BEFORE a line of P3.3 shipped

The blast radius was not estimated. The maximal removal was applied in a detached
worktree and the standing set run against it, so the gate work was sized from a
list rather than a guess.

**RED (19):** smoke · signup · capture · referral · engage · tenant-scope ·
nested-stamp · settings-i18n · platform-phase5 · platform-verify · c21 · c20 ·
v31 · onboarding-stage1 · onboarding-ui · onboarding-discovery ·
fail-closed-tenancy · event-chrome · demo-path.
**GREEN (19):** lint-wall · guard-prisma · tsc · build · smoke-writes ·
platform-phase2 · platform-phase3 · c12x · onboarding-complete ·
onboarding-update · password-reset · amd06 · practice-setting · email-identity ·
gate-hygiene · port-uniqueness · nexturl-origin · harness-guard · stamp-audit.
`SWEEP EXIT: 1` — the exit-code guard from P1's red still holds.

Two findings from the probe that the probe existed to produce:

1. **`tsc` passed.** Changing `slugFromHost` from `string` to `string | null`
   errored at the ONE call site that passes the value on, and at none of the four
   in `audits/platform/verify.ts` that COMPARE it — `===` against a string
   literal is legal on a nullable string, so those four would have flipped from
   true to false at runtime with no build error. The gate, not the compiler,
   holds that half. It is written into `slugFromHost`'s comment.
2. **`/book` was the only broken page in smoke**, and every authenticated page
   passed — the authed surface carries session-derived scope, not host-derived.

## FOUR DEFECTS FOUND BEFORE THEY SHIPPED, EACH BY A DIFFERENT INSTRUMENT

**1. P3.3 would have sent the whole platform host to `/unavailable`** — found by
reading the resolver change through to `app/(public)/layout.tsx`. That layout
redirects on `unresolved`, and after P3.3 psychefolio.com IS unresolved, so
`/platform`, `/signup` and `/join` on the apex — everything P2 shipped — would
have silently regressed on the first deploy. The fix is not an exception for the
platform: it is an ORDERING that says what is true. `unresolved` means "we do not
know whose host this is"; on the platform host we know precisely, and the answer
is nobody's. The platform check now runs first.

**2. P3.3 baked `/unavailable` into the STATIC marketing home — and my first fix
for it was wrong, which the build artifact said out loud.** `next build` renders
`/` with no visitor, the layout read `unresolved`, and C26's redirect fired at
BUILD time. Two gates caught it independently: `audits/signup/verify.ts`, whose
reachability check fetches `/` and looks for the signup link, and
`audits/event-chrome-verify.ts`, which reported `/ → 307` and her identity counts
collapsing 35 → 0 against the pinned fixture.

The diagnosis was right — "there is no request" and "this host resolves to
nobody" had been the same thing only because both ended at the fallback, and
removing it forced them apart. **The instrument was wrong.** The first fix probed
build time with `try { headers() } catch`, on the assumption that `headers()`
throws during static generation. Under `export const dynamic = "force-static"` —
which the marketing home sets — Next does not throw; it returns an EMPTY headers
object. So the probe answered "yes, this is a request", the redirect ran anyway,
and `NEXT_REDIRECT;replace;/unavailable;307` was still sitting in
`.next/server/app/index.html` after the fix. **Reading the artifact instead of
trusting the reasoning is what found it** (ruling 125, a fourth time). The
discriminator is now a HOST: a build has none and every request through Railway's
edge has one. Confirmed on the rebuilt artifact — `NEXT_REDIRECT` 0, her title
and identity intact, route table still `○ /`.

**3. The pre-rendered pages lost HER IDENTITY, and only a raw-count gate saw
it.** With the redirect fixed, `/` rendered — but `audits/event-chrome-verify.ts`
still failed, on the ruling-44 cannot-hide check rather than on the byte compare:
`"valentina" 35 → 25`, `"veritas" 6 → 2` against the f07a035 fixture. A build has
no host, so both layouts read `unresolved` and took their C26 branches — the
public layout returned empty metadata instead of the STATIC SITE's own
`DEFAULT_METADATA` (which comes from `@/content/site-content`, not from tenant
data), and the root layout lost `application-name: Veritas`, the title and the
Open Graph identity. Her marketing page would have shipped stripped of its own
name. The normalized byte compare alone would have reported a divergence without
saying what; the raw counts named it.

`staticSiteTenant()` is the answer and it is a STATEMENT, not the fallback
returning: the pre-rendered bytes are tenant #1's — her wordmark, her portrait,
her copyright line, her PWA name — which is a product fact about what the static
site IS, not a guess about who is asking. It answers for NO host at all, it is
reachable only when `requestHost()` is null, it is one named function with one
caller, and no REQUEST can reach it. Its P4 tracking item is written into it: a
host-agnostic static home cannot serve a second practice, so `/` becomes dynamic
and per-tenant or each practice's site is built separately, and the function is
deleted then. Rebuilt and re-counted: **35 and 6, exactly the fixture**, and
event-chrome back to 17/17.

**4. Staging would have gone dark in the same push that needed verifying** —
`valentinaapp-staging.up.railway.app` is neither mapped nor a practice subdomain,
so every public page there would be the 503. Rulings 48/62 verify the serving tip
on staging, so the verification surface would have failed in the deploy it was
meant to verify. Migration 51 maps it — true data of the same kind as
valentinavelez.com, and inert in production.

## WHAT THE TICK DOES NOW, AND WHY IT HAD TO CHANGE (rulings 123/126)

Every one of the tick's thirteen steps is individually try/caught so one failure
never starves the rest, and the route then returns `ok: true` regardless. That is
right for a step and exactly wrong for a TENANCY failure, because tenancy fails
for all thirteen at once: the caller is handed 200 and a report full of `"error"`,
and the scheduler's dashboard stays green while nothing happens. Removing the
fallback made "this host resolves to nobody" a state the tick can be in — which is
when that had to stop being possible.

Tenancy is now resolved ONCE, before any step, through `scopeTenantId()` — the
C25 export of the SAME resolver the scoped client uses, not a second one. An
unresolvable host returns **503 `{"ok":false,"error":"tenant-unresolved","host":…}`**
and no step runs. A successful run NAMES the tenant it served, which also makes
ruling 127's problem visible in every log line.

## Findings — reported, NOT fixed

1. **`ok: true` on a tick whose steps all errored is still possible** for
   non-tenancy reasons. The response says `ok: true` if thirteen steps each wrote
   `"error"` into the report. That predates P3.3 and is wider than it; P3.3 closed
   only the tenancy case, which is the one the fallback's removal created.
2. **The platform host's `/signup` and `/join` still render, and still write,
   because `lib/signup.ts` uses the RAW client** — `PractitionerProspect` is not a
   scoped model. That is correct (a signup lead belongs to the platform, not to a
   practice) and it is why P3.3 does not break the front door. Named because it is
   load-bearing and invisible: if signup were ever moved onto the scoped client it
   would break on the platform host immediately.
3. **`www.psychefolio.com/…` below the root** resolves as an unknown slug, so the
   chrome still serves default-host content while the data layer now refuses. The
   root is redirected to `/platform` by middleware, so this affects typed URLs
   only. Chrome's unknown-slug behavior was explicitly outside P3.3's scope.
4. **Ruling 127, recorded not built.** The platform's scheduled work runs inside
   HER tenant scope, because one external cron calls one practice's domain. It is
   in the tick's exemption entry as that exemption's tracking item.

## JOBS_SECRET — ANSWERED FOR JACOB BEFORE HE ROTATES

**Nothing in the repository needs changing.** `authorized()` reads
`process.env.JOBS_SECRET` inside the function at request time; no value is baked
into the build. **No gate or fixture hardcodes the production secret** — every
tracked reference is the commented placeholder at `.env.example:74`, the variable
NAME in comments and docs, or `audits/engage/verify.ts:50`, which defines its own
gate-local literal and injects it into the env of the server that gate spawns. A
production rotation cannot redden it.

Two cautions: any window where the Railway variable and cron-job.org job 8110930
disagree is 401s every 15 minutes with no alert; and a BLANKED variable looks
exactly like a wrong one, because `authorized()` returns false when JOBS_SECRET is
unset.

**A correction to the "future scope" framing: the header path already exists and
needs no code.** `authorized()` checks `Authorization: Bearer <secret>` FIRST and
falls back to `?secret=`. Moving job 8110930 to a Bearer header is a cron-job.org
dashboard change with zero repo change — it is available today, not future scope.
REMOVING the query-parameter fallback is a code change and is deliberately not
made: doing it before the job moves takes the tick down.

