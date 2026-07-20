// C12X machine verification — the deterministic mechanics, proven on a scratch
// database (no AI calls). Run: DATABASE_URL=... npx tsx prisma/fixtures/c12x-verify.ts
//
// Covers the spec's X.3/X.4 verify lines:
//   · chart alone never grows a node (seeds are outline: weight 1, no evidence)
//   · seeding is idempotent
//   · "feels true" strengthens (client-confirmation evidence via a RecordItem)
//   · "doesn't fit" retires (CONTRADICTED), and a later "feels true" revives
//   · confidence derivation maps §6 levels correctly
//   · the Pattern Library never ingests CHART_DERIVED nodes
//   · the reading language lint catches banned phrases (en + es)
//   · the 8-criteria statement lint rejects negation/future/absolutes

import { prisma } from "../../lib/prisma";
import { seedChartHypotheses } from "../../lib/chart-seeds";
import { markResonance } from "../../lib/resonance";
import { nodeConfidence } from "../../lib/confidence";
import { lintReadingLanguage, type StructuredReading } from "../../ai/integrativeReadingPrompt";
import { lintStatement } from "../../lib/belief-statements";
import { aggregatePatterns } from "../../lib/pattern-library";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  console.log("C12X verify — deterministic mechanics\n");

  // ---- Fixture client with an HD chart that has open centers ----
  const user = await prisma.user.upsert({
    where: { email: "c12x-verify@fixture.test" },
    create: {
      email: "c12x-verify@fixture.test",
      name: "C12X Verify",
      role: "CLIENT",
      passwordHash: "x",
    },
    update: {},
  });
  await prisma.psycheNode.deleteMany({ where: { clientId: user.id } });
  await prisma.resonanceMark.deleteMany({ where: { clientId: user.id } });
  await prisma.recordItem.deleteMany({ where: { clientId: user.id } });
  await prisma.humanDesignChart.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      provider: "verify",
      centers: { Head: "open", Ajna: "open", Throat: "defined", G: "defined", Heart: "open", Sacral: "defined", Spleen: "defined", SolarPlexus: "defined", Root: "defined" },
      inputHash: "verify",
      generatedAt: new Date(),
    },
    update: {
      centers: { Head: "open", Ajna: "open", Throat: "defined", G: "defined", Heart: "open", Sacral: "defined", Spleen: "defined", SolarPlexus: "defined", Root: "defined" },
    },
  });

  // ---- X.4: seeding ----
  const created = await seedChartHypotheses(user.id);
  check("seeds one hypothesis per open center", created === 3, `created=${created}`);
  const again = await seedChartHypotheses(user.id);
  check("seeding is idempotent", again === 0, `created=${again}`);
  const seeds = await prisma.psycheNode.findMany({
    where: { clientId: user.id, source: "CHART_DERIVED" },
  });
  check(
    "chart alone never grows a node (weight 1, zero evidence)",
    seeds.every((s) => s.weight === 1 && s.evidenceRecordItemIds.length === 0),
  );

  const head = seeds.find((s) => s.blockKey === "center:head")!;
  check("hypothesis carries its chart basis", head.chartBasis === "open Head center");

  // ---- X.3: resonance side effects ----
  await markResonance({
    clientId: user.id,
    subjectType: "READING_BLOCK",
    subjectKey: "center:head",
    value: "FEELS_TRUE",
    markedById: user.id,
    markedByRole: "CLIENT",
  });
  const headAfter = await prisma.psycheNode.findUnique({ where: { id: head.id } });
  check(
    "'feels true' strengthens: one confirmation evidence attached",
    headAfter!.evidenceRecordItemIds.length === 1 && headAfter!.weight > 1,
    `evidence=${headAfter!.evidenceRecordItemIds.length} weight=${headAfter!.weight}`,
  );
  const evidenceItem = await prisma.recordItem.findFirst({
    where: { clientId: user.id, sourceType: "ResonanceMark" },
  });
  check("the confirmation is a real RecordItem (front-door evidence)", Boolean(evidenceItem));

  const ajna = seeds.find((s) => s.blockKey === "center:ajna")!;
  await markResonance({
    clientId: user.id,
    subjectType: "READING_BLOCK",
    subjectKey: "center:ajna",
    value: "DOESNT_FIT",
    markedById: user.id,
    markedByRole: "CLIENT",
  });
  const ajnaAfter = await prisma.psycheNode.findUnique({ where: { id: ajna.id } });
  check("'doesn't fit' retires the hypothesis (CONTRADICTED)", ajnaAfter!.state === "CONTRADICTED");

  await markResonance({
    clientId: user.id,
    subjectType: "READING_BLOCK",
    subjectKey: "center:ajna",
    value: "FEELS_TRUE",
    markedById: user.id,
    markedByRole: "CLIENT",
  });
  const ajnaRevived = await prisma.psycheNode.findUnique({ where: { id: ajna.id } });
  check("a later 'feels true' revives it", ajnaRevived!.state === "ACTIVE");
  const marks = await prisma.resonanceMark.findMany({
    where: { clientId: user.id, subjectKey: "center:ajna" },
    orderBy: { createdAt: "asc" },
  });
  check(
    "marks are append-only with prior state recorded",
    marks.length === 2 && marks[1].priorValue === "DOESNT_FIT",
  );

  // ---- X.1: confidence derivation ----
  check(
    "SPECULATIVE: chart-derived, no evidence",
    nodeConfidence({ source: "CHART_DERIVED", state: "ACTIVE", evidenceCount: 0 }) === "SPECULATIVE",
  );
  check(
    "CONFIRMED: feels-true mark",
    nodeConfidence({ source: "CHART_DERIVED", state: "ACTIVE", evidenceCount: 1, latestResonance: "FEELS_TRUE" }) === "CONFIRMED",
  );
  check(
    "CONTRADICTED: doesn't-fit dominates",
    nodeConfidence({ source: "AI_EXTRACTED", state: "ACTIVE", evidenceCount: 4, latestResonance: "DOESNT_FIT" }) === "CONTRADICTED",
  );
  check(
    "SUPPORTED at 3+, CONFIRMED at 5+ evidence",
    nodeConfidence({ source: "AI_EXTRACTED", state: "ACTIVE", evidenceCount: 3 }) === "SUPPORTED" &&
      nodeConfidence({ source: "AI_EXTRACTED", state: "ACTIVE", evidenceCount: 5 }) === "CONFIRMED",
  );
  check(
    "RESOLVED: integrated arc end",
    nodeConfidence({ source: "AI_EXTRACTED", state: "INTEGRATED", evidenceCount: 6 }) === "RESOLVED",
  );
  check(
    "EMERGING: thin evidence",
    nodeConfidence({ source: "AI_EXTRACTED", state: "ACTIVE", evidenceCount: 1 }) === "EMERGING",
  );

  // ---- X.4: Pattern Library exclusion ----
  await prisma.practiceSetting.upsert({
    where: { key: "patternLibraryEnabled" },
    create: { key: "patternLibraryEnabled", value: "true" },
    update: { value: "true" },
  });
  await aggregatePatterns();
  const leaked = await prisma.patternArchetype.findMany({
    where: { label: { in: seeds.map((s) => s.label) } },
  });
  check("Pattern Library never ingests chart hypotheses", leaked.length === 0);

  // ---- X.2: language lint ----
  const cleanReading: StructuredReading = {
    sections: {
      essence: "You may notice a quiet steadiness in how you meet the world.",
      wired: "One possibility to explore is resting before deciding.",
      acrossTheBoard: "Notice whether work feels different after rest.",
      whereItPoints: "This can look like patience becoming a gift.",
      startHere: "Try one small pause this week.",
      closing: "Take only what rings true.",
    },
    placements: [],
  };
  check("lint passes invitation language", lintReadingLanguage(cleanReading).length === 0);
  const dirty = {
    ...cleanReading,
    sections: { ...cleanReading.sections, essence: "The chart proves you will always avoid conflict. This is why you struggle." },
  };
  check("lint catches banned English phrasing", lintReadingLanguage(dirty).length >= 2);
  const dirtyEs = {
    ...cleanReading,
    sections: { ...cleanReading.sections, wired: "El mapa demuestra que siempre serás así — por eso eres cauteloso." },
  };
  check("lint catches banned Spanish phrasing", lintReadingLanguage(dirtyEs).length >= 2);

  // ---- X.6: statement lint ----
  check("statement lint passes a clean present-tense statement", lintStatement("I am safe being seen as I am").pass);
  check("statement lint rejects negation", !lintStatement("I am not afraid anymore, never again").pass);
  check("statement lint rejects future tense", !lintStatement("I will be confident someday").pass);
  check("statement lint rejects rigid absolutes", !lintStatement("I am always perfectly calm in my life").pass);

  console.log(`\n${passed} passed · ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
