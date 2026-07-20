// C12X AI pass — X.2 enriched readings (María en · Elena es · Tomás unknown
// time · Rosa approximate time) + X.5 Integration Guide for María, with an
// on-demand refresh after a new week of record. Real model calls; evidence
// written beside this file. Reproducible:
//   ANTHROPIC_API_KEY=... DATABASE_URL=... npx tsx audits/c12x-ai-pass/run.ts

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { prisma } from "../../lib/prisma";
import { ensureChart, UNKNOWN_TIME_NOTE, APPROX_TIME_NOTE } from "../../lib/human-design";
import { ensureReading } from "../../lib/integrative-reading";
import {
  lintReadingLanguage,
  structuredToMarkdown,
  type StructuredReading,
} from "../../ai/integrativeReadingPrompt";
import { runIntegrationGuide } from "../../lib/integration-guide";
import type { GuideOutput } from "../../ai/integrationGuidePrompt";
import { STAGES } from "../../lib/spiral";

const OUT = join(__dirname);
const READINGS = join(OUT, "readings");
const GUIDE = join(OUT, "guide");
mkdirSync(READINGS, { recursive: true });
mkdirSync(GUIDE, { recursive: true });

const COORDS: Record<string, { lat: number; lng: number }> = {
  maria: { lat: 4.711, lng: -74.0721 }, // Bogotá
  elena: { lat: 23.1136, lng: -82.3666 }, // Havana (DST in effect summer 1971)
  tomas: { lat: 18.0111, lng: -66.6141 }, // Ponce
  rosa: { lat: 18.3985, lng: -66.1553 }, // Bayamón
};
const LOCALE: Record<string, "en" | "es"> = { maria: "en", elena: "es", tomas: "en", rosa: "en" };

const report: string[] = [];
const log = (s: string) => {
  report.push(s);
  console.log(s);
};

function spiralFor(id: string) {
  // Deterministic plausible values blend per client (fixture data, reviewed).
  const seed = id.length + id.charCodeAt(0);
  const picks = [STAGES[seed % STAGES.length], STAGES[(seed + 2) % STAGES.length], STAGES[(seed + 4) % STAGES.length]];
  const weights = picks.map((s, i) => ({ stage: s.key, label: s.label, weight: [0.5, 0.3, 0.2][i] }));
  return {
    centerOfGravity: picks[0].label,
    practitionerCenter: picks[0].key,
    weights,
  };
}

