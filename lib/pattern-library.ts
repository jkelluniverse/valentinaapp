import { prisma } from "@/lib/prisma";

// C16.8 — the Pattern Library aggregation job: THE ONLY code in the app that
// reads psyche data across clients, and it emits abstractions only. The wall:
// PatternArchetype/PatternLink rows hold archetype label + definition + counts
// — no client foreign keys, no quotes, no evidence, no free text from records.
// Aggregates are k-floored (k >= 5) before any use, so no pattern can describe
// an identifiable person. No model training on client data — "learning" is this
// curated, inspectable library informing the extraction prompt.

export const PATTERN_LIBRARY_KEY = "patternLibraryEnabled"; // consent-gated switch (§3.6)
export const K_FLOOR = 5;

// ADDENDUM P (C20 v3.1) — the per-client participation election. Recorded
// like consent: versioned, revocable, queryable. DEFAULT DIRECTION is a
// counsel/Jacob decision — until they say otherwise, a client with NO
// election row keeps today's behavior (included under the practice-level
// switch), and an explicit opt-OUT always excludes. Flip this constant to
// false to make participation strictly opt-in.
export const PATTERN_ELECTION_DEFAULT_PARTICIPATE = true;
export const PATTERN_ELECTION_VERSION = "P-3.1";

export async function setPatternElection(clientId: string, participate: boolean, tenantId?: string): Promise<void> {
  await prisma.patternElection.upsert({
    where: { clientId },
    create: { clientId, participate, version: PATTERN_ELECTION_VERSION, ...(tenantId ? { tenantId } : {}) },
    update: { participate, version: PATTERN_ELECTION_VERSION },
  });
}

// Predicate: is this client excluded from cross-client aggregation?
async function exclusionPredicate(): Promise<(clientId: string) => boolean> {
  const elections = await prisma.patternElection.findMany({ select: { clientId: true, participate: true } });
  if (PATTERN_ELECTION_DEFAULT_PARTICIPATE) {
    const optedOut = new Set(elections.filter((e) => !e.participate).map((e) => e.clientId));
    return (id) => optedOut.has(id);
  }
  const optedIn = new Set(elections.filter((e) => e.participate).map((e) => e.clientId));
  return (id) => !optedIn.has(id);
}

export type AggregateResult =
  | { ok: true; archetypes: number; links: number; usable: number }
  | { ok: false; error: "disabled" };

function norm(label: string): string {
  return label.trim().toLowerCase().replace(/\s+/g, " ");
}

export async function aggregatePatterns(): Promise<AggregateResult> {
  const enabled = await prisma.practiceSetting.findUnique({ where: { key: PATTERN_LIBRARY_KEY } });
  if (enabled?.value !== "true") return { ok: false, error: "disabled" };

  // Stamp aggregates with the practice tenant explicitly: this job also
  // runs from CLI/tick contexts where the scoped client passes through
  // (the null-tenant invariant audit caught exactly this).
  const { getTenant } = await import("@/lib/tenancy");
  const tenantId = (await getTenant()).id;

  // ADDENDUM P — the election gate: non-participants' data never enters
  // the aggregation at all (before counting, before the k-floor).
  const isExcluded = await exclusionPredicate();

  // ---- Archetypes: label × kind → how many DISTINCT clients carry it ----
  const allNodes = await prisma.psycheNode.findMany({
    // C12X §4 — CHART_DERIVED hypotheses are NOT lived patterns: they never
    // enter the cross-client library, corroborated or not. CONTRADICTED
    // (client said "doesn't fit") stays out too.
    where: {
      state: { notIn: ["ARCHIVED", "CONTRADICTED"] },
      source: { not: "CHART_DERIVED" },
    },
    select: { id: true, clientId: true, kind: true, label: true },
  });
  const nodes = allNodes.filter((n) => !isExcluded(n.clientId));
  const byKey = new Map<string, { kind: (typeof nodes)[number]["kind"]; label: string; clients: Set<string>; ids: Map<string, string> }>();
  for (const n of nodes) {
    const key = `${n.kind}:${norm(n.label)}`;
    const entry = byKey.get(key) ?? { kind: n.kind, label: n.label.trim(), clients: new Set(), ids: new Map() };
    entry.clients.add(n.clientId);
    entry.ids.set(n.id, key);
    byKey.set(key, entry);
  }

  let archetypes = 0;
  const nodeToArchetype = new Map<string, string>(); // psyche node id → archetype id
  for (const entry of byKey.values()) {
    const arch = await prisma.patternArchetype.upsert({
      where: { label: entry.label },
      create: {
        tenantId,
        kind: entry.kind,
        label: entry.label, // the label itself — an abstraction, never a quote
        definition: "",
        clientCount: entry.clients.size,
      },
      update: { clientCount: entry.clients.size },
      select: { id: true },
    });
    for (const nodeId of entry.ids.keys()) nodeToArchetype.set(nodeId, arch.id);
    archetypes++;
  }

  // ---- Links: archetype↔archetype co-occurrence via edges, distinct clients ----
  const allEdges = await prisma.psycheEdge.findMany({
    select: { clientId: true, fromId: true, toId: true, relation: true, weight: true },
  });
  const edges = allEdges.filter((e) => !isExcluded(e.clientId));
  const linkAgg = new Map<string, { fromId: string; toId: string; relation: string; clients: Set<string>; weights: number[] }>();
  for (const e of edges) {
    const fromArch = nodeToArchetype.get(e.fromId);
    const toArch = nodeToArchetype.get(e.toId);
    if (!fromArch || !toArch || fromArch === toArch) continue;
    const key = `${fromArch}|${toArch}|${e.relation}`;
    const entry = linkAgg.get(key) ?? { fromId: fromArch, toId: toArch, relation: e.relation, clients: new Set(), weights: [] };
    entry.clients.add(e.clientId);
    entry.weights.push(e.weight);
    linkAgg.set(key, entry);
  }

  let links = 0;
  for (const l of linkAgg.values()) {
    await prisma.patternLink.upsert({
      where: { fromId_toId_relation: { fromId: l.fromId, toId: l.toId, relation: l.relation } },
      create: {
        tenantId,
        fromId: l.fromId,
        toId: l.toId,
        relation: l.relation,
        strength: l.weights.reduce((a, b) => a + b, 0) / l.weights.length,
        clientCount: l.clients.size,
      },
      update: {
        strength: l.weights.reduce((a, b) => a + b, 0) / l.weights.length,
        clientCount: l.clients.size,
      },
    });
    links++;
  }

  // Elections can remove an archetype's every carrier between runs — zero
  // out anything this run didn't see, so stale counts can't clear the floor.
  const seenLabels = [...byKey.values()].map((e) => e.label);
  await prisma.patternArchetype.updateMany({
    where: { label: { notIn: seenLabels } },
    data: { clientCount: 0 },
  });

  const usable = await prisma.patternArchetype.count({ where: { clientCount: { gte: K_FLOOR } } });
  // Metadata only.
  console.log(`[pattern-library] aggregated archetypes=${archetypes} links=${links} usable(k>=${K_FLOOR})=${usable}`);
  return { ok: true, archetypes, links, usable };
}
