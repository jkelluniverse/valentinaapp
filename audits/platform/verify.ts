import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { prisma } from "../../lib/prisma";
import { tenantDb, DEFAULT_TENANT_ID } from "../../lib/tenancy/db";
import { slugFromHost } from "../../lib/tenancy";

// PLATFORM Phase 0 §9 — the acceptance checks that can run headless:
// the tenant row + module rows exist, every root-table row carries her
// tenantId after backfill, the DAL makes cross-tenant reads impossible
// (both directions, including the legacy-null rule), and host→slug
// resolution behaves. The screenshot gate + smoke walk cover the rest.
//   DATABASE_URL=...migrated-scratch npx tsx audits/platform/verify.ts

const report: string[] = [];
const log = (s: string) => { report.push(s); console.log(s); };
let failed = 0;
const check = (name: string, ok: boolean, note = "") => {
  if (!ok) failed++;
  log(`- ${ok ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
};

async function main() {
  log(`# PLATFORM Phase 0 verify — ${new Date().toISOString()}`);

  // ---- Tenant #1 exists, exactly as she runs today ----
  log(`\n## Tenant #1`);
  const t = await prisma.tenant.findUnique({ where: { slug: "valentina" }, include: { modules: true } });
  check("tenant row exists (slug valentina)", Boolean(t));
  check("fixed id matches the DAL constant", t?.id === DEFAULT_TENANT_ID, t?.id);
  check("journey-v1 + warm-clay", t?.layoutKey === "journey-v1" && t?.skinKey === "warm-clay");
  const keys = (t?.modules ?? []).map((m) => m.moduleKey).sort();
  check(
    "her three panels as generic module keys",
    JSON.stringify(keys) === JSON.stringify(["archetypal-keys", "body-graph", "values-spiral"]),
    keys.join(", "),
  );
  const labels = (t?.modules ?? []).map((m) => (m.settings as { displayLabel?: string })?.displayLabel);
  check("her branded names live in settings, not code", labels.every(Boolean), labels.join(" · "));

  // ---- Backfill: everything she has carries her tenantId ----
  log(`\n## Backfill`);
  const orphans = await prisma.user.count({ where: { tenantId: null } });
  check("every user row carries her tenantId", orphans === 0, `null-tenant users: ${orphans}`);
  const wsOrphans = await prisma.worksheet.count({ where: { tenantId: null } });
  check("practice tables backfilled (worksheets)", wsOrphans === 0);

  // ---- Isolation: a second tenant can never see her rows ----
  log(`\n## Cross-tenant isolation (the DAL)`);
  await prisma.user.deleteMany({ where: { email: "other@tenant-b.test" } });
  await prisma.tenant.deleteMany({ where: { slug: "tenant-b" } });
  const b = await prisma.tenant.create({
    data: { slug: "tenant-b", displayName: "Tenant B (isolation probe)", status: "DEMO" },
  });
  const bUser = await prisma.user.create({
    data: { email: "other@tenant-b.test", role: "PRACTITIONER", tenantId: b.id, active: true },
  });

  const herDb = tenantDb(DEFAULT_TENANT_ID);
  const bDb = tenantDb(b.id);
  const herSees = await herDb.users.count();
  const herSeesB = await herDb.users.findFirst({ where: { email: "other@tenant-b.test" } });
  check("her tenant never sees tenant B's user", herSeesB === null, `her visible users: ${herSees}`);
  const bSees = await bDb.users.count();
  check("tenant B sees exactly its own row", bSees === 1, `tenant B visible users: ${bSees}`);
  const bSeesHer = await bDb.users.findFirst({ where: { email: "valentina@fixture.test" } });
  check("tenant B never sees her practitioner", bSeesHer === null);
  // Legacy-null rule: strip a user's tenantId → still hers, never B's.
  const maria = await prisma.user.findUnique({ where: { email: "maria@fixture.test" } });
  if (maria) {
    await prisma.user.update({ where: { id: maria.id }, data: { tenantId: null } });
    const herLegacy = await herDb.users.findFirst({ where: { id: maria.id } });
    const bLegacy = await bDb.users.findFirst({ where: { id: maria.id } });
    check("legacy null-tenant rows belong to the DEFAULT tenant only", Boolean(herLegacy) && bLegacy === null);
    await prisma.user.update({ where: { id: maria.id }, data: { tenantId: DEFAULT_TENANT_ID } });
  }
  await prisma.user.delete({ where: { id: bUser.id } });
  await prisma.tenant.delete({ where: { id: b.id } });

  // ---- Host → slug resolution ----
  log(`\n## Host resolution`);
  const noPlatform = slugFromHost("valentinavelez.com");
  check("custom domain resolves the default tenant (no PLATFORM_DOMAIN set)", noPlatform === "valentina");
  process.env.PLATFORM_DOMAIN = "portaldomain.com";
  check("subdomain resolves its slug", slugFromHost("demo-mystic.portaldomain.com") === "demo-mystic");
  check("apex resolves the default tenant", slugFromHost("portaldomain.com") === "valentina");
  check("foreign host resolves the default tenant", slugFromHost("valentinavelez.com") === "valentina");
  check("nested subdomain never leaks a slug", slugFromHost("a.b.portaldomain.com") === "valentina");
  delete process.env.PLATFORM_DOMAIN;

  log(`\n${failed === 0 ? "ALL CHECKS PASS" : `${failed} CHECK(S) FAILED`}`);
  mkdirSync(join(__dirname), { recursive: true });
  writeFileSync(join(__dirname, "VERIFY-LOG.md"), report.join("\n") + "\n");
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
