import { prisma } from "../lib/prisma";
import { rawPrisma } from "../lib/prisma-internal";
import { withTenantScope } from "../lib/tenancy/tenant-scope";
const TID = "tnt_c25_repro_00000001";
const short = (e: unknown) => String((e as Error).message).split("\n")[0].slice(0, 160);
async function main() {
  await rawPrisma.tenant.upsert({ where: { id: TID }, create: { id: TID, slug: "c25-repro", displayName: "C25 Repro", status: "ACTIVE" }, update: {} });
  // The default tenant already owns "patternLibraryEnabled". Tenant B wants its own value.
  const before = await rawPrisma.practiceSetting.findMany({ where: { key: "patternLibraryEnabled" }, select: { key: true, value: true, tenantId: true } });
  console.log("before:", before);
  try {
    await withTenantScope(TID, async () =>
      prisma.practiceSetting.upsert({
        where: { key: "patternLibraryEnabled" } as never,
        create: { key: "patternLibraryEnabled", value: "false" } as never,
        update: { value: "false" },
      }),
    );
    console.log("B setting the SAME key as A: SUCCEEDED");
  } catch (e) { console.log("B setting the SAME key as A: FAILED ->", short(e)); }
  const after = await rawPrisma.practiceSetting.findMany({ where: { key: "patternLibraryEnabled" }, select: { key: true, value: true, tenantId: true } });
  console.log("after:", after);
  await rawPrisma.tenant.delete({ where: { id: TID } }).catch(() => {});
  await rawPrisma.$disconnect();
}
main();
