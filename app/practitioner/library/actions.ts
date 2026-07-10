"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { PromptKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { PROMPT_KINDS } from "@/lib/prompt-meta";

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
