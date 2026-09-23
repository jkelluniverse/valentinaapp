# BUILD REPORT — C26-FAIL-CLOSED-TENANCY

**Status: COMPLETE.** Gate `audits/fail-closed-tenancy-verify.ts` **18/18** (promoted
from the task-#81 reproduction, per the spec; STANDING, not manual — fitness argued
below). Full regression green before merge. Checkpoint protocol followed (ruling 36).

## What shipped

- **`lib/tenancy/index.ts`** — the discriminated resolution the spec asked for:
  `tenantBySlugChecked` returns `{ok:true, tenant|null}` (the database answered) vs
  `{ok:false, stale|null}` (the lookup errored), and `resolveTenant` maps that to
  `tenant` / `unknown-slug` / `unresolved`. A stale-but-known identity counts as
  known (it was correct within the TTL). `getTenant()` keeps its signature and its
  NEVER-THROW contract; its one behavior change is that `unresolved` returns a
  neutral practice-less shell (`UNRESOLVED_SHELL`: empty name, empty branding,
  sentinel id matching no row) instead of Valentina's identity. The layer-3 literal
  survives as `FRESH_DB_SHELL`, reachable ONLY behind a lookup that succeeded and
  found nothing on the default slug — never behind an error.
- **`lib/prisma.ts`** — the invariant that actually protects (spec §2):
  `requestTenantId()` now uses the checked lookup and THROWS `TenantUnresolvedError`
  when the host's lookup failed with nothing cached — so under `unresolved`, no
  tenant-scoped read or write proceeds anywhere, for every scoped model, with no
  call site remembering anything. Unknown slug still defaults (unchanged); the
  default slug still short-circuits (Valentina's own hosts never do the lookup and
  cannot be affected).
- **`app/unavailable/route.ts`** — the neutral face (spec §3): HTTP 503,
  `Retry-After: 10`, `noindex`, both languages on one page (locale negotiation would
  need per-practice config — the thing we cannot read right now), and it names no
  practice: "Something went wrong on our side — not yours, and not this practice's."
- **`app/(public)/layout.tsx` + `app/(public)/book/page.tsx`** — on `unresolved`,
  redirect to `/unavailable` (the page-level check exists because the slot read
  races the layout's redirect). The public wall is untouched (`lint:wall` green —
  the wall bans auth/prisma imports; `@/lib/tenancy` is resolution plumbing).
- **`lib/notify.ts`** — one line: `RESEND_API_URL` testability override (same class
  as the tick's `asOf`), so the gate asserts "no email" at a real transport sink
  from a spawned server rather than by inference. Unset in production.

## The five assumptions (item 1)

1. **A1 CONFIRMED** — 40+ files call `getTenant()`, the root layout among them, on
   every request. The never-throw contract is kept; only the unresolved answer
   changed.
2. **A2 CONFIRMED** — the auth-guards cross-tenant door is exactly as quoted, and
   Verify 9 proves it behaviorally: under the injected failure, practice B's
   practitioner is locked out at `/login`, never shown another practice's data.
3. **A3 CONFIRMED AND WIDENED** — beyond C18's booking (`Lead`+`Appointment`+
   `SchedulingConfig` via `getOrCreateConfig`), the token-authenticated public
   surfaces (`/agree/[token]` signing, `/discovery/[token]` reschedule) also write
   scoped rows. All of them go through the scoped client (zero raw-prisma imports
   under the public trees — gate-asserted), so the §2 refusal covers every one.
   The single allowlisted raw-prisma path on a public surface is `lib/signup.ts`,
   which states every row's tenantId explicitly (it creates the new tenant) and
   cannot misattribute by construction.
4. **A4 CONFIRMED** — post-ruling-33 the branches were already separate; the
   mechanism was small, as predicted. C26 makes the distinction a TYPE so no
   caller can silently re-collapse it.
5. **A5 CONFIRMED** — the literal's stated purpose (fresh, unseeded database) is
   preserved and Verify 8 proves it: a schema-only database with zero tenant rows
   resolves `unknown-slug` and renders the literal shell — never via the error path.

## The gate — and one deviation from my own first draft, disclosed

