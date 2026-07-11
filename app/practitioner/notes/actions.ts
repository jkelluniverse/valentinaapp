"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { parseTags } from "@/lib/notes";
import { runNoteScan } from "@/lib/note-scan";
import { draftLibraryItem } from "@/lib/library-author";
import { draftWorksheet } from "@/lib/worksheet-author";

// C14 — The Margins. Practitioner-only; every action re-derives the author from
// the session. Note content is never logged and never touches the client
// record or any client-facing surface.

const NOTES = "/practitioner/notes";
const notePath = (id: string) => `${NOTES}/${id}`;
const portraitMargins = (clientId: string) => `/practitioner/clients/${clientId}?tab=margins`;

// The Jot — one line, saved instantly. Called from the client JotBox; returns
// without navigating so her flow isn't interrupted mid-session. The client
// comes from the binding (a Portrait's jot) or from the form (the notebook's
// optional "about" picker) — either way it's validated against the roster.
export async function createJot(clientId: string | null, formData: FormData): Promise<void> {
  const practitioner = await requirePractitioner();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;

  const requested = clientId ?? (String(formData.get("clientId") ?? "").trim() || null);
  let filedTo: string | null = null;
  if (requested) {
    const client = await prisma.user.findFirst({
      where: { id: requested, role: "CLIENT" },
      select: { id: true },
    });
    filedTo = client?.id ?? null;
  }

  await prisma.note.create({
    data: { authorId: practitioner.id, clientId: filedTo, depth: "JOT", body },
  });

  revalidatePath(NOTES);
  if (filedTo) revalidatePath(`/practitioner/clients/${filedTo}`);
}

// Autosave the fuller note (title/body/tags), on blur.
export async function saveNoteFields(noteId: string, formData: FormData): Promise<void> {
  await requirePractitioner();
  const note = await prisma.note.findUnique({ where: { id: noteId }, select: { id: true } });
  if (!note) return;

  const data: Record<string, unknown> = {};
  const title = formData.get("title");
  const body = formData.get("body");
  const tags = formData.get("tags");
  if (title != null) data.title = String(title).trim() || null;
  if (body != null) data.body = String(body);
  if (tags != null) data.tags = parseTags(String(tags));

  await prisma.note.update({ where: { id: noteId }, data });
  revalidatePath(notePath(noteId));
}

// Jot → Note: promote depth without moving anything, open the fuller page.
export async function expandNote(noteId: string) {
  await requirePractitioner();
  await prisma.note.update({ where: { id: noteId }, data: { depth: "NOTE" } });
  redirect(notePath(noteId));
}

// Note → deeper Note: a child pre-seeded with the parent's text to think against.
export async function elaborateNote(noteId: string) {
  const practitioner = await requirePractitioner();
  const parent = await prisma.note.findUnique({ where: { id: noteId } });
  if (!parent) redirect(NOTES);

  const seed = parent.body
    .split("\n")
    .map((l) => `> ${l}`)
    .join("\n");
  const child = await prisma.note.create({
    data: {
      authorId: practitioner.id,
      clientId: parent.clientId,
      depth: "NOTE",
      parentNoteId: parent.id,
      tags: parent.tags,
      body: `${seed}\n\n`,
    },
  });
  redirect(notePath(child.id));
}

export async function linkNoteSession(noteId: string, formData: FormData) {
  await requirePractitioner();
  const appointmentId = String(formData.get("appointmentId") ?? "").trim() || null;
  await prisma.note.update({ where: { id: noteId }, data: { appointmentId } });
  revalidatePath(notePath(noteId));
  redirect(notePath(noteId));
}

// Move an unfiled note to a client (files a free-floating idea).
export async function fileNoteToClient(noteId: string, formData: FormData) {
  await requirePractitioner();
  const clientId = String(formData.get("clientId") ?? "").trim();
  const client = clientId
    ? await prisma.user.findFirst({ where: { id: clientId, role: "CLIENT" }, select: { id: true } })
    : null;
  await prisma.note.update({ where: { id: noteId }, data: { clientId: client?.id ?? null } });
  revalidatePath(notePath(noteId));
  redirect(notePath(noteId));
}

export async function archiveNote(noteId: string) {
  await requirePractitioner();
  const note = await prisma.note.update({
    where: { id: noteId },
    data: { status: "ARCHIVED" },
    select: { clientId: true },
  });
  revalidatePath(NOTES);
  redirect(note.clientId ? portraitMargins(note.clientId) : NOTES);
}

