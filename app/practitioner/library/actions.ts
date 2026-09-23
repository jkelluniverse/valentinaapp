"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { PromptKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { PROMPT_KINDS } from "@/lib/prompt-meta";
import { draftLibraryItem } from "@/lib/library-author";
import { buildReferenceBlocks } from "@/lib/reference-input";

const LIBRARY = "/practitioner/library";

function parsePromptForm(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!title || !body) return { error: "A title and the text are both needed." as const };

  const rawKind = String(formData.get("kind") ?? "PROMPT");
  const kind: PromptKind = PROMPT_KINDS.some((k) => k.value === rawKind)
    ? (rawKind as PromptKind)
    : "PROMPT";

  return { data: { title, body, kind } };
}

export async function createPrompt(formData: FormData) {
  const practitioner = await requirePractitioner();

  const parsed = parsePromptForm(formData);
  if ("error" in parsed) redirect(`${LIBRARY}?error=missing`);

  const prompt = await prisma.prompt.create({
    data: { ...parsed.data, createdById: practitioner.id },
  });

  // Optional save-and-send: a clientId means "save it and send it now".
  const clientId = String(formData.get("clientId") ?? "");
  if (clientId) {
    const client = await prisma.user.findFirst({
      where: { id: clientId, role: "CLIENT" },
      select: { id: true },
    });
    if (client) {
      await prisma.assignment.create({
        data: { promptId: prompt.id, clientId: client.id, assignedById: practitioner.id },
      });
      revalidatePath(LIBRARY);
      redirect(`${LIBRARY}?sent=1`);
    }
  }

  revalidatePath(LIBRARY);
  redirect(`${LIBRARY}?saved=1`);
}

// Send an existing library item straight to a client (same manual-assignment
// path as the client-page form).
export async function sendPromptToClient(promptId: string, formData: FormData) {
  const practitioner = await requirePractitioner();

  const [prompt, client] = await Promise.all([
    prisma.prompt.findFirst({ where: { id: promptId, active: true }, select: { id: true } }),
    prisma.user.findFirst({
      where: { id: String(formData.get("clientId") ?? ""), role: "CLIENT" },
      select: { id: true },
    }),
  ]);
  if (!prompt || !client) redirect(`${LIBRARY}?error=send`);

  await prisma.assignment.create({
    data: { promptId: prompt.id, clientId: client.id, assignedById: practitioner.id },
  });

  revalidatePath(LIBRARY);
  redirect(`${LIBRARY}?sent=1`);
}

export async function updatePrompt(promptId: string, formData: FormData) {
  await requirePractitioner();

  const parsed = parsePromptForm(formData);
  if ("error" in parsed) redirect(`${LIBRARY}/${promptId}?error=missing`);

  await prisma.prompt.update({ where: { id: promptId }, data: parsed.data });

  revalidatePath(LIBRARY);
  redirect(`${LIBRARY}?saved=1`);
}

// Archive/restore — never delete, so past assignments keep their text.
export async function setPromptActive(promptId: string, active: boolean) {
  await requirePractitioner();

  await prisma.prompt.update({ where: { id: promptId }, data: { active } });
  revalidatePath(LIBRARY);
}

// Worksheets live in the same library home (C9): send + archive from here.
export async function sendWorksheetToClient(worksheetId: string, formData: FormData) {
  const practitioner = await requirePractitioner();

  const [worksheet, client] = await Promise.all([
    prisma.worksheet.findFirst({ where: { id: worksheetId, active: true }, select: { id: true } }),
    prisma.user.findFirst({
      where: { id: String(formData.get("clientId") ?? ""), role: "CLIENT" },
      select: { id: true },
    }),
  ]);
  if (!worksheet || !client) redirect(`${LIBRARY}?error=send`);

  await prisma.worksheetAssignment.create({
    data: { worksheetId: worksheet.id, clientId: client.id, assignedById: practitioner.id },
  });

  revalidatePath(LIBRARY);
  redirect(`${LIBRARY}?sent=1`);
}

