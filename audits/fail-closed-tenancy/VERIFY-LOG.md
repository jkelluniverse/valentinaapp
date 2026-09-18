# C26-FAIL-CLOSED-TENANCY verify — 2026-09-18T16:25:00.912Z

## Verify 1 — the five assumptions, confirmed or corrected
- ✓ A1 CONFIRMED — getTenant()'s never-throw contract is load-bearing: the ROOT LAYOUT calls it on every request, plus dozens of surfaces — 42 calling files, app/layout.tsx among them — the contract is kept; only WHAT it returns on an unresolvable host changed
- ✓ A2 CONFIRMED — the authenticated cross-tenant door exists as the spec quotes it (behavioral proof under failure is Verify 9 below) — both lines present in lib/auth-guards.ts — this spec's scope is public-only, as assumed
- ✓ A3 CONFIRMED-AND-WIDENED — beyond C18's booking (Lead+Appointment), token-authenticated public surfaces (agree, discovery reschedule) also write scoped rows; ALL go through the scoped client (zero raw-prisma imports under the public trees), so the §2 refusal covers every one of them; lib/signup's raw client states every tenantId explicitly — raw-prisma imports under app/(public), app/agree, app/discovery: none · scoped writes reachable: Lead, Appointment, SchedulingConfig (getOrCreateConfig), Agreement (sign), AuditEvent
- ✓ A4 CONFIRMED — post-ruling-33 the error and not-found branches were already separate; C26 §1 makes the distinction a TYPE (CheckedLookup / TenantResolution) so no caller can re-collapse them silently — the discriminated result is the mechanism, exactly as the spec predicted (small)
- ✓ A5 CONFIRMED — the layer-3 literal survives ONLY behind a lookup that SUCCEEDED and found nothing (FRESH_DB_SHELL on the unknown-slug branch); the error branch can never reach it — verified structurally here and behaviorally in Verify 8

## Rig — practice B (real signup), discovery hours, the errprobe role, the sink
- ✓ a real ACTIVE non-default practice exists (real signup service) — tenant B = cmu7660140001cu3rwnbzixyv

## Phase 1 — FAILURE injected (Verify 2, 3, 4, 10 + the signed-in half of 9)
- ✓ V3/V10 — practice B's /book under failure is the NEUTRAL 503: Retry-After set, both languages, and NONE of Valentina's availability, branding, name, or wordmark in the HTML — status=503 · retry-after=10 · bilingual=yes · practice strings=absent
- ✓ V3 — no bookable surface is offered under failure: the browser lands on /unavailable with no day/slot chooser (a form that cannot be safely submitted must not render) — landed on /unavailable · slot-chooser buttons: 0
- ✓ V2 — THE REPRODUCTION NOW FAILS TO REPRODUCE: no Lead and no Appointment was created in ANY tenant under the injected failure (asserted globally) — Lead|Appointment counts unchanged: 0|1
- ✓ V4 — no notification email left the transport under the failure (asserted at the sink sendEmail actually posts to) — sink requests: 0
- ✓ V9 — a signed-in surface under failure LOCKS OUT rather than showing another practice: B's practitioner lands back on /login — after sign-in attempt + /practitioner: /login

## Phase 2 — RECOVERY (Verify 6): lift the failure, same running server, next request
- ✓ V6 — recovery is IMMEDIATE: the very next request after the failure lifts renders the booking page — no restart, no wait, no poisoned cache (ruling 33) — first post-recovery request: 200

## Phase 3 — HEALTHY control on the same server (Verify 5, 7) — the fix must not cost a working booking
- ✓ V5 — the healthy booking still completes on B's host and the Lead is stamped tenant B — final url /book/confirmed?t=cmu7667ic00022bj7mty850qp.dxNImdLY3Pv3VWn7ESxmB5flC9qyuC_NhlnOOZv4Zj0 · Lead.tenantId = cmu7660140001cu3rwnbzixyv
- ✓ V5/V4 — and its two notification emails reached the SINK carrying TENANT B'S identity (C27 §Phase 2) — proving phase 1's zero-email assertion had a working instrument — sink: t26-probe-b@fixture.test ← "T26 Practice B" · t26-lead-healthy@fixture.test ← "T26 Practice B"
- ✓ V7 — an UNKNOWN slug still behaves exactly as documented (default-host content, 200, the booking page renders) — this spec changed the error path only — unknown slug /book → 200 · booking-page heading present
- ✓ V3 — the STATIC front door is resolution-INDEPENDENT: under failure it served byte-identical content to the healthy request, so the failure changed nothing about whose identity renders — healthy 37203b === failure 37203b: true

## Verify 8 — a fresh, unseeded database still renders (layer 3's real purpose, preserved)
- ✓ V8 — on a schema-only database with ZERO tenant rows, resolution SUCCEEDS (unknown-slug) and serves the layer-3 literal shell — renders, never errors, and never via the error path — kind=unknown-slug · shell id=tnt_valentina_000000001
- ✓ SELF-CLEANING — probe practice, rules, leads, role and the fresh database are gone — rows 0 · role gone · throwaway db dropped

FAIL-CLOSED-TENANCY VERIFY PASS — 18/18
