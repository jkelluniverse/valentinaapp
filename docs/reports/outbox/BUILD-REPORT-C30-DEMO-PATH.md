# BUILD REPORT — C30-DEMO-PATH (2026-09-15)

**Status: COMPLETE.** `audits/demo-path-verify.ts` — **34/34**, run twice back to back
(idempotent), demonstrated able to fail (output quoted under V6). Wired into the
standing set BEFORE stamp-audit, which stays last; the set moves **34 → 35 entries**
(ruling 38 — the move is this gate, named). The path Jacob walks on Sept 23 is now
proven after every change, in EN and in ES, over plain HTTP with JS disabled.

**Two identity findings on a new practice's surfaces — REPORTED, NOT FIXED (per the
spec's stop-clause and out-of-scope list). Neither blocks the walk; both are what a
founding practitioner will SEE. Details under A5.**

## V1 — the five assumptions, each answered with evidence

**A1 CONFIRMED — the full path runs headless in one process, no browser, no vendor
call.** GET /join (JS disabled) → multipart POST of the SSR form (the form tag itself
declares `encType="multipart/form-data"` and carries a hidden `$ACTION_ID_<id>` input;
posting exactly those fields is what a JS-less browser does — the time-trap field `t`
renders 0 without JS and the action treats 0 as "no reading", so the gate is a
legitimate no-JS visitor, not a bypass) → 303 to /join/thanks?code=… → GET
/signup?ref=… → multipart POST → 303 to /signup/welcome → the tenant's host serves its
portal. Sign-in is NextAuth's own HTTP surface (/api/auth/csrf +
/api/auth/callback/credentials, the phase5-verify pattern). Zero vendor calls: the
welcome email is a courtesy behind `emailConfigured()`, which the gate holds FALSE
(see law 10 below).

**A2 CONFIRMED, byte-equal.** The gate extracts the code STRING RENDERED on the thanks
screen (not the URL param — both, asserted equal), submits it to /signup, and asserts
the founder's stored `referredByCode` equals that displayed string byte-for-byte:
`SIGNED_UP|YYKDDGH3` against displayed `YYKDDGH3` (EN), same shape ES. No
transformation anywhere on the seam.

**A3 CONFIRMED, all asserted from the database.** `ACTIVE|journey-v1|warm-clay`;
modules exactly `archetypal-keys,body-graph,values-spiral`; billing
`FOUNDING_COMP|NULL|NULL` (plan, stripeCustomerId, stripeSubscriptionId — ZERO Stripe
objects). The referrer stays `LEAD` and owns the code.

**A4 CONFIRMED in substance, count corrected: EIGHT files, not six.** The absolute
chromium path (`/opt/pw-browsers/chromium_headless_shell-1194/...`) is hardcoded in
audits/signup/verify.ts, audits/capture/verify.ts, audits/referral/verify.ts,
audits/fail-closed-tenancy-verify.ts, audits/practice-setting-verify.ts,
audits/onboarding/discovery-verify.ts, audits/onboarding/ui-verify.ts, and
scripts/baseline.ts. This gate is therefore HTTP-level throughout, per the spec.

**A5 PARTIALLY DISPROVED — reported, not worked around.** What holds: the new
tenant's /login wordmark AND tab title are the practice's; its root 307s to /book; the
/book empty state names the practice; the signed-in portal SCREEN carries the
practice; on every one of those, zero visible "veritas"/"valentina". What does NOT
hold, enumerated on a provisioned practice's own host and PINNED by exact count in
the gate (a NEW leak still fails; a fix moves the pin to 0 in a reviewed commit):

1. **NEW FINDING — the signed-in practitioner's PORTAL tab says "Veritas"** (3×:
   `<title>Veritas</title>`, application-name, apple-web-app-title — the ROOT
   LAYOUT's metadata; C29 deliberately scoped its metadata fix to the four auth
   screens). A founding practitioner inside THEIR OWN portal reads another brand in
   the browser tab. Same class as C29's finding, one seam over. Awaiting dispatch.
