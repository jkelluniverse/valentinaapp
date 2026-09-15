import { readFileSync } from "fs";
import { rawPrisma } from "../lib/prisma-internal";
import { provisionTenant, type TenantConfigFile } from "../lib/provisioning";

// PLATFORM §7 — CLI provisioning. The config JSON is the deliverable:
//
//   DATABASE_URL=... npx tsx scripts/provision-tenant.ts --config provisioning/demo-coach.json
//
// Prints the practitioner's temp password ONCE (they must change it at
// first sign-in). Refuses a taken slug or reused email; never partial —
// review the config before running.

async function main() {
  const idx = process.argv.indexOf("--config");
  const path = idx >= 0 ? process.argv[idx + 1] : null;
  if (!path) {
    console.error("usage: npx tsx scripts/provision-tenant.ts --config path.json");
    process.exit(2);
  }
  const cfg = JSON.parse(readFileSync(path, "utf8")) as TenantConfigFile;
  const result = await provisionTenant(cfg);
  if (!result.ok) {
    console.error(`REFUSED: ${result.error}`);
    process.exit(1);
  }
  console.log(`tenant provisioned: ${result.tenantId}`);
  console.log(`  subdomain: ${cfg.slug}.<PLATFORM_DOMAIN> (wildcard DNS already pointed)`);
  console.log(`  practitioner: ${result.practitionerEmail}`);
  console.log(`  temp password (shown once, must be changed at first sign-in): ${result.tempPassword}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void rawPrisma.$disconnect());
