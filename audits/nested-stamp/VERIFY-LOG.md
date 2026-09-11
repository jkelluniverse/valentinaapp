# C24-NESTED-STAMP — acceptance log

Run: 2026-09-11T17:48:50.780Z · `npx tsx audits/nested-stamp-verify.ts`
Database: postgresql://postgres:***@localhost:5432/veritas_scratch

Requests are simulated in-process via Next's request async storage, so every
request-path check runs through the real scoped client against the real database.

# C24-NESTED-STAMP verify — 2026-09-11T17:48:46.950Z
- ✓ simulated request scope is real (next/headers resolves inside it)

## Verify 1 — the five assumptions
- ✓ the nested-write scanner is not blind — it finds the ones the acceptance harnesses write deliberately — 24 in audits/nested-stamp-verify.ts + audits/tenant-scope-verify.ts
- ✓ A1 CORRECTED: outside the acceptance harnesses the repo contains ZERO nested relation writes on scoped models — 474 files scanned against 43 schema relation fields · hits=0
- ✓ A1 CORRECTED: the REAL mechanism — a scoped-client create OUTSIDE a request writes tenantId NULL — tenantId=null
- ✓ A1 CORRECTED: the SAME create INSIDE a request is stamped (so the request path was never the leak) — tenantId=tnt_valentina_000000001
- ✓ A2 CONFIRMED for the request path: the nested-stamp walker is used by lib/prisma.ts and nothing else — lib/prisma.ts
- ✓ A2 CORRECTED: it is NOT the only place a tenant is stamped — call sites stamp explicitly for the OUT-of-request path — 15 file(s), e.g. lib/engage.ts, audits/c12x-ai-pass/run3-patch01.ts, audits/capture/verify.ts
- ✓ A3 CONFIRMED: handwrittenNote and appointment are both in SCOPED_MODEL_SET
- ✓ A3 CONFIRMED: every scoped model has a nullable tenantId, and the audit's table list is the same list — 79 scoped models (docs/PRISMA-ALLOWLIST.md still says 66 — stale)
- ✓ A3 note: the only tenantId columns OUTSIDE the scoped set are platform-level, deliberately — TenantModule, PractitionerProspect
- ✓ A4 CONFIRMED: the producer was a GATE HARNESS (prisma/fixtures/c12x-verify.ts), not a product path — c12x exit=0 · nulls before=0 after=0 (was +11 across 6 tables)
- ✓ A5 CONFIRMED: the audit reports the offending TABLE by name and counts it — {"note":1}
- ✓ A5 CONFIRMED: the audit covers every scoped table (one count per SCOPED_MODELS entry) — 79 tables iterated

## Verify 2 — the minimal reproduction, before and after
- ✓ the pre-fix stamping shape (top level only) DOES leave a nested child null — the gap was real — parent=tnt_valentina_000000001 child=null
- ✓ and the audit sees it (this is the row the reproduction created) — {"chapter":1}
- ✓ the same reproduction through the FIXED scoped client stamps the nested child — parent=tnt_valentina_000000001 child=tnt_valentina_000000001
- ✓ zero null rows left by the reproduction

## Verify 3 — nested writes stamped at depth
- ✓ parent create carrying children: every child stamped (array form) — 2 children
- ✓ grandchildren stamped too, via nested create AND nested createMany — 3 grandchildren
- ✓ a nested create inside an UPDATE payload is stamped, child and grandchild — child=tnt_valentina_000000001 grandchild=tnt_valentina_000000001
- ✓ a NON-default tenant's request stamps its own id at depth (host-resolved) — parent=tnt_nsx_probe_b_00001 child=tnt_nsx_probe_b_00001

## Verify 4 — connectOrCreate and nested upsert
- ✓ nested connectOrCreate stamps the created row, at depth — child=tnt_valentina_000000001 grandchild=tnt_valentina_000000001
- ✓ nested upsert stamps its create branch, at depth — child=tnt_valentina_000000001 grandchild=tnt_valentina_000000001
- ✓ a create inside a nested upsert's UPDATE branch is stamped — tenantId=tnt_valentina_000000001
- ✓ top-level upsert still stamps, and now its nested create too — row=tnt_valentina_000000001 nested=tnt_valentina_000000001

## Verify 5 — an explicit tenantId is NEVER overwritten
- ✓ an explicit tenantId equal to the request's is preserved — tenantId=tnt_valentina_000000001
- ✓ a DIFFERENT tenant's explicit id survives untouched — a cross-tenant write stays VISIBLE, not normalised — tenantId=tnt_nsx_foreign_00001 (request tenant was tnt_valentina_000000001)
- ✓ and it is findable as that other tenant's row (the defect is not hidden) — 1 row(s) under tnt_nsx_foreign_00001
- ✓ the same rule holds under a non-default tenant's request — tenantId=tnt_nsx_foreign_00001
- ✓ an update through the scoped client does not rewrite an existing tenantId — tenantId=tnt_nsx_foreign_00001

## Verify 6 — platform-level models are neither stamped nor broken
- ✓ PractitionerProspect has a nullable tenantId and is NOT stamped (it means 'tenant they own', not scope) — tenantId=null
- ✓ ProspectMessage still writes fine (no tenantId column to stamp)
- ✓ Tenant and TenantModule still write fine and carry no injected scope
- ✓ no platform-level write produced a null-tenant row in a SCOPED table — {}

## Verify 10 (partial) — isolation is not weakened
- ✓ an explicit cross-tenant read from B to the default tenant returns nothing
- ✓ an explicit cross-tenant read from the default tenant to B returns nothing
- ✓ a unique write by tenant B against the default tenant's row is refused fail-closed — tenant-scope: course.update target not found in tenant scope

## Verify 9 — the backfill: counts, zero left, safe twice
- ✓ drift seeded for the backfill to find — {"chapter":1,"logEntry":2}
- ✓ the backfill migration runs (psql, ON_ERROR_STOP)
- ✓ it records exactly the rows it stamped, per table (this is what makes it reversible) — Chapter=1 LogEntry=2
- ✓ zero null-tenant rows after the backfill
- ✓ running it twice is safe — the second pass stamps nothing and errors nothing — second pass clean
~ probe tenant, courses, chapters, lessons, log entries and prospects removed
- ✓ SELF-CLEANING: this harness leaves zero null-tenant rows behind — {}

NESTED-STAMP VERIFY PASS — 43/43
