"use server";

import { revalidatePath } from "next/cache";
import type { NodeKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth-guards";
import { hasConsent } from "@/lib/consent";
import { isCrisisSignal } from "@/lib/message-safety";
import { record, snapshot } from "@/lib/record";
import { massFromEvidence } from "@/lib/psyche";

// C16.5 — "Your First Map" actions. The client's own naming of their inner
// landscape: each star becomes a SELF_REPORTED node (gold-ringed in the
// practitioner constellation) plus a record item (C4) — so their own words are
// the evidence. Star content is never logged. The crisis net is live.

const PROMPT_KINDS: Record<string, NodeKind> = {
  knock: "PATTERN",
  protect: "PROTECTION",
  belief: "CORE_BELIEF",
  origin: "WOUND",
  strength: "RESOURCE",
};

const PATH = "/space/first-map";

export async function addStar(
  promptKey: string,
  text: string,
): Promise<{ ok: boolean; id?: string; crisis?: boolean; error?: string }> {
  const user = await requireClient();
  if (!(await hasConsent(user.id))) return { ok: false, error: "consent" };
  const kind = PROMPT_KINDS[promptKey] ?? "PATTERN";
  const body = text.trim();
  if (!body) return { ok: false, error: "empty" };

  // The crisis net (C15's screen) is live throughout the exercise.
  const crisis = isCrisisSignal(body);

  const label = body.length > 90 ? `${body.slice(0, 90).trimEnd()}…` : body;
  const node = await prisma.psycheNode.create({
    data: {
      clientId: user.id,
      kind,
      label,
      description: body.length > 90 ? body.slice(0, 1500) : null,
      source: "SELF_REPORTED",
      promptKey,
      // scattered start; they place it themselves next
      selfX: 0.2 + Math.random() * 0.6,
      selfY: 0.2 + Math.random() * 0.6,
    },
  });

  // Their words feed the record (C4) — and become the node's evidence.
  await record.append({
    clientId: user.id,
    kind: "NOTE",
    occurredAt: new Date(),
    title: crisis ? "First Map — reached out with something heavy" : "First Map",
    summary: snapshot(body),
    tags: ["first-map", kind.toLowerCase().replace(/_/g, " ")],
    sourceType: "PsycheNode",
    sourceId: node.id,
  });
  const item = await prisma.recordItem.findUnique({
    where: { sourceType_sourceId: { sourceType: "PsycheNode", sourceId: node.id } },
    select: { id: true },
  });
  if (item) {
    await prisma.psycheNode.update({
      where: { id: node.id },
      data: { evidenceRecordItemIds: [item.id], weight: massFromEvidence(1) },
    });
  }

  revalidatePath(PATH);
  return { ok: true, id: node.id, crisis };
}

export async function placeStar(nodeId: string, x: number, y: number): Promise<{ ok: boolean }> {
  const user = await requireClient();
  // Scoped hard: only their OWN self-reported stars — never the AI map.
  const node = await prisma.psycheNode.findFirst({
    where: { id: nodeId, clientId: user.id, source: "SELF_REPORTED" },
    select: { id: true },
  });
  if (!node) return { ok: false };
  await prisma.psycheNode.update({
    where: { id: nodeId },
    data: { selfX: Math.min(1, Math.max(0, x)), selfY: Math.min(1, Math.max(0, y)) },
  });
  return { ok: true };
}

// The client draws a connection between two of their OWN stars — their own
// awareness, rendered gold. Stored as a CONNECTED edge (normalized so A–B and
// B–A are the same line); it surfaces on Valentina's constellation too.
export async function connectStars(
  aId: string,
  bId: string,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const user = await requireClient();
  if (aId === bId) return { ok: false, error: "same" };
  const both = await prisma.psycheNode.findMany({
    where: { id: { in: [aId, bId] }, clientId: user.id, source: "SELF_REPORTED", state: { not: "ARCHIVED" } },
    select: { id: true },
  });
  if (both.length !== 2) return { ok: false, error: "not-found" };
  // Normalize order so the pair is one edge regardless of tap order.
  const [fromId, toId] = [aId, bId].sort();
  const edge = await prisma.psycheEdge.upsert({
    where: { fromId_toId_relation: { fromId, toId, relation: "CONNECTED" } },
    create: { clientId: user.id, fromId, toId, relation: "CONNECTED", evidenceRecordItemIds: [] },
    update: {},
    select: { id: true },
  });
  revalidatePath(PATH);
  return { ok: true, id: edge.id };
}

export async function disconnectStars(edgeId: string): Promise<{ ok: boolean }> {
  const user = await requireClient();
  // Only the client's OWN hand-drawn connections — never a practitioner/AI edge.
  const edge = await prisma.psycheEdge.findFirst({
    where: { id: edgeId, clientId: user.id, relation: "CONNECTED" },
    select: { id: true },
  });
  if (!edge) return { ok: false };
  await prisma.psycheEdge.delete({ where: { id: edge.id } });
  revalidatePath(PATH);
  return { ok: true };
}

export async function finishFirstMap(skippedKeys: string[]): Promise<{ ok: boolean }> {
  const user = await requireClient();
  const skipped = skippedKeys.filter((k) => k in PROMPT_KINDS);
  await prisma.clientProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, firstMapCompletedAt: new Date() },
    update: { firstMapCompletedAt: new Date() },
  });
  // Skips are themselves signal — recorded as words, never pressure.
  await record.append({
    clientId: user.id,
    kind: "NOTE",
    occurredAt: new Date(),
    title: "First Map completed",
    summary:
      skipped.length === 0
        ? "Named something for every prompt."
        : `Left ${skipped.length} prompt${skipped.length === 1 ? "" : "s"} for later (${skipped.join(", ")}) — not yet ready, and that's honored.`,
    tags: ["first-map"],
    sourceType: "FirstMap",
    sourceId: user.id,
  });
  revalidatePath(PATH);
  revalidatePath("/space");
  return { ok: true };
}
