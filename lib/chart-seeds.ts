// C12X §4 — chart-seeded hypotheses: "the chart proposes; the record confirms."
// Deterministic (no AI call): each OPEN center proposes one classic
// conditioning hypothesis as a CHART_DERIVED outline node. Zero evidence at
// birth — massFromEvidence(0), no gravity, stroke-only rendering. The chart
// alone can NEVER grow one of these; only lived evidence (or the client's own
// "feels true") gives it body. Excluded from the Pattern Library by source.

import { prisma } from "@/lib/prisma";

// blockKey matches the enriched reading's placement keys (§2), so a client's
// resonance mark on a reading block finds its hypothesis on the map.
const OPEN_CENTER_HYPOTHESES: Record<
  string,
  { label: string; description: string; blockKey: string }
> = {
  Head: {
    label: "Carrying others' mental pressure",
    description:
      "With an open Head, there may be a pull to answer questions that aren't theirs — pressure to figure things out that belongs to the room, not to them.",
    blockKey: "center:head",
  },
  Ajna: {
    label: "Needing to seem certain",
    description:
      "An open Ajna can carry a pressure to hold fixed opinions and appear certain — while their real gift may be seeing many sides.",
    blockKey: "center:ajna",
  },
  Throat: {
    label: "Pushing to be heard",
    description:
      "An open Throat can carry pressure to speak, to get attention, to make things happen by talking — and exhaustion when words go unmet.",
    blockKey: "center:throat",
  },
  G: {
    label: "Searching for direction in others",
    description:
      "An open G can show up as borrowing identity and direction from whoever is closest — places and people shape who they feel themselves to be.",
    blockKey: "center:g",
  },
  Heart: {
    label: "Proving worth",
    description:
      "An open Heart can carry a pattern of proving — promising too much, working to earn a worth that was never actually in question.",
    blockKey: "center:heart",
  },
  Sacral: {
    label: "Not knowing when enough is enough",
    description:
      "An open Sacral can mean borrowed energy and difficulty stopping — working past their own limits because the momentum isn't theirs.",
    blockKey: "center:sacral",
  },
  SolarPlexus: {
    label: "Avoiding emotional waves",
    description:
      "An open Solar Plexus can amplify others' feelings and drive a pattern of avoiding confrontation and truth to keep the emotional weather calm.",
    blockKey: "center:solarplexus",
  },
  Spleen: {
    label: "Holding on past the time",
    description:
      "An open Spleen can show up as holding on — to relationships, jobs, habits — past the moment they stopped being good, for the safety of the familiar.",
    blockKey: "center:spleen",
  },
  Root: {
    label: "Hurrying to be free of pressure",
    description:
      "An open Root can carry a rush — doing things quickly just to get the pressure to stop, deciding from urgency that isn't really theirs.",
    blockKey: "center:root",
  },
};

// Idempotent: skips hypotheses that already exist (by blockKey) and never
// touches nodes she or the extractor created. Returns how many were seeded.
export async function seedChartHypotheses(clientId: string): Promise<number> {
  try {
    const chart = await prisma.humanDesignChart.findUnique({
      where: { userId: clientId },
      select: { centers: true },
    });
    if (!chart?.centers) return 0;
    const centers = chart.centers as Record<string, string>;

    const existing = await prisma.psycheNode.findMany({
      where: { clientId, source: "CHART_DERIVED" },
      select: { blockKey: true },
    });
    const have = new Set(existing.map((n) => n.blockKey).filter(Boolean));

    let created = 0;
    for (const [center, state] of Object.entries(centers)) {
      if (state !== "open") continue;
      const h = OPEN_CENTER_HYPOTHESES[center];
      if (!h || have.has(h.blockKey)) continue;
      await prisma.psycheNode.create({
        data: {
          clientId,
          kind: "PATTERN",
          label: h.label,
          description: h.description,
          source: "CHART_DERIVED",
          state: "ACTIVE",
          weight: 1, // massFromEvidence(0) — outline only, no gravity
          evidenceRecordItemIds: [],
          chartBasis: `open ${center} center`,
          chartRefs: { center },
          blockKey: h.blockKey,
        },
      });
      created++;
    }
    if (created > 0) console.log(`[chart-seeds] client=${clientId} seeded=${created}`);
    return created;
  } catch {
    console.error(`[chart-seeds] seeding failed client=${clientId}`);
    return 0;
  }
}