2. **The F2 remainder, now quantified: /book on the new tenant's host is dressed as
   Valentina's site.** Head: 8× "valentina" — tab title "Book a free discovery call ·
   Valentina Vélez", meta description naming her, canonical `valentinavelez.com`,
   og:title/og:url/og:site_name, twitter:title, preloaded /valentina-logo.png. Body:
   6× — the PUBLIC LAYOUT's header (her logo + name) and footer (logo + name +
   copyright) render on every public page of every host — so the page every
   event-minted practice's root redirects to shows HER logo top and bottom, and its
   static copy offers "a free discovery call" in her voice. Head also carries 2×
   "veritas" (root-layout app names). Documented before (C29 report, brand-web
   scope); the demo-path gate makes its size concrete.

## V2/V3 — full path green in EN and in ES

Both legs 15/15 of their per-leg checks (log: `audits/demo-path/VERIFY-LOG.md`,
gate-written per ruling 17). The ES leg asserts the JOIN, THANKS, SIGNUP and WELCOME
screens render the `messages/es` catalog strings (headings asserted from the catalog
files, not hardcoded). The tenant's host serving its own portal is asserted in both
legs. Honest limit, pre-existing and already logged: /login and /book on the new
tenant's host are EN-only surfaces (the PUBLIC-I18N open item + decision (d)'s logged
deviation) — the ES leg asserts identity on them, not language.

## V4 — negative assertions, each named

- **Law 2**: no "free"/"gratis"/"price"/"precio" in the rendered BODY of /join, the
  thanks screen, and /signup, in both languages; no dollar figure in any VISIBLE byte
  of those pages including `<head>`. Scope disclosed in the gate: the root layout's
  meta description carries Valentina's marketing sentence "…break **free** from
  self-sabotage…" on every page — not pricing, not on the screen; and the RSC flight
  payload serializes reference tokens like `"$10"` inside scripts — routing ids, not
  money. Both exclusions are commented at the definition.
- **No cross-tenant identity leak**: zero visible "veritas"/"valentina" on the new
  tenant's /login, /book body, and signed-in portal — with the two KNOWN exceptions
  pinned at exact counts and reported above.
- **Law 10, zero mail — asserted mechanically, not by reasoning**: every sending
  credential is stripped from the server env AND `RESEND_API_URL` points at a local
  sink the gate runs; the sink counted **0 hits** across both legs. Zero
  ProspectMessage rows for the fixture prospects (engage stays CLOSED).
- **No Stripe object**: `FOUNDING_COMP|NULL|NULL` asserted per leg.
- **No null-tenant row**: 0 across User, AuditEvent, TenantModule, TenantBilling,
  PracticeSetting, Lead, Appointment after both legs.

## V5 — idempotent

Run twice back to back: PASS, PASS. The gate tears its fixtures down before and after
each leg and asserts zero residue as its last check (`00`).

**Fixture-slug deviation, disclosed:** the spec says "a fixture tenant slug"; the gate
reserves TWO (`c30-demo-en`, `c30-demo-es`), one per leg. A single slug torn down and
recreated between legs collides with C26's RATIFIED stale-counts-as-resolved host
cache: the server keeps serving leg 1's identity under the same host after the
teardown, so leg 2's assertions read the wrong tenant — the gate found this by
failing, and respecting the ratified behavior beats fighting it. Commented in the
gate header.

## V6 — demonstrated able to fail

The link between the thanks screen and signup was broken (the gate temporarily
submitted a rotated code instead of the displayed one), run, reverted, re-run:

Broken:
> ✗ EN — A2: the founder's stored referredByCode IS the displayed string, byte-equal — SIGNED_UP|CEEF8J37
> ✗ ES — A2: the founder's stored referredByCode IS the displayed string, byte-equal — SIGNED_UP|TJK88WGF
> 32/34 checks passed · DEMO-PATH VERIFY FAILED (exit 1)

Reverted:
> 34/34 checks passed · DEMO-PATH VERIFY PASS

## V7 — standing set green, C30 included, stamp-audit LAST, exit 0

