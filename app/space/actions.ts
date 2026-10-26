"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { EntryType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth-guards";
import { hasConsent } from "@/lib/consent";
import { ENTRY_TYPES } from "@/lib/entry-meta";
import { record, logEntryToRecord, snapshot } from "@/lib/record";
import { runDeepening, SELF_MAP_DOORS, type DoorOffer } from "@/lib/deepening";
import { massFromEvidence } from "@/lib/psyche";

// Every action here re-derives the owner from the session. The client id is
// NEVER accepted from the request; entry lookups are always scoped to it, so
// probing another client's entry id behaves exactly like a missing entry.
// Entry content must never be logged (spec §7).

const SPACE = "/space";

function parseEntryForm(formData: FormData) {
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: "Write a little something first." as const };

  const rawType = String(formData.get("type") ?? "REFLECTION");
  const type: EntryType = ENTRY_TYPES.some((t) => t.value === rawType)
    ? (rawType as EntryType)
    : "REFLECTION";

  const rawMood = String(formData.get("mood") ?? "");
  const mood = /^[1-5]$/.test(rawMood) ? Number(rawMood) : null;

  const trigger = String(formData.get("trigger") ?? "").trim() || null;

  const tags = String(formData.get("tags") ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);

  // Empty = "just now". datetime-local values parse in server time; close
  // enough for v1 backdating.
  const rawWhen = String(formData.get("occurredAt") ?? "").trim();
  const parsedWhen = rawWhen ? new Date(rawWhen) : null;
  const occurredAt = parsedWhen && !isNaN(parsedWhen.getTime()) ? parsedWhen : undefined;

  return { data: { body, type, mood, trigger, tags, occurredAt } };
}

export async function createEntry(formData: FormData) {
  const user = await requireClient();

  // Consent gate (AMENDMENT-01): the one unified consent, no entries without it.
  if (!(await hasConsent(user.id))) redirect("/space/consent");

  const parsed = parseEntryForm(formData);
  if ("error" in parsed) redirect("/space/new?error=empty");

  // Source row + record item land together (C4: single write path).
  await prisma.$transaction(async (tx) => {
    const entry = await tx.logEntry.create({
      data: { ...parsed.data, clientId: user.id },
    });
    await record.append(logEntryToRecord(entry), tx);
  });

  revalidatePath(SPACE);
  redirect("/space?saved=1");
}

// C17 — keep a reflection, then run the Deepening pass. Unlike createEntry this
// returns (rather than redirects) so the client can be offered ONE gentle door
// AFTER closure. Safety runs first inside runDeepening.
export async function keepReflection(
  formData: FormData,
): Promise<{ ok: boolean; entryId?: string; deepening?: DoorOffer; error?: string }> {
  const user = await requireClient();
  if (!(await hasConsent(user.id))) return { ok: false, error: "consent" };

  const parsed = parseEntryForm(formData);
  if ("error" in parsed) return { ok: false, error: "empty" };

  const entry = await prisma.$transaction(async (tx) => {
    const e = await tx.logEntry.create({ data: { ...parsed.data, clientId: user.id } });
    await record.append(logEntryToRecord(e), tx);
    return e;
  });

  revalidatePath(SPACE);
  const deepening = await runDeepening(entry.id, user.id);
  return { ok: true, entryId: entry.id, deepening };
}

// Walk through a door: the answer attaches to the entry, feeds the record
// (→ C16 extraction), and — for doors that name a piece of the inner landscape
// — becomes a SELF_REPORTED star on the client's own map (C16.5).
export async function answerDoor(
  deepeningId: string,
  text: string,
): Promise<{ ok: boolean; nodeId?: string }> {
  const user = await requireClient();
  const body = text.trim();
  if (!body) return { ok: false };
  const d = await prisma.entryDeepening.findFirst({
    where: { id: deepeningId, clientId: user.id },
  });
  if (!d || d.answer) return { ok: false };

  // The answer becomes a record item (evidence for the map).
  await record.append({
    clientId: user.id,
    kind: "NOTE",
    occurredAt: new Date(),
    title: `Went a little further — ${d.door ?? "a reflection"}`,
    summary: snapshot(body),
    tags: ["deepening", d.door ?? "reflection"],
    sourceType: "EntryDeepening",
    sourceId: d.id,
  });
  const item = await prisma.recordItem.findUnique({
    where: { sourceType_sourceId: { sourceType: "EntryDeepening", sourceId: d.id } },
    select: { id: true },
  });

  // A star on their own map for the naming doors (their words = the evidence).
  let nodeId: string | undefined;
  const kind = d.door ? SELF_MAP_DOORS[d.door] : undefined;
  if (kind && item) {
    const label = body.length > 90 ? `${body.slice(0, 90).trimEnd()}…` : body;
    const node = await prisma.psycheNode.create({
      data: {
        clientId: user.id,
        kind: kind as never,
        label,
        description: body.length > 90 ? body.slice(0, 1500) : null,
        source: "SELF_REPORTED",
        promptKey: d.door,
        evidenceRecordItemIds: [item.id],
        weight: massFromEvidence(1),
        selfX: 0.2 + Math.random() * 0.6,
        selfY: 0.2 + Math.random() * 0.6,
      },
    });
    nodeId = node.id;
  }

  await prisma.entryDeepening.update({
    where: { id: d.id },
    data: { answer: body, answeredAt: new Date(), answeredNodeId: nodeId ?? null },
  });
  revalidatePath(SPACE);
  return { ok: true, nodeId };
}

// A skip is a first-class answer and is itself signal — recorded, never nagged.
export async function dismissDoor(deepeningId: string): Promise<{ ok: boolean }> {
  const user = await requireClient();
  await prisma.entryDeepening.updateMany({
    where: { id: deepeningId, clientId: user.id, answer: null },
    data: { dismissed: true },
  });
  return { ok: true };
}

export async function updateEntry(entryId: string, formData: FormData) {
  const user = await requireClient();

  const parsed = parseEntryForm(formData);
  if ("error" in parsed) redirect(`/space/entries/${entryId}/edit?error=empty`);

  // Ownership check first; then source row + record item update in lock-step.
  const existing = await prisma.logEntry.findFirst({
    where: { id: entryId, clientId: user.id },
    select: { id: true },
  });
  if (!existing) redirect(SPACE);

  await prisma.$transaction(async (tx) => {
    const entry = await tx.logEntry.update({
      where: { id: entryId },
      data: parsed.data,
    });
    await record.append(logEntryToRecord(entry), tx); // upsert = create-or-refresh
  });

  revalidatePath(SPACE);
  redirect(`/space/entries/${entryId}?saved=1`);
}

export async function deleteEntry(entryId: string) {
  const user = await requireClient();

  const existing = await prisma.logEntry.findFirst({
    where: { id: entryId, clientId: user.id },
    select: { id: true },
  });
  if (!existing) redirect(SPACE);

  await prisma.$transaction(async (tx) => {
    await tx.logEntry.delete({ where: { id: entryId } });
    await record.remove("LogEntry", entryId, tx);
  });

  revalidatePath(SPACE);
  redirect("/space?deleted=1");
}