Promoted from `audits/t81-booking-tenant-repro.ts` (file renamed). One server,
three phases: FAILURE (503, no strings, no rows in ANY tenant, zero transport-sink
requests, signed-in lockout) → RECOVERY (GRANT SELECT back to the role, the very
next request on the same running server renders — Verify 6 with no restart) →
HEALTHY (the control booking completes, stamps tenant B, and its two emails reach
the sink — which retroactively proves phase 1's zero-email assertion had a working
instrument).

**Standing-gate fitness (the spec demanded a plain answer):** it is STANDING, in
the regression set. The role manipulation and server spawn/kill are the same class
of side effect the engage and practice-setting gates already carry; everything is
scratch-guarded (refuses a Railway `DATABASE_URL`) and self-cleaning (role, rows,
throwaway database, servers). Nothing about the invariant is left manually
enforced.

**Two of my first-draft checks were wrong about the product and were corrected —
in the checks, with the reasoning on record, not by relaxing anything real:**
(a) I asserted `/` should 503 under failure. The marketing home is STATIC —
prerendered, resolution-independent, serving byte-identical content to every host
in every condition, which satisfies the actual invariant ("a resolution failure
must not change whose identity renders") differently than a 503 does. The check
now asserts byte-identity between the failure response and the healthy one.
(b) I asserted the absence of `name="email"` in SSR HTML — but that input only
renders client-side after a slot is picked, under health too, so the check proved
nothing. It now asserts the browser lands on `/unavailable` with no day/slot
chooser at all.

## Verify items 2–10 — all PASS, evidence in `audits/fail-closed-tenancy/VERIFY-LOG.md`

The headline (item 2): **the reproduction now fails to reproduce** — same injected
failure, same host, same form, and no `Lead` or `Appointment` created in ANY
tenant, asserted globally. Item 4 at the sink: zero requests. Item 5: the healthy
booking still completes and stamps tenant B. Item 6: recovery on the next request,
no restart. Item 7: unknown slug unchanged. Item 10: the 503 is bilingual and
names no one.

## Law #6 (attributable trace) — an honest limit

A refused request cannot write an `AuditEvent`: the refusal exists because the
database is not answering. The operator-findable trace is a structured
`console.error` line at both refusal points (`[tenancy] UNRESOLVED host …`,
`[tenant-scope] refusing scoped access …`) — visible in Railway logs — plus the
503s themselves in the HTTP metrics. Stated rather than papered over.

## Regression (item 11) — all green on the final shape

lint:wall · guard-prisma · tsc · build · smoke · smoke:writes · signup 37/37 ·
capture 59/59 · referral 68/68 · **engage 173/173** (the spec's "172" predates
C27 Phase 1; the +1 is C27's disclosed check, ruling 38) · tenant-scope 48/48 ·
nested-stamp 43/43 · settings-i18n 10/10 · practice-setting 47/47 · platform
16/16, 11/11, 17/17 + verify · c21 58/58 · c20 28/28 · v31 32/32 · c12x ·
onboarding 16/16, 17/17, 7/7, 10/10, 19/19 · password-reset · amd06 ·
email-identity 22/22 · **fail-closed-tenancy 18/18** · gate-hygiene PASS · stamp
audit exit 0, run last. Credential-gated four: NOT VERIFIED — vendor credential
required, unchanged.

## Decisions taken (for Architect ratification)

(a) The static front door's invariant is byte-identity, not a 503 (reasoning
    above) — the 503 applies to resolution-DEPENDENT public pages.
(b) `RESEND_API_URL` as a transport-sink affordance in lib/notify.ts (one line,
    unset in production, same class as `asOf`/`only=engage`).
(c) The stale-cache path counts as RESOLVED (a known identity within TTL), for
    the data layer as well as the chrome — refusing on stale would turn every
    cache-expiry-during-blip into an outage with no safety gain.
(d) Law #6's trace is a structured log line, not an audit row — an audit row is
    unwritable mid-outage by definition.
(e) The lockout in Verify 9 happens via NextAuth's error path (the scoped user
    read throws inside `authorize`) — no auth code was changed.
