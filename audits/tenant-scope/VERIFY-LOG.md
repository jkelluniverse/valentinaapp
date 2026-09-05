# C24.1-TENANT-SCOPE — acceptance log

Run: 2026-09-05T22:45:23.713Z · `npx tsx audits/tenant-scope-verify.ts`
Database: postgresql://postgres@localhost:5432/valentina_scratch?host=/tmp

Requests are simulated in-process via Next's request async storage, so every
request-path check runs through the real scoped client against the real database.

# C24.1-TENANT-SCOPE verify — 2026-09-05T22:45:20.554Z
- ✓ simulated request scope is real (next/headers resolves inside it)

## Verify 1 — the five assumptions
- ✓ A1: node:async_hooks/AsyncLocalStorage resolves in the tsx CLI runtime (this process)
- ✓ A1 CONFIRMED: the scope survives await boundaries and nested async frames — ambient=tnt_tcv_probe_b_00001
- ✓ A1 CONFIRMED: concurrent scopes do not bleed (per-async-context, not global) — tnt_valentina_000000001 / tnt_tcv_probe_b_00001
- ✓ A1 CONFIRMED: the scope does NOT survive its own exit (no ambient leak afterwards) — ambient=null
- ✓ A1 CONFIRMED: nothing in the app declares the EDGE runtime, so lib/prisma.ts only ever runs on Node — zero edge-runtime declarations
- ✓ A1 CONFIRMED: middleware.ts (the one edge-by-default context) does not touch the prisma client
- ✓ A1 CONFIRMED: the job tick route is a Node route handler (no edge runtime export) and runs inside a request — tick writes are request-scoped anyway — headers() resolves there, so precedence 1 applies
- ✓ A2 CONFIRMED (with a correction): ONE resolver, ONE headers() call, ONE fallback consult… — headers()×1 · ambientTenantId()×1 · requestTenantId defs×1
- ✓ A2 CORRECTED: …but that resolver is CALLED from two write paths (runOp and the array-form $transaction) — requestTenantId() call sites: 2 — one fallback consult still covers both, because it lives in the resolver
- ✓ A3: prisma/fixtures/c12x-verify.ts now leaves the null-tenant invariant intact (wrapped in withTenantScope) — exit=0 · nulls before=0 after=0 {}
- ✓ A3: audits/amd06/verify.ts now leaves the null-tenant invariant intact (wrapped in withTenantScope) — exit=0 · nulls before=0 after=0 {}
- ✓ A3 CORRECTED: every CLI file that writes scoped rows through the scoped client is accounted for — 12 scanned · 6 wrapped (audits/amd06/verify.ts, audits/password-reset/verify.ts, audits/remarkable-recording/verify.ts, audits/settings-i18n-verify.ts, scripts/smoke-writes.ts, prisma/fixtures/c12x-verify.ts) · 6 stated another way · unexplained=none
- ✓ A3 CORRECTED: audits/amd06/verify.ts was a SECOND live producer (+8 rows / 5 tables), missed by C24's sweep — it is not in the spec's regression list, so the per-gate attribution never ran it
- ✓ A4: audits/remarkable-recording/verify.ts carries the wrap (mechanical application, NOT a verified pass)
  · credential state at this run: ANTHROPIC_API_KEY=placeholder (not a real key) · ASSEMBLYAI_API_KEY=absent — informational, not a check: this gate must not fail on an environment that HAS the credentials.
- ✓ A5 CONFIRMED: the call sites that stamp explicitly are still there and unchanged in number — 12 file(s): lib/engage.ts, audits/capture/verify.ts, audits/engage/verify.ts, audits/nested-stamp-verify.ts, audits/platform/verify.ts, audits/referral/verify.ts, prisma/fixtures/c12x-verify.ts, app/invite/[token]/actions.ts, app/practitioner/clients/actions.ts, lib/packages.ts, lib/pattern-library.ts, audits/nested-stamp-verify.ts
- ✓ A5 CONFIRMED: lib/pattern-library.ts still resolves and states its own tenant (the CLI-seam precedent)

## Verify 2 — a CLI write inside withTenantScope is stamped (the case that never worked)
- ✓ a scoped-client create in a CLI context inside withTenantScope(DEFAULT) is stamped — tenantId=tnt_valentina_000000001
- ✓ …and with a NON-default tenant it is stamped with THAT tenant, not the default — tenantId=tnt_tcv_probe_b_00001
- ✓ $transaction(fn) inside the scope stamps — tenantId=tnt_valentina_000000001
- ✓ $transaction([...]) — the separate array-form builder — stamps too — tenantId=tnt_valentina_000000001
- ✓ a write several async frames below the wrap (as a driven product lib is) is stamped — tenantId=tnt_valentina_000000001
- ✓ FLAGGED (pre-existing, not changed): a NON-default scope's upsert of a not-yet-existing row fails closed — tenant-scope: course.upsert target not found in tenant scope · adoption note: wrapping a harness in a NON-default scope turns its upserts-of-new-rows from passthrough into this refusal
- ✓ FINDING (pre-existing, ARCHITECT-REQUEST 2): practiceSetting.upsert is REFUSED for any non-default tenant — in a CLI scope AND in a REQUEST — pre-check selects {id:true} and PracticeSetting's PK is `key` → Prisma validation error; fails closed, but a second practice cannot save a setting
- ✓ …and the DEFAULT tenant is unaffected (it skips the pre-check), so this build breaks nothing that works today — tenantId=tnt_valentina_000000001

