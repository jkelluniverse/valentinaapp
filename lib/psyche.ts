import { prisma } from "@/lib/prisma";
import type { NodeKind, NodeSource, NodeState } from "@prisma/client";
import { nodeConfidence, type ConfidenceLevel } from "@/lib/confidence";

// C16 — the psyche graph service. PRACTITIONER-ONLY surface (route-guarded by
// callers). Weight = evidential mass that only grows (early evidence never
// expires); glow = recency of evidence (drives light, not mass). No map
// content is ever logged.

export const RELATIONS = [
  "DRIVES",
  "PROTECTS_FROM",
  "EXPRESSES_AS",
  "ROOTED_IN",
  "REINFORCES",
  "SOFTENED_BY",
] as const;
export type Relation = (typeof RELATIONS)[number];

const GLOW_WINDOW_DAYS = 45;

// Mass from evidence count: logarithmic so a wound needs accumulation to grow,
// and month-one evidence keeps counting forever (§3.5).
export function massFromEvidence(count: number): number {
  return 1 + Math.log2(1 + count);
}

// Recency glow ∈ [0,1]: what fraction of the evidence is recent. Old nodes dim
// — they never expire.
export function glowFromDates(dates: Date[], now = new Date()): number {
  if (dates.length === 0) return 0.35; // a hand-placed node holds a quiet light
  const recent = dates.filter(
    (d) => now.getTime() - d.getTime() <= GLOW_WINDOW_DAYS * 86_400_000,
  ).length;
  return Math.max(0.15, recent / dates.length);
}

export type EvidenceRef = {
  id: string;
  kind: string;
  title: string | null;
  snippet: string;
  occurredAt: string; // ISO
};

export type GraphNode = {
  id: string;
  kind: NodeKind;
  label: string;
  description: string | null;
  source: NodeSource;
  state: NodeState;
  weight: number;
  glow: number;
  giftLabel: string | null;
  suggestedState: NodeState | null;
  suggestedReason: string | null;
  chartRefs: unknown;
  chartBasis: string | null; // C12X §4 — which chart feature proposed it
  speculative: boolean; // CHART_DERIVED with no lived evidence — outline, no gravity
  confidence: ConfidenceLevel; // C12X §6 — the one vocabulary
  latestResonance: string | null; // the client's (or her) latest mark on this node
  selfX: number | null;
  selfY: number | null;
  evidence: EvidenceRef[];
  createdAt: string; // ISO — drives the time scrub
};

export type GraphEdge = {
  id: string;
  from: string;
  to: string;
  relation: string;
  weight: number;
  evidenceCount: number;
};

export type PsycheGraph = { nodes: GraphNode[]; edges: GraphEdge[] };