async function main() {
  const practitioner = await prisma.user.findFirst({ where: { role: "PRACTITIONER" } });
  if (!practitioner) throw new Error("no practitioner in fixture DB");

  log(`# C12X AI pass — ${new Date().toISOString()}`);
  log(`Model: ${process.env.ANTHROPIC_MODEL || "claude-opus-4-8"} · fixtures anchor 2026-07-14\n`);

  // ---------------- X.2 readings ----------------
  for (const id of ["maria", "elena", "tomas", "rosa"] as const) {
    const user = await prisma.user.findUnique({ where: { email: `${id}@fixture.test` } });
    if (!user) throw new Error(`fixture ${id} missing`);
    await prisma.user.update({ where: { id: user.id }, data: { locale: LOCALE[id] } });

    // Geocode (fixtures carry place + tz; lat/lng normally come from intake).
    await prisma.clientProfile.update({
      where: { userId: user.id },
      data: { birthLat: COORDS[id].lat, birthLng: COORDS[id].lng },
    });
    const profile = await prisma.clientProfile.findUnique({ where: { userId: user.id } });
    const charted = await ensureChart(profile!);
    if (!charted) throw new Error(`${id}: chart did not generate`);
    const chart = await prisma.humanDesignChart.findUnique({ where: { userId: user.id } });
    const core = await prisma.birthChartCore.findUnique({
      where: { userId: user.id },
      select: { incarnationCross: true },
    });

    // The values snapshot (third map) — practitioner-reviewed fixture blend.
    const spiral = spiralFor(id);
    await prisma.lensResult.upsert({
      where: { userId_lens: { userId: user.id, lens: "SPIRAL" } },
      create: {
        userId: user.id,
        lens: "SPIRAL",
        sourceType: "ASSESSMENT",
        result: spiral as unknown as object,
        practitionerReviewed: true,
        generatedAt: new Date(),
      },
      update: { result: spiral as unknown as object, practitionerReviewed: true },
    });

    const t0 = Date.now();
    const res = await ensureReading(user.id, { force: true });
    if (!res.ok) throw new Error(`${id}: reading failed (${res.error})`);
    const structured = res.reading.structured as StructuredReading | null;
    if (!structured) throw new Error(`${id}: no structured payload`);
    const lint = lintReadingLanguage(structured);
    const keys = structured.placements.map((p) => p.key);

    writeFileSync(join(READINGS, `${id}.json`), JSON.stringify(structured, null, 2));
    writeFileSync(join(READINGS, `${id}.md`), structuredToMarkdown(structured, LOCALE[id]) + "\n");

    log(`## ${user.name} (${id}) — locale ${LOCALE[id]}`);
    log(`- chart: ${chart?.type} · authority ${chart?.authority ?? "—"} · profile ${chart?.profile ?? "—"} · cross ${core?.incarnationCross ?? "—"}`);
    log(`- accuracyNote: ${chart?.accuracyNote ? `"${chart.accuracyNote.slice(0, 60)}…"` : "none"}`);
    log(`- reading: status ${res.reading.status} · ${structured.placements.length} placement blocks · ${Date.now() - t0}ms`);
    log(`- placements: ${keys.join(", ")}`);
    log(`- lint: ${lint.length === 0 ? "0 hits ✓" : `${lint.length} HITS — ${lint.join("; ")}`}`);

    // Missing-data assertions (spec X.2 verify).
    if (id === "tomas") {
      const banned = keys.filter((k) => ["authority", "profile", "cross"].includes(k));
      log(
        banned.length === 0
          ? "- unknown-time branch ✓ — no authority/profile/cross blocks fabricated"
          : `- unknown-time branch ✗ — fabricated blocks: ${banned.join(",")} ← FAIL`,
      );
      log(
        chart?.accuracyNote === UNKNOWN_TIME_NOTE
          ? "- unknown-time accuracyNote carried into payload ✓"
          : "- unknown-time accuracyNote MISSING ✗",
      );
    }
    if (id === "rosa") {
      log(
        chart?.accuracyNote === APPROX_TIME_NOTE
          ? "- approximate-time accuracyNote set ✓ (new — was previously indistinguishable from exact)"
          : "- approximate-time accuracyNote MISSING ✗",
      );
      const mentions = JSON.stringify(structured).match(/approximate|aproximad/i);
      log(`- reading holds time-dependent layers lightly: ${mentions ? "mentioned ✓" : "not mentioned (review manually)"}`);
    }
    log("");
  }

  // ---------------- X.5 Guide for María ----------------
  const maria = (await prisma.user.findUnique({ where: { email: "maria@fixture.test" } }))!;

  log(`## Integration Guide — María`);
  let t0 = Date.now();
  const g1 = await runIntegrationGuide(maria.id, practitioner.id);
  if (!g1.ok) throw new Error(`guide-1 failed (${g1.error})`);
  const guide1 = (await prisma.integrationGuide.findUnique({ where: { clientId: maria.id } }))!;
  const out1 = guide1.output as unknown as GuideOutput;

  const mariaItems = await prisma.recordItem.findMany({
    where: { clientId: maria.id },
    select: { id: true, title: true, kind: true, summary: true, occurredAt: true },
  });
  const itemById = new Map(mariaItems.map((i) => [i.id, i]));
  const cited = out1.components.flatMap((c) => [
    ...c.crossRefs.flatMap((r) => r.evidenceIds),
    ...c.beliefs.flatMap((b) => b.evidenceIds),
  ]);
  const resolved = cited.filter((id) => itemById.has(id));
  log(`- generated in ${Date.now() - t0}ms · ${out1.components.length} components · referral=${out1.referral.flag}`);
  log(`- citations: ${cited.length} evidence refs, ${resolved.length} resolve to her record (${cited.length === resolved.length ? "100% ✓" : "MISMATCH ✗"})`);
  const consistent = out1.components.flatMap((c) => c.crossRefs).filter((r) => r.direction === "CONSISTENT").length;
  const complicates = out1.components.flatMap((c) => c.crossRefs).filter((r) => r.direction === "COMPLICATES").length;
  log(`- cross-refs: ${consistent} consistent · ${complicates} complicating (both directions present: ${consistent > 0 && complicates > 0 ? "✓" : "review"})`);
  const cautionsCount = out1.components.reduce((s, c) => s + c.cautions.length, 0);
  log(`- confidence levels in use: ${[...new Set(out1.components.map((c) => c.confidence))].join(", ")} · cautions across components: ${cautionsCount}`);

  writeFileSync(join(GUIDE, "maria-guide-1.json"), JSON.stringify(out1, null, 2));
  writeFileSync(join(GUIDE, "maria-guide-1.md"), renderGuide(out1, itemById));

  // ---- a new week of record, then the on-demand refresh ----
  const NEW_WEEK = [
    "Said no to my sister's request to cover her shift — felt guilty for an hour, then strangely light.",
    "Slept badly before the budget presentation. The old 'I have to be perfect or they'll see' voice was loud.",
    "Walked home the long way along the ciclovía. No headphones. Best hour of the week.",
    "Told Andrés I need Saturday mornings for myself. He just said okay. All that dread for nothing.",
    "Caught myself rewriting one email five times. Stopped, sent the third version, closed the laptop.",
  ];
  for (let i = 0; i < NEW_WEEK.length; i++) {
    const when = new Date(Date.now() - (NEW_WEEK.length - i) * 86_400_000);
    const e = await prisma.logEntry.create({
      data: { clientId: maria.id, body: NEW_WEEK[i], mood: 3 + (i % 2), occurredAt: when, tags: ["boundaries"], type: "REFLECTION" },
    });
    await prisma.recordItem.create({
      data: {
        clientId: maria.id,
        kind: "LOG_ENTRY",
        occurredAt: when,
        title: "",
        summary: NEW_WEEK[i],
        tags: ["boundaries"],
        sourceType: "LogEntry",
        sourceId: e.id,
      },
    });
  }
  log(`- seeded a new week: ${NEW_WEEK.length} reflections (boundaries arc)`);

  t0 = Date.now();
  const g2 = await runIntegrationGuide(maria.id, practitioner.id);
  if (!g2.ok) throw new Error(`guide-2 failed (${g2.error})`);
  const guide2 = (await prisma.integrationGuide.findUnique({ where: { clientId: maria.id } }))!;
  const out2 = guide2.output as unknown as GuideOutput;
  const newItems = await prisma.recordItem.findMany({
    where: { clientId: maria.id },
    select: { id: true, title: true, kind: true, summary: true, occurredAt: true },
  });
  const newIds = new Set(newItems.map((i) => i.id));
  const oldIds = new Set(mariaItems.map((i) => i.id));
  const cited2 = out2.components.flatMap((c) => [
    ...c.crossRefs.flatMap((r) => r.evidenceIds),
    ...c.beliefs.flatMap((b) => b.evidenceIds),
  ]);
  const citesNew = cited2.filter((id) => newIds.has(id) && !oldIds.has(id));
  log(`- refresh in ${Date.now() - t0}ms · inputHash changed: ${guide1.inputHash !== guide2.inputHash ? "✓" : "✗"}`);
  log(`- refresh cites the new week: ${citesNew.length} refs to the fresh entries ${citesNew.length > 0 ? "✓" : "(0 — review)"}`);
  log(`- refresh citations resolve: ${cited2.every((id) => newIds.has(id)) ? "100% ✓" : "MISMATCH ✗"}`);

  writeFileSync(join(GUIDE, "maria-guide-2-refresh.json"), JSON.stringify(out2, null, 2));
  writeFileSync(join(GUIDE, "maria-guide-2-refresh.md"), renderGuide(out2, new Map(newItems.map((i) => [i.id, i]))));

  writeFileSync(join(OUT, "RUN-LOG.md"), report.join("\n") + "\n");
  console.log("\nDone — evidence in audits/c12x-ai-pass/");
}

