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

  await prisma.prompt.create({
    data: { ...parsed.data, createdById: practitioner.id },
  });

  revalidatePath(LIBRARY);
  redirect(`${LIBRARY}?saved=1`);
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
