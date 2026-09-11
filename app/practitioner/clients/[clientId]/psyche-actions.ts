"use server";

import { revalidatePath } from "next/cache";
import type { NodeKind, NodeState } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { writePracticeSetting } from "@/lib/practice-settings";
import { requirePractitioner } from "@/lib/auth-guards";
import { runPsycheExtraction } from "@/lib/psyche-extract";
import { massFromEvidence, RELATIONS } from "@/lib/psyche";
import { markResonance, isResonanceValue } from "@/lib/resonance";

// C16.4 — Valentina's hand on the constellation. The AI builds; she curates
// truth into it. Every action is audited (PsycheAudit). All scoped: a node id
// that isn't this client's behaves like a missing one. No map content in logs.

type Res = { ok: boolean; error?: string };

const KINDS: NodeKind[] = [
  "WOUND",
  "SHADOW",
  "CORE_BELIEF",
  "PROTECTION",
  "PATTERN",
  "BEHAVIOR",
  "TRAIT",
  "RESOURCE",
  "GIFT",
];

async function audit(clientId: string, actorId: string, action: string, detail: string) {
  await prisma.psycheAudit.create({ data: { clientId, actorId, action, detail } });
}
function revalidate(clientId: string) {
  revalidatePath(`/practitioner/clients/${clientId}`);
}
async function ownNode(nodeId: string, clientId: string) {
  return prisma.psycheNode.findFirst({ where: { id: nodeId, clientId } });
}

export async function extract(clientId: string, deep: boolean): Promise<Res & { created?: number; updated?: number; referral?: boolean }> {
  const me = await requirePractitioner();
  const res = await runPsycheExtraction(clientId, me.id, { deep });
  if (!res.ok) return { ok: false, error: res.error };
  revalidate(clientId);
  return { ok: true, created: res.created, updated: res.updated, referral: res.referral };
}

export async function addNode(
  clientId: string,
  input: { kind: string; label: string; description?: string; giftLabel?: string },
): Promise<Res> {
  const me = await requirePractitioner();
  const label = input.label.trim();
  if (!label || !KINDS.includes(input.kind as NodeKind)) return { ok: false, error: "invalid" };
  const client = await prisma.user.findFirst({ where: { id: clientId, role: "CLIENT" }, select: { id: true } });
  if (!client) return { ok: false, error: "not-found" };
  const node = await prisma.psycheNode.create({
    data: {
      clientId,
      kind: input.kind as NodeKind,
      label: label.slice(0, 120),
      description: input.description?.trim().slice(0, 1500) || null,
      giftLabel: input.giftLabel?.trim().slice(0, 120) || null,
      source: "PRACTITIONER",
      evidenceRecordItemIds: [],
    },
  });
  await audit(clientId, me.id, "ADD_NODE", `node=${node.id} kind=${input.kind}`);
  revalidate(clientId);
  return { ok: true };
}

export async function editNode(
  clientId: string,
  nodeId: string,
  input: { label?: string; description?: string; giftLabel?: string },
): Promise<Res> {
  const me = await requirePractitioner();
  const node = await ownNode(nodeId, clientId);
  if (!node) return { ok: false, error: "not-found" };
  await prisma.psycheNode.update({
    where: { id: nodeId },
    data: {
      ...(input.label?.trim() ? { label: input.label.trim().slice(0, 120) } : {}),
      ...(input.description !== undefined
        ? { description: input.description.trim().slice(0, 1500) || null }
        : {}),
      ...(input.giftLabel !== undefined ? { giftLabel: input.giftLabel.trim().slice(0, 120) || null } : {}),
    },
  });
  await audit(clientId, me.id, "EDIT_NODE", `node=${nodeId}`);
  revalidate(clientId);
  return { ok: true };
}

// State transitions — declaring liberation is Valentina's clinical-judgment
// moment (§5). INTEGRATED takes a gift name; the label transmutes at read time.
// C12X §5 — her resonance mark on a node's interpretation. Append-only event;
// side effects (evidence on FEELS_TRUE, retirement on DOESNT_FIT/NO_LONGER)
// live in lib/resonance.
export async function markNodeResonance(
  clientId: string,
  nodeId: string,
  value: string,
): Promise<Res> {
  const me = await requirePractitioner();
  const node = await ownNode(nodeId, clientId);
  if (!node) return { ok: false, error: "not-found" };
  if (!isResonanceValue(value)) return { ok: false, error: "invalid" };
  await markResonance({
    clientId,
    subjectType: "NODE",
    subjectKey: nodeId,
    value,
    markedById: me.id,
    markedByRole: "PRACTITIONER",
  });
  await audit(clientId, me.id, "SET_STATE", `node=${nodeId} resonance=${value}`);
  revalidate(clientId);
  return { ok: true };
}

export async function setNodeState(
  clientId: string,
  nodeId: string,
  state: string,
  giftLabel?: string,
): Promise<Res> {
  const me = await requirePractitioner();
  const node = await ownNode(nodeId, clientId);
  if (!node) return { ok: false, error: "not-found" };
  if (!["ACTIVE", "LOOSENING", "INTEGRATED", "ARCHIVED"].includes(state)) return { ok: false, error: "invalid" };
  if (state === "INTEGRATED" && !(giftLabel?.trim() || node.giftLabel)) return { ok: false, error: "gift" };
  await prisma.psycheNode.update({
    where: { id: nodeId },
    data: {
      state: state as NodeState,
      ...(giftLabel?.trim() ? { giftLabel: giftLabel.trim().slice(0, 120) } : {}),
      suggestedState: null,
      suggestedReason: null,
    },
  });
  await audit(clientId, me.id, "SET_STATE", `node=${nodeId} state=${state}`);
  revalidate(clientId);
  return { ok: true };
}