(Sweep output quoted in the merge commit; 35 entries.) **The standing set now has a
COMMITTED definition: `scripts/regress.sh`** — until now the set existed only as an
uncommitted scratchpad script plus the ledger enumeration, which is exactly how the
34/35/36 count confusion the C29 review corrected became possible. Decision for
ratification: committing the runner is treated as part of "wire it into the standing
set". The ledger enumeration now points at the script.

## V8 — ruling 49 recorded

In BUILD-STATE: the demo path is verified by gate; the manual rehearsal confirms the
gate rather than substituting for it.

## Engineering notes (disclosed)

- **A ghost-server hazard fixed inside the gate**: Next 14 renames its worker to
  `next-server (v…)`, so a `pkill` on "next start" never matches; an orphan from a
  crashed run keeps the port — and its IN-MEMORY signup rate-limit counters — alive
  while a fresh spawn dies on the bound port and the health check happily talks to
  the ghost (the gate hit its own `error=rate` this way). The gate now kills by PORT
  (`fuser -k`) before starting and when stopping. The same latent pattern exists in
  other server-spawning gates; flagged, not touched (out of scope).
- **Out of scope, untouched**: C28, brand-web, the platform apex, the F2 remainder
  (reported above, not fixed), the chromium path (counted, not fixed), the four event
  surfaces, the default tenant, the engage gate.

---

# IN-FLIGHT REVIEW ADDENDUM (2026-09-15) — the stale-server answer, and the finish

**Ordering disclosure first: the C30 merge (fbbaeb3) reached the deploy branch at
17:52Z, BEFORE the in-flight review arrived.** The stop-and-answer was therefore
answered with the merge already live. The scope answer below says why that merge's
evidence stands; the deploy branch has been HELD since the review arrived (this
addendum and the rulings live on claude/c30-wip pending your read).

## THE STOP-AND-ANSWER — how far does the stale-server defect reach?

**1. Which gates spawn servers, and with what teardown.** Sixteen gate files spawn
`next start` (billing b1–b4, agreements c20/c21/v31, platform phase1/3/4/5, engage,
onboarding ui/discovery, settings-i18n, referral, practice-setting, event-chrome,
fail-closed-tenancy, plus scripts/smoke.ts and scripts/baseline.ts; the browser gates
signup/capture spawn one too). EVERY one uses the same two-layer teardown:
`server.kill()` (SIGTERM) plus the backstop `pkill -f "next start -p <port>"`.
demo-path now kills by port instead. baseline.ts additionally REFUSES to start on an
occupied port — its own comment already knew the truth: "kill the stale server first
(pkill -f next-server)".

**2. Can a prior server survive each teardown? Tested live, quoted.**

