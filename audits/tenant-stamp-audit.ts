import { auditNullTenantRows } from "../lib/tenancy/stamp-audit";
import { rawPrisma } from "../lib/prisma-internal";

// CLI form of the null-tenant invariant audit (the nightly tick runs the
// same check in-process). Exits 1 on any drift.
//
//   DATABASE_URL=... npx tsx audits/tenant-stamp-audit.ts

async function main() {
  const { total, byModel } = await auditNullTenantRows();
  if (total === 0) {
    console.log("tenant-stamp audit: PASS — zero null-tenant rows across all scoped tables");
    return;
  }
  console.error(`tenant-stamp audit: FAIL — ${total} null-tenant row(s):`);
  for (const [model, n] of Object.entries(byModel)) console.error(`  · ${model}: ${n}`);
  // C24-NESTED-STAMP §1: the historically-observed cause was NOT a nested
  // relation write (nested writes are auto-stamped since lib/tenancy/stamp.ts,
  // and no product path performs one). It was a CLI script or gate harness
  // importing the SCOPED client and creating a scoped row without stating a
  // tenantId — outside a request that client is a passthrough by design.
  console.error("Likely cause: a CLI script/harness creating a scoped row without stating a tenantId");
  console.error("(the scoped client is a passthrough outside a request — see docs/PRISMA-ALLOWLIST.md limits).");
  process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => void rawPrisma.$disconnect());
