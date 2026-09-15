// C12X-PATCH-01 §2 — staleness, not schedules. Each generated artifact stores
// an inputs fingerprint; a surface asks "is this stale?" at render time and
// shows a quiet worded chip. Nothing auto-regenerates on her side (cost stays
// a decision); the client reading is the one exception — a lens joining or a
// birth-data edit changes its input hash, and the existing X.2 machinery
// regenerates it on their next visit.

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { readPracticeSetting } from "@/lib/practice-settings";
import { METHOD_SETTING_KEY } from "@/lib/integrative";

export type InputsFingerprint = {
  chartHash: string | null; // HumanDesignChart.inputHash — birth-data identity
  lenses: string[]; // lens set at generation ("HUMAN_DESIGN","GENE_KEYS","SPIRAL")
  methodHash: string | null; // her method text (formulation/Guide inputs)
  record: { count: number; lastId: string | null }; // high-water mark
};

const RECORD_GROWTH_THRESHOLD = 15; // new items before "the record has grown"

export async function currentFingerprint(clientId: string): Promise<InputsFingerprint> {
  const [chart, lenses, method, count, last] = await Promise.all([
    prisma.humanDesignChart.findUnique({
      where: { userId: clientId },
      select: { inputHash: true },
    }),
    prisma.lensResult.findMany({
      where: { userId: clientId },
      select: { lens: true, practitionerReviewed: true },
    }),
    readPracticeSetting(METHOD_SETTING_KEY),
    prisma.recordItem.count({ where: { clientId } }),
    prisma.recordItem.findFirst({
      where: { clientId },
      orderBy: { occurredAt: "desc" },
      select: { id: true },
    }),
  ]);
  return {
    chartHash: chart?.inputHash ?? null,
    // The spiral counts only once she's approved it (same rule as generation).
    lenses: lenses
      .filter((l) => l.lens !== "SPIRAL" || l.practitionerReviewed)
      .map((l) => l.lens)
      .sort(),
    methodHash: method?.value.trim()
      ? createHash("sha256").update(method.value.trim()).digest("hex")
      : null,
    record: { count, lastId: last?.id ?? null },
  };
}

export type Staleness = { stale: boolean; reasons: string[] };

// Compare a stored fingerprint against now. `watchRecord` is true for the
// artifacts that read the record (formulation, Guide) — the client reading is
// chart-only by law, so record growth never stales it.
export async function artifactStaleness(
  clientId: string,
  stored: InputsFingerprint | null,
  generatedAt: Date,
  opts: { watchRecord: boolean; watchMethod: boolean },
): Promise<Staleness> {
  const now = await currentFingerprint(clientId);
  const reasons: string[] = [];

  if (!stored) {
    // Written before staleness tracking — one refresh adopts the fingerprint.
    return { stale: true, reasons: ["written before change-tracking — refresh to adopt it"] };
  }
  if (stored.chartHash !== now.chartHash) reasons.push("their birth data changed");
  const joined = now.lenses.filter((l) => !stored.lenses.includes(l));
  if (joined.length > 0)
    reasons.push(
      joined.includes("SPIRAL") ? "the values lens joined the picture" : "a new lens joined",
    );
  if (opts.watchMethod && stored.methodHash !== now.methodHash)
    reasons.push("your method text changed");
  if (opts.watchRecord) {
    if (now.record.count - stored.record.count >= RECORD_GROWTH_THRESHOLD)
      reasons.push("the record has grown");
    else {
      const completed = await prisma.appointment.count({
        where: { clientId, kind: "SESSION", status: "COMPLETED", endAt: { gt: generatedAt } },
      });
      if (completed >= 1) reasons.push("a session completed since this was written");
    }
  }
  return { stale: reasons.length > 0, reasons };
}

// Append the superseded artifact before an overwrite — history, not amnesia.
export async function keepPriorVersion(args: {
  clientId: string;
  artifactType: "READING" | "FORMULATION" | "GUIDE";
  content: unknown;
  model: string;
  generatedAt: Date;
}): Promise<void> {
  await prisma.artifactVersion.create({
    data: {
      clientId: args.clientId,
      artifactType: args.artifactType,
      content: args.content as object,
      model: args.model,
      generatedAt: args.generatedAt,
    },
  });
}
