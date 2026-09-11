# BUILD REPORT — C25-PRACTICE-SETTING-TENANCY

**Status: COMPLETE.** Gate `audits/practice-setting-verify.ts` **47/47**. Full regression set
re-run before merge (numbers below). Built across two sessions: the original builder (stopped
mid-flight; work preserved on `claude/c25-handoff` at 40/41 by the Architect's handoff of
2026-09-11) and this session, which settled the one open check, fixed its root cause, and merged.

## What shipped (unchanged from the handoff, verified here)

- `lib/tenancy/model-identity.ts` — model identity derived from the DMMF, fail-closed
  (`ModelIdentityError`), never a skip. Covers all 79 scoped models (gate V8).
- `lib/prisma.ts` — the fail-closed pre-check uses the derived identity instead of a
  hardcoded `select: { id: true }`.
- `prisma/schema.prisma` + migration `49_practice_setting_tenancy` — `PracticeSetting` gains
  `id` (PK) and `@@unique([tenantId, key])`; null-tenant rows stamped to the default tenant.
  Counted, idempotent, reversible via `_PracticeSettingTenancy49`, loud on drift.
- `lib/practice-settings.ts` — the one place that addresses a setting by unique key;
  a write with no tenant in scope THROWS rather than defaulting into Valentina's practice.
- ~47 files: every call site that addressed a setting by bare `key` now goes through the
  service or names the tenant-qualified key. No product code addresses a setting by unique
  key any more (gate A3).

## The 41st check — what it actually was

The handoff's one failing check ("practitioner B lands on /login") reproduced **neither** of
the handoff's two hypotheses:

1. **Not a cookie-jar/browser-context artifact.** The harness opens one fresh
   `browser.newContext()` per practice; nothing is shared. And the check passed
   deterministically here — three consecutive full-gate runs, both practitioners reaching
   their own settings pages on their own hosts.
2. **Not an auth-logic defect.** `lib/auth-guards.ts`'s null-tenant branch is correct:
   user B carries `tenantId = tenantB`, host B resolves tenant B, the guard admits her.

**The real mechanism — found by reading the resolution path, then PROVEN live:**
`lib/tenancy/index.ts # tenantBySlug` swallowed DB errors with `.catch(() => null)` and then
**cached that null for the 60s TTL**. One transient DB error on the first request to a host
(a pool blip under the harness's parallel load — or in production, any hiccup) made that
EXISTING tenant's host resolve to the DEFAULT tenant for a full minute. On host B the scoped
`user.findUnique` in the credentials `authorize` then filters to the wrong tenant, finds no
user, login fails, and B sits on `/login` for the entire browser section — exactly the
handoff's symptom, and inherently environment-sensitive, which is why the Architect's sandbox
hit it and this one didn't.

Proof (run live against this branch, before the fix): stop postgres → first-touch resolve an
existing tenant's slug → restart postgres → within the TTL the slug **still resolves null**
while a control slug (cached while healthy) resolves fine.

**The fix (one function, behavior-preserving except under DB error):** a failed query never
enters the cache. On error the resolver serves the last known value if one exists, else null
for that request only — `getTenant()`'s never-throw default-tenant fallback for the single
request is preserved, but the moment the DB recovers the host resolves correctly. Re-running
the proof shows recovery is now immediate. This is an availability fix, not an isolation fix:
even poisoned, no data crossed tenants (the guard fails closed).

The check itself was **not relaxed** — it asserts the exact journey the spec protects, and it
passes as written.

## One more finding: the gate's archaeology was pinned to a moving target

Five "BEFORE" checks read the pre-fix state via `git show HEAD:…`. That was correct in the
builder's sandbox (the fix was uncommitted, HEAD *was* pre-fix) and permanently wrong the
moment the fix was committed — those five checks could never pass again, on any machine.
Pinned to `a6c8bd8` (the pre-fix commit the gate's own header names). No assertion logic
changed; the checks prove the same facts, now reproducibly forever.

## Verification

- `audits/practice-setting-verify.ts` **47/47** (the handoff counted 41 — the delta is
  conditional checks that count differently per environment, plus the archaeology now
  running instead of erroring). VERIFY-LOG written by the gate (ruling 17).
- The poisoning proof above, run before and after the tenancy-cache fix.
- Full regression set per the handoff, run after all changes on the merge candidate:
  see the ledger numbers appended to BUILD-STATE; summary — lint:wall · guard-prisma ·
  tsc · build · smoke · smoke:writes clean; signup 37/37 · capture 59/59 · referral 68/68 ·
  engage 172/172 (kill-switch intact, gate still defaults CLOSED) · tenant-scope 48/48 ·
  nested-stamp 43/43 · settings-i18n 10/10 · platform phase2 16/16 / phase3 11/11 /
  phase5 17/17 / platform-verify ALL CHECKS PASS · c21 58/58 · c20 28/28 · v31 32/32 ·
  c12x 23 passed · onboarding 16/16, 17/17, 7/7, 10/10, 19/19 · password-reset PASS ·
  amd06 PASS · tenant-stamp audit exit 0 (run LAST, after the full sweep).
- NOT VERIFIED — vendor credential required (unchanged, reported rather than passed
  silently): `pipeline/p12`, `fixtures/values-verify`, `c12x-ai-pass/*`,
  `remarkable-recording`.

## Decisions taken (for Architect ratification)

(a) The tenancy-cache fix (`lib/tenancy/index.ts`) was made in this build rather than filed:
    it is the proven root cause of the one check this build was blocked on, three lines,
    fail-safe in both directions (per-request default fallback preserved; recovery
    immediate), and leaving it would leave every tenant's host one DB blip away from a
    60-second lockout at the event.
(b) The archaeology pin (`PRE_FIX_COMMIT = "a6c8bd8"`), reasoning above.
(c) The C25 spec moved `docs/specs/inbox/` → `docs/specs/accepted/` (built and gated).