export async function setWorksheetActiveInLibrary(worksheetId: string, active: boolean) {
  await requirePractitioner();
  await prisma.worksheet.update({ where: { id: worksheetId }, data: { active } });
  revalidatePath(LIBRARY);
  redirect(LIBRARY);
}

// C12: create the practice's values-spiral assessment — an original
// questionnaire seeded with scoreable statements (spiral:<stage>:<n> ids),
// then editable in the studio like any worksheet. One per practice.
export async function createSpiralAssessment() {
  const practitioner = await requirePractitioner();
  const { buildSpiralFields } = await import("@/lib/spiral");

  const existing = await prisma.worksheet.findFirst({ where: { isSpiral: true } });
  if (existing) redirect(`/practitioner/worksheets/${existing.id}`);

  const worksheet = await prisma.worksheet.create({
    data: {
      title: "Where your energy lives — a values snapshot",
      intro:
        "A short reflection on what's steering your life right now. Rate how true each statement feels these days — honestly, not aspirationally. There are no better or worse answers.",
      schema: buildSpiralFields() as unknown as object,
      isSpiral: true,
      createdById: practitioner.id,
      sourceNote: "Original practice assessment (C12 values spiral)",
    },
  });
  revalidatePath(LIBRARY);
  redirect(`/practitioner/worksheets/${worksheet.id}`);
}

// C11: designate one worksheet as the practice intake — auto-assigned to every
// new client on invite acceptance. Setting a new one clears the old.
export async function setIntakeWorksheet(worksheetId: string, on: boolean) {
  await requirePractitioner();
  await prisma.$transaction([
    prisma.worksheet.updateMany({ where: { isIntake: true }, data: { isIntake: false } }),
    ...(on
      ? [prisma.worksheet.update({ where: { id: worksheetId }, data: { isIntake: true } })]
      : []),
  ]);
  revalidatePath(LIBRARY);
  redirect(LIBRARY);
}

// AI drafting for prompts/exercises/check-ins: the draft is saved and opened
// in the editor to refine — same rhythm as the worksheet studio.
export async function draftPromptWithAi(formData: FormData) {
  const practitioner = await requirePractitioner();
  const description = String(formData.get("description") ?? "").trim();

  const reference = await buildReferenceBlocks(formData);
  if (!reference.ok) redirect(`${LIBRARY}/new?error=${reference.error}`);

  const result = await draftLibraryItem(description, reference.blocks);
  if (!result.ok) redirect(`${LIBRARY}/new?error=${result.error}`);

  const prompt = await prisma.prompt.create({
    data: {
      kind: result.kind,
      title: result.title,
      body: result.body,
      createdById: practitioner.id,
    },
  });

  revalidatePath(LIBRARY);
  redirect(`${LIBRARY}/${prompt.id}?drafted=1`);
}

// Hard deletes. Both clean up the record items their responses produced, so
// the C4 timeline never drifts (record items have no FK — convention only).
export async function deletePrompt(promptId: string) {
  await requirePractitioner();

  const responses = await prisma.promptResponse.findMany({
    where: { assignment: { promptId } },
    select: { id: true },
  });
  await prisma.$transaction([
    prisma.recordItem.deleteMany({
      where: { sourceType: "PromptResponse", sourceId: { in: responses.map((r) => r.id) } },
    }),
    prisma.prompt.delete({ where: { id: promptId } }), // cascades assignments + responses
  ]);

  revalidatePath(LIBRARY);
  redirect(`${LIBRARY}?deleted=1`);
}

export async function deleteWorksheetEverywhere(worksheetId: string) {
  await requirePractitioner();

  const responses = await prisma.worksheetResponse.findMany({
    where: { assignment: { worksheetId } },
    select: { id: true },
  });
  await prisma.$transaction([
    prisma.recordItem.deleteMany({
      where: { sourceType: "WorksheetResponse", sourceId: { in: responses.map((r) => r.id) } },
    }),
    prisma.worksheet.delete({ where: { id: worksheetId } }), // cascades assignments + responses
  ]);

  revalidatePath(LIBRARY);
  redirect(`${LIBRARY}?deleted=1`);
}