// Load the full constellation for a client, evidence resolved to snippets so
// every claim can open the client's actual words.
export async function loadGraph(clientId: string): Promise<PsycheGraph> {
  const [nodes, edges] = await Promise.all([
    prisma.psycheNode.findMany({
      where: { clientId, state: { not: "ARCHIVED" } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.psycheEdge.findMany({ where: { clientId } }),
  ]);

  // Resolve every referenced record item once.
  const evidenceIds = [
    ...new Set(nodes.flatMap((n) => n.evidenceRecordItemIds)),
  ];
  const items = await prisma.recordItem.findMany({
    where: { id: { in: evidenceIds }, clientId }, // clientId re-check: no cross-client leak
    select: { id: true, kind: true, title: true, summary: true, occurredAt: true },
  });
  const itemMap = new Map(items.map((i) => [i.id, i]));

  // C14-REMARKABLE / C19 — her session notes and the client's spoken moments
  // as evidence (practitioner-only surface; clientId re-checked).
  const noteIds = [...new Set(nodes.flatMap((n) => n.evidenceNoteIds))];
  const notes = noteIds.length
    ? await prisma.note.findMany({
        where: { id: { in: noteIds }, clientId },
        select: { id: true, title: true, body: true, createdAt: true },
      })
    : [];
  const noteMap = new Map(notes.map((n) => [n.id, n]));
  const trefIds = [...new Set(nodes.flatMap((n) => n.evidenceTranscriptRefs))];
  const transcriptIds = [...new Set(trefIds.map((r) => r.slice(2).split("#")[0]))];
  const transcripts = transcriptIds.length
    ? await prisma.sessionTranscript.findMany({
        where: { id: { in: transcriptIds }, clientId },
        select: { id: true, segments: true, createdAt: true },
      })
    : [];
  const transcriptMap = new Map(transcripts.map((t) => [t.id, t]));

  function resolveExtra(n: { evidenceNoteIds: string[]; evidenceTranscriptRefs: string[] }): EvidenceRef[] {
    const refs: EvidenceRef[] = [];
    for (const id of n.evidenceNoteIds) {
      const note = noteMap.get(id);
      if (!note) continue;
      refs.push({
        id: `note:${id}`,
        kind: "SESSION_NOTE",
        title: note.title || "Session note (her hand)",
        snippet: note.body.slice(0, 400),
        occurredAt: note.createdAt.toISOString(),
      });
    }
    for (const ref of n.evidenceTranscriptRefs) {
      const [tid, idxStr] = ref.slice(2).split("#");
      const t = transcriptMap.get(tid);
      if (!t) continue;
      const seg = ((t.segments as { text?: string; startMs?: number }[]) ?? [])[Number(idxStr)];
      if (!seg?.text) continue;
      const ts = seg.startMs != null ? ` · ${Math.floor(seg.startMs / 60000)}:${String(Math.floor((seg.startMs % 60000) / 1000)).padStart(2, "0")}` : "";
      refs.push({
        id: ref,
        kind: "SPOKEN",
        title: `Spoken in session${ts}`,
        snippet: seg.text.slice(0, 400),
        occurredAt: t.createdAt.toISOString(),
      });
    }
    return refs;
  }

  // C12X — latest resonance mark per node feeds the confidence vocabulary.
  const resonanceRows = await prisma.resonanceMark.findMany({
    where: { clientId, subjectType: "NODE" },
    orderBy: { createdAt: "asc" },
    select: { subjectKey: true, value: true },
  });
  const resonanceByNode = new Map<string, string>();
  for (const r of resonanceRows) resonanceByNode.set(r.subjectKey, r.value);

  const liveIds = new Set(nodes.map((n) => n.id));
  return {
    nodes: nodes.map((n) => {
      const evidence: EvidenceRef[] = [
        ...n.evidenceRecordItemIds
          .map((id) => itemMap.get(id))
          .filter((i): i is NonNullable<typeof i> => !!i)
          .map((i) => ({
            id: i.id,
            kind: i.kind as string,
            title: i.title,
            snippet: i.summary ?? "",
            occurredAt: i.occurredAt.toISOString(),
          })),
        ...resolveExtra(n),
      ].sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
      return {
        id: n.id,
        kind: n.kind,
        label: n.state === "INTEGRATED" && n.giftLabel ? n.giftLabel : n.label,
        description: n.description,
        source: n.source,
        state: n.state,
        weight: massFromEvidence(evidence.length || n.evidenceRecordItemIds.length),
        glow: glowFromDates(evidence.map((e) => new Date(e.occurredAt))),
        giftLabel: n.giftLabel,
        suggestedState: n.suggestedState,
        suggestedReason: n.suggestedReason,
        chartRefs: n.chartRefs,
        chartBasis: n.chartBasis,
        speculative: n.source === "CHART_DERIVED" && n.evidenceRecordItemIds.length === 0,
        confidence: nodeConfidence({
          source: n.source,
          state: n.state,
          evidenceCount: n.evidenceRecordItemIds.length,
          latestResonance: resonanceByNode.get(n.id) ?? null,
        }),
        latestResonance: resonanceByNode.get(n.id) ?? null,
        selfX: n.selfX,
        selfY: n.selfY,
        evidence,
        createdAt: n.createdAt.toISOString(),
      };
    }),
    edges: edges
      .filter((e) => liveIds.has(e.fromId) && liveIds.has(e.toId))
      .map((e) => ({
        id: e.id,
        from: e.fromId,
        to: e.toId,
        relation: e.relation,
        weight: e.weight,
        evidenceCount: e.evidenceRecordItemIds.length,
      })),
  };
}

// Persisted-weight refresh after evidence changes (stored weight is a cache of
// mass; glow is always computed at read time).
export async function refreshNodeWeight(nodeId: string): Promise<void> {
  const node = await prisma.psycheNode.findUnique({ where: { id: nodeId } });
  if (!node) return;
  await prisma.psycheNode.update({
    where: { id: nodeId },
    data: { weight: massFromEvidence(node.evidenceRecordItemIds.length) },
  });
}

export const KIND_LABEL: Record<NodeKind, string> = {
  WOUND: "Wound",
  SHADOW: "Shadow",
  CORE_BELIEF: "Core belief",
  PROTECTION: "Protection",
  PATTERN: "Pattern",
  BEHAVIOR: "Behavior",
  TRAIT: "Trait",
  RESOURCE: "Resource",
  GIFT: "Gift",
};

export const RELATION_LABEL: Record<string, string> = {
  DRIVES: "drives",
  PROTECTS_FROM: "protects from",
  EXPRESSES_AS: "expresses as",
  ROOTED_IN: "rooted in",
  REINFORCES: "reinforces",
  SOFTENED_BY: "softened by",
  CONNECTED: "connected (their own)", // client-drawn, gold awareness
};