The primary mechanism is SOUND, and the reason is structural: Next 14 does not fork —
the spawned pid RENAMES ITSELF (process.title), so `server.kill()` signals the server
directly:
> server healthy on 3170 (cli pid 403) · PID 403 PPID 379 COMMAND next-server (v1
> TEST A: port 3170 FREE after SIGTERM — primary mechanism kills the tree

The backstop is DEAD CODE everywhere: on Linux, process.title rewrites /proc/cmdline,
so the pattern can never match — and it CAN match the caller:
> server healthy (pid 470, title: next-server (v1)
> TEST B RESULT: server on 3170 SURVIVED the gates' pkill backstop (pattern matched
> the caller's shell, not the renamed next-server)
> TEST C: port 3170 FREE — port-based kill works regardless of process name

(TEST B's run also demonstrated the caller-match hazard live: the pkill killed the
invoking shell, twice, during this session.)

So: a prior server survives into a later run only when the PRIMARY kill never fires or
wedges — a harness process crashing hard mid-gate. That happened ONCE, observed, in
C30's own development iterations (the ghost that served stale rate-limit counters and
motivated this question); the backstop that should have caught it catches nothing.

**3. Was the C29 pre-merge sweep exposed? NO — and here is the evidence, not the
reasoning.** (a) Port state: after today's THREE full sweeps, all 22 gate ports have
zero listeners and zero `next-server` processes exist — the sweep path's teardown
demonstrably works. (b) Same-day content pins: a stale pre-build server cannot serve
content that was written the same day, and the sweeps' gates pin exactly that —
settings-i18n 10/10 asserts C27-P2's practiceContact keys on the day they were added;
event-chrome ran THREE server generations on ONE port inside a single run, including a
DB-credential-broken server whose unresolved-shell responses a healthy leftover could
not produce — that is an in-run proof that stop→start cycled correctly on that port
during the C29 sweep itself. (c) event-chrome's port (3154) was NEW in C29 — no prior
run existed to leak onto it. **The C29 greens stand as evidence.**

**4. Honest scope: the VULNERABILITY is wide (the backstop is dead code in all 16
files), the EXPOSURE is narrow (one observed ghost, in C30 development, never in a
sweep).** Per your stop clause, the other gates' teardowns are UNTOUCHED — the
ruling-52 replacement across the 16 files awaits your word. demo-path already
complies (kills by port, before start and at stop).

## /join POST 200-vs-303 — resolved explicitly

The 200 was a HARNESS content-type error, not a product behavior: this gate's first
draft posted the action urlencoded; the SSR form declares
`encType="multipart/form-data" method="POST"`, and Next only runs the action for the
declared encoding. A JS-less browser reads the form tag and posts multipart — which is
exactly what the gate now sends, and the action answers 303 every time (both legs,
every run). The real no-JS submit works end to end. C23-CAPTURE's assertion is also
sound and UNCHANGED: it drives real chromium with `javaScriptEnabled: false` and
asserts the browser lands on /join/thanks ("minimum submission reaches the success
screen with JS disabled") — a real browser honors the enctype, so the gate's assertion
and the real behavior agree. No defect in the assertion.

## The finish, confirmed

- **Ruling-48 deploy check, against the SERVING tip**: Railway reports both
  environments SUCCESS on commit `fbbaeb356195abed5273de020550321cac61b51c`
  (production 17:58:00Z, staging 17:58:18Z; the prior 942bf62 deploys REMOVED; no
  newer deployment pending). Against that tip: production tenant-kind 200 · health
  200 · login 200; staging the same three 200s.
- **Count move named (ruling 38)**: 34 → 35, the addition is demo-path, placed before
  gate-hygiene with stamp-audit LAST; the enumeration is the committed
  scripts/regress.sh (ruling 51) and is quoted in the merge commit.
- **Line 94 corrected — confirmed**: the C29 report's "all 35 gates green" now carries
  the strikethrough correction (33 PASS + 1 FAIL was the true state, transcript
  quoted); 8bd150a's "34 green" miscount is owned in the same correction and in
  BUILD-STATE's COUNT RECONCILIATION (a commit message is immutable — the correction
  lives in the ledger and report).
- **Rulings 50–54 recorded.** Ruling 50 applied: the four demo-path pins each name
  their defect and cite their tracking item (F2-remainder chrome half → C31 per ruling
  54; portal tab metadata → C30 finding 1 + ruling 53), and compare exact-equality so
  both directions fail. Ruling 46's EXPECTED_DELTAS remains a separate mechanism and
  the comments say so. The law-2 rescope is named per ruling 38 and the gate comment
  now states WHY the two scans have different scopes.
- **Ledger fill**: `PLATFORM_LEGAL_ENTITY = "Kell Systems Consulting, LLC"` recorded
  verbatim (comma and period preserved). Survey: NO gate or fixture asserts a stale
  production entity — email-identity injects its own test value ("T27 Entity, Inc.")
  and engage its own ("Engage Verify Entity"), both by design (they test plumbing,
  not the production value); nothing changed. The verbatim-footer verify item is
  written into the C31 spec (V7) with its honest limit: local gates inject test
  entities, so the verbatim assertion needs an environment where the real value is
  set.
- **C31 spec written to docs/specs/inbox/C31-TENANT-CHROME-REMAINDER.md.** NOT built —
  held per the stop clause until you read the stale-server answer.
