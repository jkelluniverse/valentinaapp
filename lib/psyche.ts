import { prisma } from "@/lib/prisma";
import type { NodeKind, NodeSource, NodeState } from "@prisma/client";

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

  const liveIds = new Set(nodes.map((n) => n.id));
  return {
    nodes: nodes.map((n) => {
      const evidence: EvidenceRef[] = n.evidenceRecordItemIds
        .map((id) => itemMap.get(id))
        .filter((i): i is NonNullable<typeof i> => !!i)
        .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
        .map((i) => ({
          id: i.id,
          kind: i.kind,
          title: i.title,
          snippet: i.summary ?? "",
          occurredAt: i.occurredAt.toISOString(),
        }));
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
};
