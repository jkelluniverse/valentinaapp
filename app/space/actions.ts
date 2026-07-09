"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { EntryType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth-guards";
import { ENTRY_TYPES } from "@/lib/entry-meta";

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

  // Consent gate (spec §7): no recorded consent, no entries.
  if (!user.consentAt) redirect("/space?error=consent");

  const parsed = parseEntryForm(formData);
  if ("error" in parsed) redirect("/space/new?error=empty");

  await prisma.logEntry.create({
    data: { ...parsed.data, clientId: user.id },
  });

  revalidatePath(SPACE);
  redirect("/space?saved=1");
}

export async function updateEntry(entryId: string, formData: FormData) {
  const user = await requireClient();

  const parsed = parseEntryForm(formData);
  if ("error" in parsed) redirect(`/space/entries/${entryId}/edit?error=empty`);

  // Scoped update: silently affects nothing unless the entry is the user's own.
  const result = await prisma.logEntry.updateMany({
    where: { id: entryId, clientId: user.id },
    data: parsed.data,
  });
  if (result.count === 0) redirect(SPACE);

  revalidatePath(SPACE);
  redirect(`/space/entries/${entryId}?saved=1`);
}

export async function deleteEntry(entryId: string) {
  const user = await requireClient();

  await prisma.logEntry.deleteMany({
    where: { id: entryId, clientId: user.id },
  });

  revalidatePath(SPACE);
  redirect("/space?deleted=1");
}
