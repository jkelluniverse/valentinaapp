import type { Note } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// C14 — read helpers for The Margins. Every query is practitioner-scoped by
// construction (the caller is guarded); notes are never exposed to clients.

export const NOTE_SNIPPET = 200;

export function noteSnippet(n: Pick<Note, "title" | "body">): string {
  const base = n.title?.trim() || n.body.trim();
  return base.length > NOTE_SNIPPET ? `${base.slice(0, NOTE_SNIPPET).trimEnd()}…` : base;
}

// A client's notes, newest first (jots + notes interleaved), optional tag filter.
export function clientNotes(clientId: string, tag?: string) {
  return prisma.note.findMany({
    where: {
      clientId,
      status: { not: "ARCHIVED" },
      ...(tag ? { tags: { has: tag } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

// The unfiled notebook — free-floating ideas not yet about a person.
export function unfiledNotes(tag?: string) {
  return prisma.note.findMany({
    where: { clientId: null, status: { not: "ARCHIVED" }, ...(tag ? { tags: { has: tag } } : {}) },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
}

// Every note under a theme tag, across all clients + unfiled — how her thinking
// compounds into pattern.
export function notesByTag(tag: string) {
  return prisma.note.findMany({
    where: { tags: { has: tag }, status: { not: "ARCHIVED" } },
    orderBy: { createdAt: "desc" },
    take: 300,
  });
}

// Practitioner-only search over bodies + titles + tags. Never logged.
export function searchNotes(q: string) {
  const term = q.trim();
  if (!term) return Promise.resolve([] as Note[]);
  return prisma.note.findMany({
    where: {
      status: { not: "ARCHIVED" },
      OR: [
        { body: { contains: term, mode: "insensitive" } },
        { title: { contains: term, mode: "insensitive" } },
        { tags: { has: term } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

// Distinct tags across all notes, for the chip vocabulary.
export async function allNoteTags(): Promise<string[]> {
  const rows = await prisma.note.findMany({
    where: { status: { not: "ARCHIVED" } },
    select: { tags: true },
    take: 1000,
  });
  const counts = new Map<string, number>();
  for (const r of rows) for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

export function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 12);
}
