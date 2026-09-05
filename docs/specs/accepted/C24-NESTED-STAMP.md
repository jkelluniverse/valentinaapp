# C24-NESTED-STAMP — close task #75, make the audit mean something

**Spec:** C24-NESTED-STAMP · **Depends-on:** PLATFORM Phases 0–5 (tenancy, scoping, guard)
**Priority:** high — the only open item that is a genuine integrity defect rather than a decision or a deploy. Needs nothing from Jacob.
**Architect:** decided 2026-09-05.

## Why this exists

`audits/tenant-stamp-audit.ts` currently FAILS. It has failed on every run this program has made, with
`handwrittenNote: 1` and `appointment: 1` (earlier, six rows across five tables) carrying a null `tenantId`.
BUILD-STATE has carried it as task #75 — "auto-stamp nested relation writes with tenantId (nightly audit is
the net)" — since before this program began.

A permanently-failing gate is worse than no gate. It trains everyone to read FAIL as normal, and on the day
it fails for a *real* reason — a genuine cross-practice leak, the most security-critical failure this codebase
can have — nobody will notice, because it always looks like that.

This is also the wall that becomes the cross-practice wall when Psychefolio goes multi-tenant. Fixing it while
there is one real practice is cheap. Fixing it after twenty is an incident.

## Assumptions to verify, not trust

*(Ruling 18: every claim this spec makes about existing behavior is listed here, and each one is a Verify item.
The Architect has twice asserted such claims as fact and been wrong. Do not trust this section — test it, and
if any line is false, say so and adjust rather than working around it.)*

1. The null-tenant rows are produced by **nested relation writes** through the scoped Prisma client — a
   `create` on a parent that writes children in the same call, where the extension stamps the parent and
   misses the children. **This is the Architect's hypothesis, not an established fact. Confirm the actual
   mechanism before changing anything, and report what it really is.**
2. `lib/prisma.ts`'s client extension is the single place where scoped writes are stamped, so a fix belongs
   there rather than at call sites.
3. `SCOPED_MODEL_SET` / `SCOPED_MODELS` in `lib/tenancy/scope.ts` is the authoritative list of practice-scoped
   models, and `handwrittenNote` and `appointment` are both in it.
4. The rows are created by **audit/gate probes**, not by product code paths a real user drives — which is why
   the count moves as gates run. If real product paths also leak, that is a materially bigger finding and must
   be reported as such rather than folded into the fix.
5. The audit iterates every scoped model and reports per-table counts, so it will confirm its own fix.

## Standing laws this build must honor

- **Server-side enforcement (law #5)** — the fix belongs in the data layer, not in review discipline. "Remember
  to pass tenantId" is not enforcement.
- **Attributable audit (law #6)** — do not weaken what the audit checks in order to make it pass. The only
  acceptable way to a green audit is that there is nothing to find.
- **No invented features** — this is a correctness fix. No new surfaces.

## Build order

### 1. Establish the mechanism

Reproduce a null-tenant row deliberately: write the smallest failing case that creates one through the scoped
client, and record exactly which call shape does it. Put that reproduction in the gate so the bug cannot
return silently. If the mechanism turns out not to be nested writes, stop and report — the rest of this spec
assumes the diagnosis and may need rewriting.

### 2. Stamp nested writes in the extension

In `lib/prisma.ts`, extend the write path so nested `create` / `createMany` / `connectOrCreate` / `upsert`
payloads for scoped models inherit the request's `tenantId` when they do not carry one — at whatever nesting
depth they appear. Rules:

- An explicitly-provided `tenantId` is **never** overwritten. Silently rewriting an explicit value would turn
  a visible bug into an invisible one.
- Only models in `SCOPED_MODEL_SET` are stamped. `Tenant`, `TenantModule`, `PractitionerProspect`,
  `ProspectMessage` and the other platform-level models must be left exactly as they are — stamping those
  would be a new bug wearing this fix's clothes.
- The default-tenant path must behave exactly as it does today.
- Raw/allowlisted clients are out of scope by definition: they opt out of scoping deliberately.

Performance matters here — this runs on every write in the application. Walk the payload once.

### 3. Backfill the existing rows

A migration or script that stamps existing null-tenant rows to the default tenant, matching the precedent in
migration `36_stamp_null_tenants`. Reversible, and it must state its row counts. In a single-practice
database every null row belongs to the one practice; say that assumption out loud in the migration comment,
because it stops being true the moment a second practice exists.

### 4. Make the audit a real gate

Once it passes, it should be able to keep passing: exit non-zero on any null-tenant row, and be listed in
BUILD-STATE's standing gate set with its number.

## Verify (this list is the gate — evidence required per item)

Extend or add `audits/nested-stamp-verify.ts` in house style, self-cleaning:

1. **Each of the five assumptions above, confirmed or corrected in writing** — with evidence, and with the
   real mechanism named if the hypothesis was wrong.
2. The minimal reproduction creates a correctly-stamped row after the fix, and is proved to have created a
   null-tenant row before it (state how that was demonstrated).
3. Nested writes are stamped at depth: a parent create carrying children, and a deeper grandchild case.
4. `connectOrCreate` and nested `upsert` are stamped.
5. An explicit `tenantId` on a nested payload is preserved, never overwritten — including a deliberately
   *different* tenant's id, which must survive untouched so that a real cross-tenant write remains visible
   to the audit rather than being silently normalised.
6. Platform-level models (`Tenant`, `TenantModule`, `PractitionerProspect`, `ProspectMessage`) are NOT
   stamped and NOT broken.
7. `audits/tenant-stamp-audit.ts` **exits zero on a freshly-seeded database after a full gate sweep** — the
   condition that has never held. Run the sweep, then the audit, and show the zero.
8. `audits/platform/verify.ts`'s null-tenant check passes for the same reason.
9. The backfill reports its counts and leaves zero null-tenant rows; running it twice is safe.
10. Isolation is not weakened: `audits/platform/phase2-verify.ts` and `phase3-verify.ts` still pass, and one
    explicit cross-tenant read attempt still fails as it does today.
11. Regression, non-negotiable: `lint:wall` clean · `guard-prisma` clean · `tsc --noEmit` clean ·
    `npm run build` succeeds · `smoke` + `smoke:writes` PASS · `signup` **37/37** · `capture` **59/59** ·
    `referral` **68/68** · `engage` **172/172** · `platform/phase5-verify` **17/17** · `c21-verify` **58/58** ·
    `c20-verify` **28/28** · `v31-verify` **32/32** · `fixtures/c12x-verify` 23 passed ·
    `onboarding` complete 16/16, stage1 17/17, update 7/7, ui 10/10, discovery 19/19 · `password-reset` PASS.

## Out of scope (do not build)

The multi-tenant conversion program · any change to `SCOPED_MODEL_SET` membership · new product surfaces ·
weakening the audit in any way · task #77 (shared rate-limit store), #78 (settings i18n), #79 (referral
verify log) — separate, smaller items.
