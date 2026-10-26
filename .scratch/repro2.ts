import { prisma } from "../lib/prisma";
import { rawPrisma } from "../lib/prisma-internal";
import { withTenantScope } from "../lib/tenancy/tenant-scope";
import { DEFAULT_TENANT_ID } from "../lib/tenancy/scope";

const TID = "tnt_c25_repro_00000001";
const short = (e: unknown) => String((e as Error).message).split("\n").slice(0, 3).join(" | ").slice(0, 200);

async function main() {
  await rawPrisma.tenant.upsert({
    where: { id: TID },
    create: { id: TID, slug: "c25-repro", displayName: "C25 Repro", status: "ACTIVE" },
    update: {},
  });
  await rawPrisma.patternArchetype.deleteMany({ where: { label: { startsWith: "c25-probe" } } });

  // (a) non-default tenant, upsert of a row that does not exist ANYWHERE
  try {
    await withTenantScope(TID, async () =>
      prisma.patternArchetype.upsert({
        where: { label: "c25-probe-absent" },
        create: { label: "c25-probe-absent", kind: "PATTERN", definition: "d" },
        update: { definition: "d" },
      }),
    );
    console.log("(a) absent-row upsert in tenant B: SUCCEEDED");
  } catch (e) { console.log("(a) absent-row upsert in tenant B: THREW ->", short(e)); }

  // (b) same, for the DEFAULT tenant (control)
  try {
    await withTenantScope(DEFAULT_TENANT_ID, async () =>
      prisma.patternArchetype.upsert({
        where: { label: "c25-probe-default" },
        create: { label: "c25-probe-default", kind: "PATTERN", definition: "d" },
        update: { definition: "d" },
      }),
    );
    console.log("(b) absent-row upsert as DEFAULT tenant: SUCCEEDED");
  } catch (e) { console.log("(b) absent-row upsert as DEFAULT tenant: THREW ->", short(e)); }

  // (c) cross-tenant: default owns the label, tenant B tries to upsert it
  try {
    await withTenantScope(TID, async () =>
      prisma.patternArchetype.upsert({
        where: { label: "c25-probe-default" },
        create: { label: "c25-probe-default", kind: "PATTERN", definition: "hijack" },
        update: { definition: "hijack" },
      }),
    );
    console.log("(c) cross-tenant upsert from B onto A's row: SUCCEEDED (HOLE)");
  } catch (e) { console.log("(c) cross-tenant upsert from B onto A's row: REFUSED ->", short(e)); }

  const rows = await rawPrisma.patternArchetype.findMany({ where: { label: { startsWith: "c25-probe" } }, select: { label: true, tenantId: true, definition: true } });
  console.log("rows:", rows);
  await rawPrisma.patternArchetype.deleteMany({ where: { label: { startsWith: "c25-probe" } } });
  await rawPrisma.tenant.delete({ where: { id: TID } }).catch(() => {});
  await rawPrisma.$disconnect();
}
main();
