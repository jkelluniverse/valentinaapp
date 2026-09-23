// C12X AI pass — round 2, after two fixes from RUN-LOG.md:
//  1. unknown-time layers now stripped STRUCTURALLY from the reading payload
//     (Tomás fabricated authority/profile/cross blocks in round 1)
//  2. Guide prompt gained the recency rule (round-1 refresh cited 0 fresh items)
// Re-runs only Tomás's reading and María's Guide refresh.
//   ANTHROPIC_API_KEY=... DATABASE_URL=... npx tsx audits/c12x-ai-pass/run2-fixes.ts

import { writeFileSync } from "fs";
import { join } from "path";
import { prisma } from "../../lib/prisma";
import { ensureReading } from "../../lib/integrative-reading";
import {
  lintReadingLanguage,
  structuredToMarkdown,
  type StructuredReading,
} from "../../ai/integrativeReadingPrompt";
import { runIntegrationGuide } from "../../lib/integration-guide";
import type { GuideOutput } from "../../ai/integrationGuidePrompt";

const OUT = __dirname;
const report: string[] = [];
const log = (s: string) => {
  report.push(s);
  console.log(s);
};

async function main() {
  log(`# C12X AI pass — round 2 (fixes) — ${new Date().toISOString()}`);

  // ---- Tomás: unknown-time branch, structurally enforced ----
  const tomas = (await prisma.user.findUnique({ where: { email: "tomas@fixture.test" } }))!;
  const res = await ensureReading(tomas.id, { force: true });
  if (!res.ok) throw new Error(`tomas reading failed (${res.error})`);
  const structured = res.reading.structured as StructuredReading;
  const keys = structured.placements.map((p) => p.key);
  const banned = keys.filter((k) => ["authority", "profile", "cross"].includes(k));
  const lint = lintReadingLanguage(structured);
  log(`\n## Tomás — unknown time, round 2`);
  log(`- status ${res.reading.status} · ${structured.placements.length} blocks · lint ${lint.length} hits`);
  log(`- placements: ${keys.join(", ")}`);
  log(
    banned.length === 0
      ? "- unknown-time branch ✓ — no authority/profile/cross blocks (structural strip + post-filter)"
      : `- unknown-time branch ✗ STILL FAILING: ${banned.join(",")}`,
  );
  const mentionsUnknown = /birth time|hora de nacimiento|unknown|estimated/i.test(
    structured.sections.wired + structured.sections.essence,
  );
  log(`- narrative acknowledges the estimated time plainly: ${mentionsUnknown ? "✓" : "review manually"}`);
  writeFileSync(join(OUT, "readings", "tomas.json"), JSON.stringify(structured, null, 2));
  writeFileSync(join(OUT, "readings", "tomas.md"), structuredToMarkdown(structured, "en") + "\n");

  // ---- María: Guide refresh with the recency rule ----
  const maria = (await prisma.user.findUnique({ where: { email: "maria@fixture.test" } }))!;
  const practitioner = (await prisma.user.findFirst({ where: { role: "PRACTITIONER" } }))!;
  const before = await prisma.integrationGuide.findUnique({ where: { clientId: maria.id } });
  const g = await runIntegrationGuide(maria.id, practitioner.id);
  if (!g.ok) throw new Error(`guide refresh failed (${g.error})`);
  const guide = (await prisma.integrationGuide.findUnique({ where: { clientId: maria.id } }))!;
  const out = guide.output as unknown as GuideOutput;

  const items = await prisma.recordItem.findMany({
    where: { clientId: maria.id },
    select: { id: true, title: true, kind: true, summary: true, occurredAt: true },
  });
  const itemById = new Map(items.map((i) => [i.id, i]));
  const weekAgo = new Date(Date.now() - 8 * 86_400_000);
  const freshIds = new Set(items.filter((i) => i.occurredAt >= weekAgo).map((i) => i.id));
  const cited = out.components.flatMap((c) => [
    ...c.crossRefs.flatMap((r) => r.evidenceIds),
    ...c.beliefs.flatMap((b) => b.evidenceIds),
  ]);
  const citesFresh = cited.filter((id) => freshIds.has(id));
  log(`\n## María — Guide refresh, round 2 (recency rule)`);
  log(`- ${out.components.length} components · referral=${out.referral.flag}`);
  log(`- citations: ${cited.length} refs · ${cited.every((id) => itemById.has(id)) ? "100% resolve ✓" : "MISMATCH ✗"}`);
  log(`- cites the fresh week: ${citesFresh.length} refs ${citesFresh.length > 0 ? "✓" : "✗ still stale"}`);
  log(`- inputHash changed vs round 1: ${before && before.inputHash !== guide.inputHash ? "✓" : "(same-day record; expected same)"}`);

  writeFileSync(join(OUT, "guide", "maria-guide-2-refresh.json"), JSON.stringify(out, null, 2));
  // Rendered form, same as round 1's renderer (kept simple here).
  const lines: string[] = [`# Integration Guide — refresh (round 2)`, "", out.overview, ""];
  for (const c of out.components) {
    lines.push(`## ${c.title} — [${c.confidence}]`, "", c.traditional, "");
    for (const r of c.crossRefs) {
      lines.push(`- **${r.direction}** · ${r.theme} → ${r.connection} · [${r.confidence}]`);
      lines.push(`  - validate: “${r.validationQuestion}”`);
      for (const id of r.evidenceIds) {
        const it = itemById.get(id);
        lines.push(
          it
            ? `  - evidence ✓${freshIds.has(id) ? " [NEW WEEK]" : ""} ${it.occurredAt.toISOString().slice(0, 10)} · ${it.kind}: “${(it.summary ?? "").slice(0, 90)}…”`
            : `  - evidence ✗ UNRESOLVED ${id}`,
        );
      }
      if (r.evidenceIds.length === 0) lines.push(`  - (the record doesn't establish this yet)`);
    }
    if (c.cautions.length) lines.push(`- cautions: ${c.cautions.join(" · ")}`);
    lines.push("");
  }
  writeFileSync(join(OUT, "guide", "maria-guide-2-refresh.md"), lines.join("\n") + "\n");

  writeFileSync(join(OUT, "RUN-LOG-2.md"), report.join("\n") + "\n");
  console.log("\nDone — round 2 evidence updated.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
