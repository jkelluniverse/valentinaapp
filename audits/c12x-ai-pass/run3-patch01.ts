// C12X-PATCH-01 §3 — the five verify checks, live. María-without-values is
// the lens-absent test case (the blocker became coverage).
//   ANTHROPIC_API_KEY=... DATABASE_URL=... npx tsx audits/c12x-ai-pass/run3-patch01.ts

import { writeFileSync } from "fs";
import { join } from "path";
import { prisma } from "../../lib/prisma";
import { ensureReading, assembleCharts, chartInputHash } from "../../lib/integrative-reading";
import {
  lintReadingLanguage,
  structuredToMarkdown,
  type StructuredReading,
} from "../../ai/integrativeReadingPrompt";
import { runIntegrationGuide } from "../../lib/integration-guide";
import { runIntegrativeSynthesis, METHOD_SETTING_KEY } from "../../lib/integrative";
import { artifactStaleness, type InputsFingerprint } from "../../lib/staleness";
import { STAGES } from "../../lib/spiral";
import type { GuideOutput } from "../../ai/integrationGuidePrompt";

const report: string[] = [];
const log = (s: string) => {
  report.push(s);
  console.log(s);
};
let failed = 0;
const check = (name: string, ok: boolean, note = "") => {
  if (!ok) failed++;
  log(`- ${ok ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
};

const METHOD_V1 =
  "Weave type and authority first; read the key spectrums as invitations; where the values blend exists, let it color pace and belonging. Where I haven't said, don't invent.";

async function guideStale(clientId: string) {
  const g = (await prisma.integrationGuide.findUnique({ where: { clientId } }))!;
  return artifactStaleness(
    clientId,
    (g.fingerprint as unknown as InputsFingerprint | null) ?? null,
    g.generatedAt,
    { watchRecord: true, watchMethod: true },
  );
}
async function formulationStale(clientId: string) {
  const f = (await prisma.integrativeProfile.findUnique({ where: { userId: clientId } }))!;
  return artifactStaleness(
    clientId,
    (f.fingerprint as unknown as InputsFingerprint | null) ?? null,
    f.generatedAt,
    { watchRecord: true, watchMethod: true },
  );
}
async function readingStale(clientId: string, locale: "en" | "es") {
  const [r, a] = await Promise.all([
    prisma.integrativeReading.findUnique({ where: { userId: clientId } }),
    assembleCharts(clientId),
  ]);
  return Boolean(r && a && r.inputHash !== chartInputHash(a.payload, locale));
}

async function main() {
  log(`# C12X-PATCH-01 verify — ${new Date().toISOString()}`);
  const maria = (await prisma.user.findUnique({ where: { email: "maria@fixture.test" } }))!;
  const practitioner = (await prisma.user.findFirst({ where: { role: "PRACTITIONER" } }))!;
  const stageWords = STAGES.map((s) => s.label.toLowerCase());

  await prisma.practiceSetting.upsert({
    where: { key: METHOD_SETTING_KEY },
    create: { key: METHOD_SETTING_KEY, value: METHOD_V1 },
    update: { value: METHOD_V1 },
  });

  // ---- Check 1: María WITHOUT values — everything still generates ----
  log(`\n## 1 · María without the values assessment`);
  await prisma.lensResult.deleteMany({ where: { userId: maria.id, lens: "SPIRAL" } });

  const r1 = await ensureReading(maria.id); // no force — hash changed (lens left)
  check("reading generates without the values lens", r1.ok, r1.ok ? "" : r1.error);
  const s1 = r1.ok ? (r1.reading.structured as StructuredReading) : null;
  if (s1) {
    const text = JSON.stringify(s1).toLowerCase();
    const speculation = stageWords.filter((w) => text.includes(w));
    check("no values-stage speculation in the reading", speculation.length === 0, speculation.join(","));
    check("language lint holds", lintReadingLanguage(s1).length === 0);
    writeFileSync(
      join(__dirname, "readings", "maria-no-values.md"),
      structuredToMarkdown(s1, "en") + "\n",
    );
  }
  const f1 = await runIntegrativeSynthesis(maria.id, practitioner.id);
  check("formulation generates without the values lens", f1.ok, f1.ok ? "" : f1.error);
  const g1 = await runIntegrationGuide(maria.id, practitioner.id);
  check("Guide generates without the values lens", g1.ok, g1.ok ? "" : g1.error);
  if (g1.ok) {
    const g = (await prisma.integrationGuide.findUnique({ where: { clientId: maria.id } }))!;
    const overview = (g.output as unknown as GuideOutput).overview.toLowerCase();
    check("Guide overview names the absent lens once", overview.includes("values"), overview.slice(0, 120));
  }

  // ---- Check 2: values scored + approved → stale chips; refresh folds it in ----
  log(`\n## 2 · The values lens joins`);
  const spiral = {
    centerOfGravity: STAGES[1].label,
    practitionerCenter: STAGES[1].key,
    weights: [
      { stage: STAGES[1].key, label: STAGES[1].label, weight: 0.5 },
      { stage: STAGES[3].key, label: STAGES[3].label, weight: 0.3 },
      { stage: STAGES[5 % STAGES.length].key, label: STAGES[5 % STAGES.length].label, weight: 0.2 },
    ],
  };
  await prisma.lensResult.create({
    data: {
      userId: maria.id,
      lens: "SPIRAL",
      sourceType: "ASSESSMENT",
      result: spiral as unknown as object,
      practitionerReviewed: true,
      generatedAt: new Date(),
    },
  });
  const gs2 = await guideStale(maria.id);
  check("Guide shows stale (lens joined)", gs2.stale, gs2.reasons.join("; "));
  const fs2 = await formulationStale(maria.id);
  check("formulation shows stale (lens joined)", fs2.stale, fs2.reasons.join("; "));
  check("client reading is stale by hash (auto-refresh next visit)", await readingStale(maria.id, "en"));

  const r2 = await ensureReading(maria.id); // the "next visit"
  check("reading auto-regenerates on next visit", r2.ok && !(await readingStale(maria.id, "en")));
  if (r2.ok) {
    const s2 = r2.reading.structured as StructuredReading;
    check("regenerated reading lint holds", lintReadingLanguage(s2).length === 0);
  }
  const f2 = await runIntegrativeSynthesis(maria.id, practitioner.id);
  const g2 = await runIntegrationGuide(maria.id, practitioner.id);
  check("formulation + Guide refresh fold the spiral in", f2.ok && g2.ok);
  const gs2b = await guideStale(maria.id);
  check("Guide no longer stale after refresh", !gs2b.stale, gs2b.reasons.join("; "));

  // ---- Check 3: record growth stales Guide/formulation, never the reading ----
  log(`\n## 3 · The record grows past the threshold`);
  for (let i = 0; i < 16; i++) {
    const when = new Date(Date.now() - i * 3_600_000);
    const e = await prisma.logEntry.create({
      data: { clientId: maria.id, body: `Growth check entry ${i} — a small noticing.`, mood: 3, occurredAt: when, tags: ["growth-check"], type: "REFLECTION" },
    });
    await prisma.recordItem.create({
      data: { clientId: maria.id, kind: "LOG_ENTRY", occurredAt: when, title: "", summary: `Growth check entry ${i}.`, tags: ["growth-check"], sourceType: "LogEntry", sourceId: e.id },
    });
  }
  const gs3 = await guideStale(maria.id);
  check("Guide stale after 16 new items", gs3.stale && gs3.reasons.some((r) => r.includes("record")), gs3.reasons.join("; "));
  const fs3 = await formulationStale(maria.id);
  check("formulation stale after 16 new items", fs3.stale);
  check("reading NOT stale from record growth (chart-only by law)", !(await readingStale(maria.id, "en")));

  // ---- Check 4: method text edit ----
  log(`\n## 4 · Her method text changes`);
  await prisma.practiceSetting.update({
    where: { key: METHOD_SETTING_KEY },
    data: { value: METHOD_V1 + " Revised: name the tension between belonging and sovereignty explicitly." },
  });
  const gs4 = await guideStale(maria.id);
  check("Guide stale on method edit", gs4.stale && gs4.reasons.some((r) => r.includes("method")), gs4.reasons.join("; "));
  const fs4 = await formulationStale(maria.id);
  check("formulation stale on method edit", fs4.stale);
  check("reading NOT stale on method edit (method is practitioner-side)", !(await readingStale(maria.id, "en")));

  // ---- Check 5: prior versions retained ----
  log(`\n## 5 · History, not amnesia`);
  const versions = await prisma.artifactVersion.groupBy({
    by: ["artifactType"],
    where: { clientId: maria.id },
    _count: true,
  });
  const count = (t: string) => versions.find((v) => v.artifactType === t)?._count ?? 0;
  check("prior READING versions kept", count("READING") >= 2, `${count("READING")}`);
  check("prior GUIDE versions kept", count("GUIDE") >= 1, `${count("GUIDE")}`);
  check("prior FORMULATION versions kept", count("FORMULATION") >= 1, `${count("FORMULATION")}`);

  log(`\n${failed === 0 ? "ALL CHECKS PASS" : `${failed} CHECK(S) FAILED`}`);
  writeFileSync(join(__dirname, "RUN-LOG-3-PATCH01.md"), report.join("\n") + "\n");
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
