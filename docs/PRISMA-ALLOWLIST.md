# Tenant-scope enforcement — how database access works now

Since the Phase 2 structural pass, `@/lib/prisma` no longer exports a raw
Prisma client. It exports a **tenant-scoped client** with the identical call
surface: inside any HTTP request, every query on a scoped model (all 66) is
filtered to the request's tenant automatically — reads get the tenant filter
ANDed in, unique reads become scoped finds, creates are stamped with the
tenant, and unique writes on non-default tenants pass an ownership pre-check.
Outside a request (CLI scripts, seeds, audits) the client passes through
unscoped, because ops tooling states its own intentions and the request path
is the security boundary.

This is why the unread-badge bug class is now unwriteable: the 157 files that
import `@/lib/prisma` cannot produce an unscoped query from inside a request,
no matter what they forget.

## The guard

`scripts/guard-prisma.ts` runs as the npm `prebuild` hook — every local
`npm run build` and every Railway deploy fails if:

1. `new PrismaClient(` appears outside the allowlist below, or
2. `lib/prisma-internal` (the raw client) is imported outside the allowlist.

## Allowlist — raw client imports

| File | Justification |
|---|---|
| `lib/prisma.ts` | Builds the scoped client on top of the raw one. |
| `lib/tenancy/index.ts` | Tenant resolution must read the `Tenant` table before any scope can exist (and this breaks the import cycle). |
| `lib/tenancy/db.ts` | The explicit-tenant DAL — states its tenant on every call; also used by CLI audit harnesses that deliberately cross tenants to prove isolation. |
| `lib/tenancy/stamp-audit.ts` | The null-tenant invariant audit — cross-tenant by nature; runs nightly in the tick and ad hoc via `audits/tenant-stamp-audit.ts`. |
| `audits/tenant-stamp-audit.ts` | CLI wrapper for the invariant audit (imports the raw client for `$disconnect` only). |
| `lib/payments/refresh.ts` | Daily payment-token health job — walks every tenant's connected account from the tick, cross-tenant by design (BILLING §3.3). |
| `audits/billing/b1-verify.ts` | B1 acceptance harness — CLI-only; reads raw rows to prove tokens are encrypted at rest. |
| `audits/pipeline/p12-verify.ts` | Session-pipeline acceptance harness — CLI-only; inspects raw rows across the capture flow. |

## Allowlist — own PrismaClient construction

| File | Justification |
|---|---|
| `lib/prisma-internal.ts` | THE raw client definition. |
| `prisma/seed.ts`, `prisma/staging-seed.ts`, `prisma/backfill-record.ts`, `prisma/fixtures/*.ts` (map, verify, kfloor-verify, packages-verify) | Ops/seed/verification tooling: CLI-only, run against an explicitly stated `DATABASE_URL`, never inside a request. |

## Categories that are legitimate raw users (per the standing decision)

- **Migrations** — plain SQL, outside Prisma entirely.
- **Health checks** — `app/api/health` runs `$queryRaw SELECT 1`; `$queryRaw`
  passes through to the raw engine by design (and the guard confines any
  broader raw-SQL use to reviewed files).
- **Auth bootstrap** — sign-in (`auth.ts` authorize) now runs *scoped to the
  request's host tenant*, which is strictly stronger than raw: credentials
  on a demo subdomain can only match that tenant's users.

## Known honest limits (revisit when a non-default tenant gets real traffic)

- **Nested relation writes** are not auto-stamped with `tenantId` (top-level
  creates are). SAFETY NET: migration 36 converged all historical nulls to
  the default tenant, and the null-tenant invariant audit (nightly in the
  jobs tick + `audits/tenant-stamp-audit.ts` + the platform verify) fails
  loudly on any new null row — so a slipped nested write is caught within a
  day, not discovered later. Auto-stamping nested writes is tracked as a
  follow-up task.
- **`$queryRaw`/`$executeRaw`** bypass scoping — currently only the health
  check's `SELECT 1`.
- **Unique writes under the DEFAULT tenant** skip the ownership pre-check
  (every legacy row is already hers; her hot paths pay zero extra queries).
  Non-default tenants always pre-check, fail-closed.