export async function dismissSuggestion(clientId: string, nodeId: string): Promise<Res> {
  const me = await requirePractitioner();
  const node = await ownNode(nodeId, clientId);
  if (!node) return { ok: false, error: "not-found" };
  await prisma.psycheNode.update({
    where: { id: nodeId },
    data: { suggestedState: null, suggestedReason: null },
  });
  await audit(clientId, me.id, "SET_STATE", `node=${nodeId} suggestion-dismissed`);
  revalidate(clientId);
  return { ok: true };
}

// Merge: evidence unions into keep; edges re-point; merged node archives.
export async function mergeNodes(clientId: string, keepId: string, mergeId: string): Promise<Res> {
  const me = await requirePractitioner();
  if (keepId === mergeId) return { ok: false, error: "invalid" };
  const [keep, merge] = await Promise.all([ownNode(keepId, clientId), ownNode(mergeId, clientId)]);
  if (!keep || !merge) return { ok: false, error: "not-found" };

  const evidence = [...new Set([...keep.evidenceRecordItemIds, ...merge.evidenceRecordItemIds])];
  const edges = await prisma.psycheEdge.findMany({
    where: { clientId, OR: [{ fromId: mergeId }, { toId: mergeId }] },
  });
  await prisma.$transaction(async (tx) => {
    await tx.psycheNode.update({
      where: { id: keepId },
      data: { evidenceRecordItemIds: evidence, weight: massFromEvidence(evidence.length) },
    });
    for (const e of edges) {
      const fromId = e.fromId === mergeId ? keepId : e.fromId;
      const toId = e.toId === mergeId ? keepId : e.toId;
      if (fromId === toId) {
        await tx.psycheEdge.delete({ where: { id: e.id } });
        continue;
      }
      const clash = await tx.psycheEdge.findUnique({
        where: { fromId_toId_relation: { fromId, toId, relation: e.relation } },
      });
      if (clash && clash.id !== e.id) {
        await tx.psycheEdge.update({
          where: { id: clash.id },
          data: {
            evidenceRecordItemIds: [...new Set([...clash.evidenceRecordItemIds, ...e.evidenceRecordItemIds])],
          },
        });
        await tx.psycheEdge.delete({ where: { id: e.id } });
      } else {
        await tx.psycheEdge.update({ where: { id: e.id }, data: { fromId, toId } });
      }
    }
    await tx.psycheNode.update({ where: { id: mergeId }, data: { state: "ARCHIVED" } });
  });
  await audit(clientId, me.id, "MERGE", `keep=${keepId} merged=${mergeId}`);
  revalidate(clientId);
  return { ok: true };
}

export async function archiveNode(clientId: string, nodeId: string): Promise<Res> {
  const me = await requirePractitioner();
  const node = await ownNode(nodeId, clientId);
  if (!node) return { ok: false, error: "not-found" };
  await prisma.psycheNode.update({ where: { id: nodeId }, data: { state: "ARCHIVED" } });
  await audit(clientId, me.id, "ARCHIVE", `node=${nodeId}`);
  revalidate(clientId);
  return { ok: true };
}

export async function addEdge(
  clientId: string,
  fromId: string,
  toId: string,
  relation: string,
): Promise<Res> {
  const me = await requirePractitioner();
  if (fromId === toId) return { ok: false, error: "invalid" };
  if (!RELATIONS.includes(relation as (typeof RELATIONS)[number])) return { ok: false, error: "invalid" };
  const [a, b] = await Promise.all([ownNode(fromId, clientId), ownNode(toId, clientId)]);
  if (!a || !b) return { ok: false, error: "not-found" };
  await prisma.psycheEdge.upsert({
    where: { fromId_toId_relation: { fromId, toId, relation } },
    create: { clientId, fromId, toId, relation, evidenceRecordItemIds: [] },
    update: {},
  });
  await audit(clientId, me.id, "ADD_EDGE", `from=${fromId} to=${toId} rel=${relation}`);
  revalidate(clientId);
  return { ok: true };
}

export async function deleteEdge(clientId: string, edgeId: string): Promise<Res> {
  const me = await requirePractitioner();
  const edge = await prisma.psycheEdge.findFirst({ where: { id: edgeId, clientId } });
  if (!edge) return { ok: false, error: "not-found" };
  await prisma.psycheEdge.delete({ where: { id: edgeId } });
  await audit(clientId, me.id, "DELETE_EDGE", `edge=${edgeId}`);
  revalidate(clientId);
  return { ok: true };
}

// "Turn into…" — a node becomes a Margins note (C14), evidence links carried.
export async function nodeToNote(clientId: string, nodeId: string): Promise<Res> {
  const me = await requirePractitioner();
  const node = await ownNode(nodeId, clientId);
  if (!node) return { ok: false, error: "not-found" };
  await prisma.note.create({
    data: {
      authorId: me.id,
      clientId,
      depth: "JOT",
      title: node.label,
      body: node.description || `From the map: ${node.label}${node.giftLabel ? ` → ${node.giftLabel}` : ""}`,
      tags: [node.kind.toLowerCase()],
      linkedRecordItemIds: node.evidenceRecordItemIds.slice(0, 20),
    },
  });
  await audit(clientId, me.id, "TO_NOTE", `node=${nodeId}`);
  revalidate(clientId);
  return { ok: true };
}

// Her toggle: whether her private notes may serve as extraction CONTEXT
// (default off; flagged decision §11.1).
export async function setNotesSource(clientId: string, on: boolean): Promise<Res> {
  await requirePractitioner();
  await writePracticeSetting("psycheIncludeNotes", on ? "true" : "false");
  revalidate(clientId);
  return { ok: true };
}