type Item = { id: string; title: string | null; kind: string; summary: string | null; occurredAt: Date };
function renderGuide(out: GuideOutput, items: Map<string, Item>): string {
  const lines: string[] = [`# Integration Guide — rendered`, "", out.overview, ""];
  for (const c of out.components) {
    lines.push(`## ${c.title} — [${c.confidence}]`, "", c.traditional, "");
    for (const r of c.crossRefs) {
      lines.push(`- **${r.direction}** · ${r.theme} → ${r.connection} · [${r.confidence}]`);
      lines.push(`  - validate: “${r.validationQuestion}”`);
      for (const id of r.evidenceIds) {
        const it = items.get(id);
        lines.push(
          it
            ? `  - evidence ✓ ${it.occurredAt.toISOString().slice(0, 10)} · ${it.kind}: “${(it.summary ?? "").slice(0, 90)}…”`
            : `  - evidence ✗ UNRESOLVED id ${id}`,
        );
      }
      if (r.evidenceIds.length === 0) lines.push(`  - (the record doesn't establish this yet)`);
    }
    for (const b of c.beliefs) lines.push(`- belief: “${b.wording}” (${b.evidenceIds.length} refs)`);
    if (c.statementOptions.length) lines.push(`- statement options (options only): ${c.statementOptions.map((s) => `“${s}”`).join(" · ")}`);
    if (c.cautions.length) lines.push(`- cautions: ${c.cautions.join(" · ")}`);
    lines.push("");
  }
  return lines.join("\n") + "\n";
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
