# Tenant-scope enforcement — how database access works now

Since the Phase 2 structural pass, `@/lib/prisma` no longer exports a raw
Prisma client. It exports a **tenant-scoped client** with the identical call
surface: inside any HTTP request, every query on a scoped model (all 79) is
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
| `lib/payments/webhook.ts` | Square webhook ingress — tenant resolved from the event's `merchant_id`, never the request host; cross-tenant by nature. |
| `audits/billing/b2-verify.ts` | B2 acceptance harness — CLI-only; drives checkout + signed webhooks against a mock Square. |
| `lib/billing/lifecycle.ts` | Stripe webhook ingress + grace sweep — tenant resolved from the event's customer id, never the request host; cross-tenant by nature. |
| `audits/billing/b3-verify.ts` | B3 acceptance harness — CLI-only; drives the subscription lifecycle against a mock Stripe. |
| `audits/billing/b4-verify.ts` | B4 hardening harness — CLI-only; pruning + money invariants + client copy audit. |
| `audits/platform/phase3-verify.ts` | Phase 3 acceptance harness — CLI-only; drives computed readings against a mock provider. |
| `audits/platform/phase4-verify.ts` | Phase 4 acceptance harness — CLI-only; drives session/manual tools against a mock provider. |
| `audits/platform/phase5-verify.ts` | Phase 5 acceptance harness — CLI-only; provisions + flips demo tenants end-to-end. |
| `scripts/provision-tenant.ts` | CLI provisioning wrapper — `$disconnect` only; the service stamps tenantId explicitly. |
| `lib/agreements/sweep.ts` | Agreements tick sweep — reminders + sealing across every tenant; cross-tenant by nature. |
| `audits/agreements/c20-verify.ts` | C20 acceptance harness — CLI-only; drives the sign/seal lifecycle end-to-end. |
| `audits/agreements/v31-verify.ts` | v3.1 install harness — CLI-only; attorney master + initials + election/retention/minor gates. |
| `audits/agreements/c21-verify.ts` | C21 docsign harness — CLI-only; uploads + one-off external sends + stored-signature flows. |
| `audits/pipeline/p12-verify.ts` | Session-pipeline acceptance harness — CLI-only; inspects raw rows across the capture flow. |
| `audits/onboarding/stage1-verify.ts` | Intake-engine acceptance harness — CLI-only; self-cleaning. |
| `audits/onboarding/complete-verify.ts` | Intake-completion acceptance harness — CLI-only; throwaway client; self-cleaning. |
| `audits/onboarding/ui-verify.ts` | Intake UI acceptance harness — browser-driven; throwaway client; self-cleaning. |
| `audits/onboarding/update-verify.ts` | Birth-time UPDATE acceptance harness — CLI-only; self-cleaning. |
| `audits/onboarding/discovery-verify.ts` | Discovery-layer acceptance harness — browser-driven; throwaway client; self-cleaning. |
| `lib/signup.ts` | C23-SIGNUP tenant-creation ingress — a public request whose host belongs to ANOTHER tenant creates a NEW one. Cross-tenant by nature (same shape as the webhook ingresses): the platform-level `PractitionerProspect` ledger, the GLOBAL `User.email` uniqueness check (a request-scoped read would miss another practice's owner and turn a clean refusal into a mid-provision P2002), the audit row belonging to the NEW tenant, and the rollback that guarantees no half-built practice survives a failure. |
| `audits/signup/verify.ts` | C23-SIGNUP acceptance harness — browser-driven; throwaway tenants + prospects; self-cleaning. |
| `audits/capture/verify.ts` | C23-CAPTURE acceptance harness — browser-driven; throwaway prospects + practitioners; self-cleaning. |
| `audits/referral/verify.ts` | C23-REFERRAL acceptance harness — browser-driven; seeds a referral fan-out across TWO throwaway tenants (cross-tenant isolation cannot be proven from inside one tenant's scope); self-cleaning. |
| `audits/tenant-scope-verify.ts` | C24.1-TENANT-SCOPE acceptance harness — CLI-only. It must read `tenantId` columns RAW, must write a deliberately foreign `tenantId` to prove the out-of-request scope never overrides a stated value, and must prove that WITHOUT a scope the same write still lands NULL (ruling 24's rejected option, kept rejected); self-cleaning. |
| `audits/nested-stamp-verify.ts` | C24-NESTED-STAMP acceptance harness — CLI-only. It must read `tenantId` columns RAW (a scoped read would hide the very rows it exists to see) and must WRITE a deliberately foreign `tenantId` to prove the client leaves it alone; self-cleaning. |
| `audits/practice-setting-verify.ts` | C25-PRACTICE-SETTING-TENANCY acceptance harness — CLI + browser-driven. It must read `tenantId` columns RAW (a scoped read would hide the very rows it exists to see), must CREATE a deliberate null-tenant row so migration 49's backfill has something to count, and must reverse and re-apply migration 49 against the live database to prove Valentina's rows survive it; self-cleaning. Note that C25's own product code needed NO entry: `lib/practice-settings.ts` uses the SCOPED client and resolves the tenant through the client's own resolver (`scopeTenantId`). |
| `audits/engage/verify.ts` | C23-ENGAGE acceptance harness — seeds throwaway prospects, drives `/api/jobs/tick`, and inspects the `ProspectMessage` send ledger and `AuditEvent` rows directly (an idempotency proof that read through the scoped client would be proving the wrong thing); self-cleaning. Note that C23-ENGAGE's own product code needed NO entry: `ProspectMessage` is platform-level like `PractitionerProspect`, so the scoped client passes it through. |

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

- **Nested relation writes ARE now auto-stamped** at any depth
  (C24-NESTED-STAMP, `lib/tenancy/stamp.ts`): nested `create` / `createMany` /
  `connectOrCreate` / `upsert`, and creates inside a nested `update`, inherit
  the request's tenant. An explicitly-provided `tenantId` is never
  overwritten — not even a different tenant's, which must stay VISIBLE to the
  audit rather than be silently normalised. Proven by
  `audits/nested-stamp-verify.ts` (43/43). Note that no code in this repo
  actually performed a nested relation write on a scoped model, so this closed
  a latent hole rather than an active leak.
- **THE REAL SOURCE OF NULL-TENANT ROWS is the out-of-request passthrough.**
  Outside an HTTP request the scoped client is unscoped by design, so a CLI
  script or gate harness that imports `@/lib/prisma` and creates a scoped row
  WITHOUT stating a `tenantId` writes a null one. The contract is that ops
  tooling states its own tenant — `lib/pattern-library.ts` shows the call-site
  pattern (`(await getTenant()).id`), and since C24.1-TENANT-SCOPE there is a
  one-line way to say it for a whole script: **`withTenantScope(tenantId, fn)`**
  (`lib/tenancy/tenant-scope.ts`). The client consults that scope ONLY when
  `headers()` is unavailable, so **the request's tenant always wins** and
  absence of a scope is still plain passthrough — deliberately loud, never an
  implicit default-tenant stamp (ruling 24 rejected that). Adopted by
  `prisma/fixtures/c12x-verify.ts`, `audits/amd06/verify.ts`,
  `audits/password-reset/verify.ts`, `scripts/smoke-writes.ts` and
  `audits/remarkable-recording/verify.ts`. Known violators found by per-gate
  attribution: `prisma/fixtures/c12x-verify.ts` (11 rows / 6 tables per run —
  fixed in C24), `audits/amd06/verify.ts` (8 rows / 5 tables per run — found
  and fixed in C24.1; it is not in any regression list, which is why it went
  unseen) and `audits/remarkable-recording/verify.ts` (`handwrittenNote: 1` +
  `appointment: 1` — now wrapped, but UNVERIFIABLE without vendor
  credentials). `audits/c12x-ai-pass/run*.ts` are unresolved candidates of the
  same shape; see docs/reports/outbox/BUILD-REPORT-C24.1-TENANT-SCOPE.md.
  SAFETY NET unchanged:
  migration 36 and migration 48 converged historical nulls, and the
  null-tenant invariant audit (nightly in the jobs tick +
  `audits/tenant-stamp-audit.ts` + the platform verify) fails loudly on any
  new null row.
- **`$queryRaw`/`$executeRaw`** bypass scoping — currently only the health
  check's `SELECT 1`.
- **Unique writes under the DEFAULT tenant** skip the ownership pre-check
  (every legacy row is already hers; her hot paths pay zero extra queries).
  Non-default tenants always pre-check, fail-closed.