## Verify 3 — nested children and grandchildren inside a CLI scope
- ✓ parent, children and grandchildren are ALL stamped from a CLI scope (create + createMany) — parent=tnt_valentina_000000001 · 2 children · 3 grandchildren
- ✓ a nested create inside an UPDATE, from a CLI scope, is stamped at both depths — child=tnt_valentina_000000001 grandchild=tnt_valentina_000000001
- ✓ a non-default tenant's CLI scope stamps ITS id at depth — parent=tnt_tcv_probe_b_00001 child=tnt_tcv_probe_b_00001

## Verify 4 — REQUEST HEADERS STILL WIN (getting this backwards would be a cross-tenant write mechanism)
- ✓ scope INSIDE a request: withTenantScope(B) does NOT change the write's tenant away from the request's — tenantId=tnt_valentina_000000001 (wrapper said tnt_tcv_probe_b_00001)
- ✓ request INSIDE a scope: the request's tenant still wins (precedence is not nesting-order dependent) — tenantId=tnt_valentina_000000001 (wrapper said tnt_tcv_probe_b_00001)
- ✓ the other direction too: tenant B's request is not redirected to the default tenant by a wrapper — tenantId=tnt_tcv_probe_b_00001 (wrapper said tnt_valentina_000000001)
- ✓ …including nested children: the request's tenant reaches every depth, the wrapper reaches none — parent=tnt_valentina_000000001 child=tnt_valentina_000000001
- ✓ READS obey the request too: inside B's request, a DEFAULT-tenant wrapper cannot read her row — found=nothing

## Verify 5 — ABSENCE is unchanged: passthrough, unstamped, and LOUD
- ✓ a CLI write with NO scope still passes through UNSTAMPED (tenantId null, not the default tenant) — tenantId=null — ruling 24's rejected option would have made this tnt_valentina_000000001
- ✓ and the null-tenant audit still CATCHES it, by table name and count — {"logEntry":1}
- ✓ the standing gate exits NON-ZERO on that row — detection surface intact, not narrowed — audits/tenant-stamp-audit.ts exit=1
- ✓ no implicit default-tenant stamping in the unscoped path, at any depth — child tenantId=null
- ✓ the string DEFAULT_TENANT_ID appears in lib/prisma.ts only in scope/ownership logic, never as a write fallback — the only ?? DEFAULT_TENANT_ID is the unknown-SLUG case inside a request (pre-existing, matches getTenant)

## Verify 6 — an explicit tenantId still wins over the scope, at any depth
- ✓ an explicit top-level tenantId beats the scope (the scope never overwrites a stated value) — tenantId=tnt_valentina_000000001 (scope was tnt_tcv_probe_b_00001)
- ✓ a nested explicit value equal to the scope is preserved
- ✓ a DIFFERENT tenant's explicit id survives untouched at depth — a cross-tenant write stays VISIBLE, not normalised — tenantId=tnt_tcv_foreign_00001 (scope was tnt_tcv_probe_b_00001)
- ✓ and it is findable as that other tenant's row (the defect is not hidden from the audit) — 1 row(s) under tnt_tcv_foreign_00001
- ✓ an explicit tenantId: null is preserved inside a scope too (ruling 25 unchanged) — still counted by the audit

## Verify 7 — the ~10 explicit call sites keep their exact values
- ✓ a product lib that states its tenant at the call site (lib/pattern-library) keeps its EXACT value under a scope — tenantId=tnt_tcv_foreign_00001 (scope was tnt_valentina_000000001)
- ✓ an explicit stamp with no scope at all still lands exactly as stated (these files are unaffected by this build)
- ✓ every explicit tenant-stamping LINE in those files is identical to HEAD — no value was changed by this build — 11 files compared line-by-line against HEAD
~ probe tenant, courses, chapters, lessons, log entries and users removed
- ✓ SELF-CLEANING: this harness leaves zero null-tenant rows behind — {}
- ✓ the audit still covers every scoped table (79 tables, nothing narrowed) — 79 tables

TENANT-SCOPE VERIFY PASS — 48/48