// Append a scan suggestion into the note body — one tap from hypothesis to text.
export async function appendToNote(noteId: string, formData: FormData) {
  await requirePractitioner();
  const text = String(formData.get("text") ?? "").trim();
  if (!text) redirect(notePath(noteId));
  const note = await prisma.note.findUnique({ where: { id: noteId }, select: { body: true } });
  if (!note) redirect(NOTES);
  await prisma.note.update({
    where: { id: noteId },
    data: { body: `${note.body.trimEnd()}\n\n— ${text}`, depth: "NOTE" },
  });
  revalidatePath(notePath(noteId));
  redirect(notePath(noteId));
}

// The AI connection-scan (on-tap).
export async function scanNote(noteId: string) {
  const practitioner = await requirePractitioner();
  const result = await runNoteScan(noteId, practitioner.id);
  revalidatePath(notePath(noteId));
  redirect(result.ok ? `${notePath(noteId)}?scanned=1` : `${notePath(noteId)}?error=${result.error}`);
}

// ---- Note → Assignment (§7): draft, review on the note page, then assign. ----

export async function draftPromptFromNote(noteId: string) {
  const practitioner = await requirePractitioner();
  const note = await prisma.note.findUnique({ where: { id: noteId } });
  if (!note?.clientId) redirect(`${notePath(noteId)}?error=needsclient`);

  const seed = [note.title, note.body].filter(Boolean).join("\n\n");
  const draft = await draftLibraryItem(seed, []);
  if (!draft.ok) redirect(`${notePath(noteId)}?error=${draft.error}`);

  const prompt = await prisma.prompt.create({
    data: { kind: draft.kind, title: draft.title, body: draft.body, createdById: practitioner.id },
  });
  revalidatePath(notePath(noteId));
  redirect(`${notePath(noteId)}?drafted=prompt&itemId=${prompt.id}`);
}

export async function assignPromptFromNote(noteId: string, promptId: string) {
  const practitioner = await requirePractitioner();
  const note = await prisma.note.findUnique({ where: { id: noteId } });
  if (!note?.clientId) redirect(`${notePath(noteId)}?error=needsclient`);
  const prompt = await prisma.prompt.findFirst({ where: { id: promptId }, select: { id: true } });
  if (!prompt) redirect(`${notePath(noteId)}?error=api`);

  await prisma.$transaction([
    prisma.assignment.create({
      data: {
        promptId: prompt.id,
        clientId: note.clientId,
        assignedById: practitioner.id,
        fromNoteId: note.id,
      },
    }),
    prisma.note.update({ where: { id: note.id }, data: { status: "ELABORATED" } }),
  ]);
  revalidatePath(notePath(noteId));
  redirect(`${notePath(noteId)}?assigned=1`);
}

export async function draftWorksheetFromNote(noteId: string) {
  const practitioner = await requirePractitioner();
  const note = await prisma.note.findUnique({ where: { id: noteId } });
  if (!note?.clientId) redirect(`${notePath(noteId)}?error=needsclient`);

  const seed = [note.title, note.body].filter(Boolean).join("\n\n");
  const draft = await draftWorksheet(seed, []);
  if (!draft.ok) redirect(`${notePath(noteId)}?error=${draft.error}`);

  const worksheet = await prisma.worksheet.create({
    data: {
      title: draft.title,
      intro: draft.intro,
      schema: draft.fields as unknown as object,
      createdById: practitioner.id,
      sourceNote: "Drafted from a practitioner note (C14)",
    },
  });
  revalidatePath(notePath(noteId));
  redirect(`${notePath(noteId)}?drafted=worksheet&itemId=${worksheet.id}`);
}

export async function assignWorksheetFromNote(noteId: string, worksheetId: string) {
  const practitioner = await requirePractitioner();
  const note = await prisma.note.findUnique({ where: { id: noteId } });
  if (!note?.clientId) redirect(`${notePath(noteId)}?error=needsclient`);
  const worksheet = await prisma.worksheet.findFirst({ where: { id: worksheetId }, select: { id: true } });
  if (!worksheet) redirect(`${notePath(noteId)}?error=api`);

  await prisma.$transaction([
    prisma.worksheetAssignment.create({
      data: {
        worksheetId: worksheet.id,
        clientId: note.clientId,
        assignedById: practitioner.id,
        fromNoteId: note.id,
      },
    }),
    prisma.note.update({ where: { id: note.id }, data: { status: "ELABORATED" } }),
  ]);
  revalidatePath(notePath(noteId));
  redirect(`${notePath(noteId)}?assigned=1`);
}
