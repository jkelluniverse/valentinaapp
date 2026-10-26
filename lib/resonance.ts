// C12X §5 — resonance marking, the document's client-correction system.
// Marks are append-only evidence events; the latest mark per subject is its
// current resonance. "The AI must use them": retired interpretations stop
// appearing in prep/Guide; client-confirmed material leads.

import { prisma } from "@/lib/prisma";
import { record } from "@/lib/record";

export const RESONANCE_VALUES = [
  "FEELS_TRUE",
  "PARTLY",
  "DOESNT_FIT",
  "NOT_YET",
  "NO_LONGER", // practitioner-side only
] as const;
export type ResonanceValue = (typeof RESONANCE_VALUES)[number];

export const RESONANCE_LABEL: Record<ResonanceValue, { en: string; es: string }> = {
  FEELS_TRUE: { en: "Feels true", es: "Se siente verdadero" },
  PARTLY: { en: "Partly", es: "En parte" },
  DOESNT_FIT: { en: "Doesn't fit", es: "No encaja" },
  NOT_YET: { en: "Not yet explored", es: "Aún por explorar" },
  NO_LONGER: { en: "No longer relevant", es: "Ya no es relevante" },
};

export function isResonanceValue(v: string): v is ResonanceValue {
  return (RESONANCE_VALUES as readonly string[]).includes(v);
}

export type SubjectType = "READING_BLOCK" | "GUIDE_CLAIM" | "NODE";

// Record a mark (append-only) and apply its side effects on the map:
// - a READING_BLOCK mark that matches a CHART_DERIVED hypothesis acts on it
//   ("the chart proposes; the record confirms"):
//   FEELS_TRUE → client-confirmation evidence (a RecordItem, so mass/glow/
//   evidence lists all see it through the normal machinery);
//   DOESNT_FIT → the hypothesis retires (state CONTRADICTED, kept in history).
// - a NODE mark does the same directly.
export async function markResonance(args: {
  clientId: string;
  subjectType: SubjectType;
  subjectKey: string;
  value: ResonanceValue;
  markedById: string;
  markedByRole: "CLIENT" | "PRACTITIONER";
}): Promise<void> {
  const prior = await latestMark(args.clientId, args.subjectType, args.subjectKey);
  const mark = await prisma.resonanceMark.create({
    data: {
      clientId: args.clientId,
      subjectType: args.subjectType,
      subjectKey: args.subjectKey,
      value: args.value,
      priorValue: prior?.value ?? null,
      markedById: args.markedById,
      markedByRole: args.markedByRole,
    },
  });

  // Side effects on the Constellation.
  const node =
    args.subjectType === "NODE"
      ? await prisma.psycheNode.findFirst({
          where: { id: args.subjectKey, clientId: args.clientId },
        })
      : await prisma.psycheNode.findFirst({
          where: { clientId: args.clientId, blockKey: args.subjectKey, source: "CHART_DERIVED" },
        });
  if (!node) return;

  if (args.value === "FEELS_TRUE" || (args.value === "PARTLY" && node.source === "CHART_DERIVED")) {
    // Client confirmation becomes lived evidence through the front door: a
    // RecordItem, attached like any other evidence. Chart alone never grows a
    // node — but the client saying "this is me" is not the chart talking.
    await record.append({
      clientId: args.clientId,
      kind: "NOTE",
      occurredAt: mark.createdAt,
      title: args.value === "FEELS_TRUE" ? "Marked on their reading: feels true" : "Marked on their reading: partly true",
      summary: `Resonance mark on “${node.label}”.`,
      tags: ["resonance"],
      sourceType: "ResonanceMark",
      sourceId: mark.id,
    });
    const item = await prisma.recordItem.findUnique({
      where: { sourceType_sourceId: { sourceType: "ResonanceMark", sourceId: mark.id } },
      select: { id: true },
    });
    if (item && !node.evidenceRecordItemIds.includes(item.id)) {
      const merged = [...node.evidenceRecordItemIds, item.id];
      const { massFromEvidence } = await import("@/lib/psyche");
      await prisma.psycheNode.update({
        where: { id: node.id },
        data: {
          evidenceRecordItemIds: merged,
          weight: massFromEvidence(merged.length),
          // A retired hypothesis the client now confirms comes back.
          ...(node.state === "CONTRADICTED" ? { state: "ACTIVE" } : {}),
        },
      });
    }
  } else if (args.value === "DOESNT_FIT") {
    // Retire from surfacing; history stays (the document's "retire
    // interpretations that do not fit").
    if (node.state !== "INTEGRATED") {
      await prisma.psycheNode.update({
        where: { id: node.id },
        data: { state: "CONTRADICTED" },
      });
    }
  } else if (args.value === "NO_LONGER" && args.markedByRole === "PRACTITIONER") {
    if (node.state === "ACTIVE" || node.state === "LOOSENING") {
      await prisma.psycheNode.update({
        where: { id: node.id },
        data: { state: "ARCHIVED" },
      });
    }
  }
  console.log(
    `[resonance] mark client=${args.clientId} type=${args.subjectType} value=${args.value} by=${args.markedByRole}`,
  );
}

export async function latestMark(
  clientId: string,
  subjectType: SubjectType,
  subjectKey: string,
): Promise<{ value: string; createdAt: Date } | null> {
  return prisma.resonanceMark.findFirst({
    where: { clientId, subjectType, subjectKey },
    orderBy: { createdAt: "desc" },
    select: { value: true, createdAt: true },
  });
}

// Latest mark per subjectKey for a client + type — one query, newest wins.
export async function latestMarks(
  clientId: string,
  subjectType: SubjectType,
): Promise<Map<string, ResonanceValue>> {
  const rows = await prisma.resonanceMark.findMany({
    where: { clientId, subjectType },
    orderBy: { createdAt: "asc" },
    select: { subjectKey: true, value: true },
  });
  const map = new Map<string, ResonanceValue>();
  for (const r of rows) if (isResonanceValue(r.value)) map.set(r.subjectKey, r.value);
  return map;
}
