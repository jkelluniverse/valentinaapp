import { readFileSync } from "fs";
import { prisma } from "../../lib/prisma";
import { MODULES, panelsFor, type TenantModuleRow } from "../../lib/modules/registry";
import { buildIntakeSchema } from "../../lib/intake/schema";

// PLATFORM Phase 2 acceptance — module registry + intake schema builder.
//
//   DATABASE_URL=...scratch npx tsx audits/platform/phase2-verify.ts
//
// Proves: (1) the registry stays trademark-free while her labels come from
// data; (2) her three panels resolve through the registry exactly as her
// TenantModule rows dictate; (3) enabling/disabling a module on a DEMO
// tenant changes BOTH the generated intake schema and the panel list with
// zero code changes — rows only. Self-cleaning.

const B = "tnt_phase2_demo_00001";
const results: { name: string; pass: boolean; note?: string }[] = [];
function check(name: string, pass: boolean, note?: string) {
  results.push({ name, pass, note });
  console.log(`- ${pass ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
}

async function cleanup() {
  await prisma.tenantModule.deleteMany({ where: { tenantId: B } }).catch(() => {});
  await prisma.tenant.deleteMany({ where: { id: B } }).catch(() => {});
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL required (scratch copy)");
  if (/railway|rlwy\.net/.test(url)) throw new Error("Refusing to run against a Railway database");

  // ---- 1. Registry hygiene (Rule 0.4) ----
  console.log("## Registry");
  const keys = Object.keys(MODULES);
  check("three panel modules registered", ["body-graph", "archetypal-keys", "values-spiral"].every((k) => keys.includes(k)), keys.join(", "));
  const bannedInCode = ["Gene Keys", "Human Design", "PSYCH-K"];
  const sources = [
    "lib/modules/types.ts",
    "lib/modules/registry.ts",
    "lib/intake/schema.ts",
    "components/modules/BodyGraphPanel.tsx",
    "components/modules/ArchetypalKeysPanel.tsx",
    "components/modules/ValuesSpiralPanel.tsx",
  ].map((p) => ({ p, src: readFileSync(p, "utf8") }));
  const dirty = sources.filter(({ src }) => bannedInCode.some((b) => src.includes(b)));
  check("module code is trademark-free (labels live in data)", dirty.length === 0, dirty.map((d) => d.p).join(", ") || "6 files scanned");

  // ---- 2. Her panels resolve from her rows ----
  console.log("\n## Her tenant (rows → panels)");
  const herRows = (await prisma.tenantModule.findMany({
    where: { tenantId: "tnt_valentina_000000001", enabled: true },
    orderBy: { position: "asc" },
  })) as unknown as TenantModuleRow[];
  const herPanels = panelsFor(herRows);
  check("three panels in her order", herPanels.map((p) => p.key).join(",") === "body-graph,archetypal-keys,values-spiral");
  check(
    "her labels come from settings, not code",
    herPanels.map((p) => p.displayLabel).join(" · ") === "Human Design · Gene Keys · Values spiral",
    herPanels.map((p) => p.displayLabel).join(" · "),
  );
  check(
    "her panel copy migrated into settings (migration 35)",
    Boolean(herPanels[1].copy.heading && herPanels[2].copy.heading && herPanels[2].copy.pending),
  );
  const herSchema = buildIntakeSchema(herRows);
  check(
    "her derived intake: identity → birth → values set",
    herSchema.steps.map((s) => s.key).join(",") === "identity,birth,module:values-spiral",
    herSchema.steps.map((s) => s.key).join(","),
  );
  check("birth-time-unknown path declared (both chart modules degrade)", herSchema.birthTime.degrades.length === 2, herSchema.birthTime.degrades.join(","));

  // ---- 3. DEMO tenant: config change alone reshapes intake + panels ----
  console.log("\n## DEMO tenant zero-code toggle");
  await cleanup();
  await prisma.tenant.create({
    data: { id: B, slug: "phase2demo", displayName: "Phase 2 Demo", status: "DEMO", layoutKey: "dashboard-v1", skinKey: "clinical-light", branding: {}, featureFlags: {} },
  });
  await prisma.tenantModule.create({
    data: { id: "tm_p2_values_000000001", tenantId: B, moduleKey: "values-spiral", enabled: true, position: 1, settings: { displayLabel: "Core Values Check" } },
  });

  const rows1 = (await prisma.tenantModule.findMany({ where: { tenantId: B } })) as unknown as TenantModuleRow[];
  const s1 = buildIntakeSchema(rows1);
  check("values-only tenant: NO birth step generated", !s1.steps.some((st) => st.key === "birth"), s1.steps.map((st) => st.key).join(","));
  check("values step wears the tenant's own label", s1.steps.some((st) => st.title === "Core Values Check"));
  check("values-only tenant: one panel", panelsFor(rows1).map((p) => p.key).join(",") === "values-spiral");

  // THE toggle: one row insert — no code, no deploy.
  await prisma.tenantModule.create({
    data: { id: "tm_p2_bodygraph_00001", tenantId: B, moduleKey: "body-graph", enabled: true, position: 0, settings: { displayLabel: "Energy Map" } },
  });
  const rows2 = (await prisma.tenantModule.findMany({ where: { tenantId: B } })) as unknown as TenantModuleRow[];
  const s2 = buildIntakeSchema(rows2);
  check("enabling body-graph adds the birth step", s2.steps.some((st) => st.key === "birth"));
  check("schema hash changed with the config", s1.hash !== s2.hash, `${s1.hash} → ${s2.hash}`);
  check("panel list follows position order", panelsFor(rows2).map((p) => p.key).join(",") === "body-graph,values-spiral");
  check("new panel wears its tenant label", panelsFor(rows2)[0].displayLabel === "Energy Map");

  // Disable instead of delete — same zero-code lever.
  await prisma.tenantModule.updateMany({ where: { tenantId: B, moduleKey: "body-graph" }, data: { enabled: false } });
  const rows3 = (await prisma.tenantModule.findMany({ where: { tenantId: B } })) as unknown as TenantModuleRow[];
  check("disabling removes birth step + panel again", !buildIntakeSchema(rows3).steps.some((st) => st.key === "birth") && panelsFor(rows3).length === 1);
  check("her schema unaffected throughout", buildIntakeSchema(herRows).hash === herSchema.hash);

  await cleanup();
  console.log("~ demo rows removed");

  const failed = results.filter((r) => !r.pass).length;
  console.log(failed === 0 ? `\nPHASE 2 VERIFY PASS — ${results.length}/${results.length}` : `\n${failed} CHECK(S) FAILED`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => void prisma.$disconnect());
