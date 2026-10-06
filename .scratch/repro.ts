import { prisma } from "../lib/prisma";
import { rawPrisma } from "../lib/prisma-internal";
import { withTenantScope } from "../lib/tenancy/tenant-scope";

const TID = "tnt_c25_repro_00000001";
async function main() {
  await rawPrisma.tenant.upsert({
    where: { id: TID },
    create: { id: TID, slug: "c25-repro", displayName: "C25 Repro", status: "ACTIVE" },
    update: {},
  });
  try {
    await withTenantScope(TID, async () =>
      prisma.practiceSetting.upsert({
        where: { key: "c25ReproKey" } as never,
        create: { key: "c25ReproKey", value: "one" } as never,
        update: { value: "one" },
      }),
    );
    console.log("REPRO: upsert SUCCEEDED (no defect)");
  } catch (e) {
    console.log("REPRO: upsert THREW");
    console.log("  name:", (e as Error).name);
    console.log("  message (first 12 lines):");
    console.log(String((e as Error).message).split("\n").slice(0, 12).map((l) => "    " + l).join("\n"));
  }
  await rawPrisma.practiceSetting.deleteMany({ where: { key: "c25ReproKey" } });
  await rawPrisma.tenant.delete({ where: { id: TID } }).catch(() => {});
  await rawPrisma.$disconnect();
}
main();
