import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

// TENANT-SCOPE GUARD — runs before every build (npm prebuild hook, so it
// gates local builds AND Railway deploys). The rule it enforces: feature
// code can only reach the database through tenant-scoped surfaces.
//
//   1. `new PrismaClient(` may exist ONLY in the allowlisted plumbing/ops
//      files — anywhere else it creates an unscoped side door.
//   2. `lib/prisma-internal` (the raw client) may be imported ONLY by the
//      allowlisted files. `@/lib/prisma` is the safe import: it carries the
//      request's tenant scope structurally.
//
// Every allowlist entry carries its justification here AND in
// docs/PRISMA-ALLOWLIST.md. Extending the list is a reviewed decision, not
// a convenience.

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "lib", "components", "scripts", "audits", "prisma"];
const SCAN_FILES = ["auth.ts", "middleware.ts"];

// path → justification
const ALLOW_NEW_CLIENT: Record<string, string> = {
  "lib/prisma-internal.ts": "THE raw client definition — everything else derives from it",
  "prisma/seed.ts": "ops/seed tooling: runs from the CLI against a stated DATABASE_URL, never inside a request",
  "prisma/staging-seed.ts": "ops/seed tooling (staging roster)",
  "prisma/backfill-record.ts": "ops backfill script, CLI-only",
  "prisma/fixtures/map.ts": "fixture tooling, CLI-only",
  "prisma/fixtures/verify.ts": "fixture verification, CLI-only",
  "prisma/fixtures/kfloor-verify.ts": "fixture verification, CLI-only",
  "prisma/fixtures/packages-verify.ts": "fixture verification, CLI-only",
};

const ALLOW_RAW_IMPORT: Record<string, string> = {
  "lib/prisma.ts": "builds the scoped client on top of the raw one",
  "lib/tenancy/index.ts": "tenant resolution must read the Tenant table before any scope exists",
  "lib/tenancy/db.ts": "explicit-tenant DAL: states its tenant per call; also used by CLI audits",
  "lib/tenancy/stamp-audit.ts": "null-tenant invariant audit: cross-tenant by nature, must see every row",
  "audits/tenant-stamp-audit.ts": "CLI wrapper for the invariant audit ($disconnect only)",
  "lib/payments/refresh.ts": "payment-token health job: walks EVERY tenant's connected account from the tick",
  "lib/payments/webhook.ts": "webhook ingress: tenant comes from the event's merchant_id, never the request host — cross-tenant by nature",
  "audits/billing/b2-verify.ts": "B2 acceptance harness: CLI-only, drives checkout + webhook against a mock Square",
  "lib/billing/lifecycle.ts": "Stripe webhook ingress + grace sweep: tenant comes from the event's customer id, never the request host — cross-tenant by nature",
  "audits/billing/b3-verify.ts": "B3 acceptance harness: CLI-only, drives the subscription lifecycle against a mock Stripe",
  "audits/billing/b4-verify.ts": "B4 hardening harness: CLI-only, pruning + money invariants + client copy audit",
  "audits/platform/phase3-verify.ts": "Phase 3 acceptance harness: CLI-only, drives computed readings against a mock provider",
  "audits/platform/phase4-verify.ts": "Phase 4 acceptance harness: CLI-only, drives session/manual tools against a mock provider",
  "audits/platform/phase5-verify.ts": "Phase 5 acceptance harness: CLI-only, provisions + flips demo tenants end-to-end",
  "scripts/provision-tenant.ts": "CLI provisioning wrapper ($disconnect only; the service stamps tenantId explicitly)",
  "lib/agreements/sweep.ts": "agreements tick sweep: reminders + sealing across EVERY tenant — cross-tenant by nature",
  "audits/agreements/c20-verify.ts": "C20 acceptance harness: CLI-only, drives the sign/seal lifecycle end-to-end",
  "audits/agreements/v31-verify.ts": "v3.1 install harness: CLI-only, drives the attorney master + initials + election/retention/minor gates",
  "audits/agreements/c21-verify.ts": "C21 docsign harness: CLI-only, drives uploads + one-off external sends + stored-signature flows",
  "audits/billing/b1-verify.ts": "B1 acceptance harness: CLI-only, inspects raw rows to PROVE encryption at rest",
  "audits/pipeline/p12-verify.ts": "pipeline acceptance harness: CLI-only, inspects raw rows across the flow",
  "audits/onboarding/stage1-verify.ts": "intake engine acceptance harness: CLI-only, self-cleaning",
  "audits/onboarding/complete-verify.ts": "intake completion acceptance harness: CLI-only, throwaway client, self-cleaning",
  "audits/onboarding/ui-verify.ts": "intake UI acceptance harness: browser-driven, throwaway client, self-cleaning",
  "audits/onboarding/update-verify.ts": "birth-time UPDATE acceptance harness: CLI-only, self-cleaning",
  "audits/onboarding/discovery-verify.ts": "discovery-layer acceptance harness: browser-driven, throwaway client, self-cleaning",
  "lib/signup.ts": "C23-SIGNUP tenant-creation ingress: runs inside a request whose host is ANOTHER tenant, so the platform-level prospect ledger, the GLOBAL practitioner-email uniqueness check, the new tenant's audit row and the failure rollback are all cross-tenant by nature",
  "audits/signup/verify.ts": "C23-SIGNUP acceptance harness: browser-driven, throwaway tenants + prospects, self-cleaning",
  "audits/capture/verify.ts": "C23-CAPTURE acceptance harness: browser-driven, throwaway prospects + practitioners, self-cleaning",
};

const violations: string[] = [];

function walk(dir: string) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(name)) checkFile(p);
  }
}

function checkFile(path: string) {
  const rel = relative(ROOT, path).replace(/\\/g, "/");
  if (rel === "scripts/guard-prisma.ts") return; // the rule text matches itself
  const src = readFileSync(path, "utf8");

  if (/new\s+PrismaClient\s*\(/.test(src) && !(rel in ALLOW_NEW_CLIENT)) {
    violations.push(`${rel}: constructs its own PrismaClient (unscoped side door) — use @/lib/prisma, or allowlist with justification`);
  }
  if (/from\s+["'][^"']*prisma-internal["']/.test(src) && !(rel in ALLOW_RAW_IMPORT)) {
    violations.push(`${rel}: imports the raw prisma client — use @/lib/prisma (tenant-scoped), or allowlist with justification`);
  }
}

for (const d of SCAN_DIRS) {
  try { walk(join(ROOT, d)); } catch { /* dir absent */ }
}
for (const f of SCAN_FILES) {
  try { checkFile(join(ROOT, f)); } catch { /* file absent */ }
}

if (violations.length > 0) {
  console.error("TENANT-SCOPE GUARD FAILED — unscoped database access:\n");
  for (const v of violations) console.error(`  ✗ ${v}`);
  console.error("\nSee docs/PRISMA-ALLOWLIST.md for the rules and the allowlist.");
  process.exit(1);
}
console.log("tenant-scope guard: clean (raw prisma access confined to the allowlist)");
