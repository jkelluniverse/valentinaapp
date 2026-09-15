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
