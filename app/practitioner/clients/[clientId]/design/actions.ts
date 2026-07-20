"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { METHOD_SETTING_KEY, runIntegrativeSynthesis } from "@/lib/integrative";
import { ensureReading, READING_HOLD_KEY } from "@/lib/integrative-reading";
import { STAGES } from "@/lib/spiral";

const page = (clientId: string) => `/practitioner/clients/${clientId}/design`;

// Her integration method — practice-wide, elicited here (never invented).
export async function saveMethodText(clientId: string, formData: FormData) {
  await requirePractitioner();
  const value = String(formData.get("method") ?? "").trim();
  if (value) {
    await prisma.practiceSetting.upsert({
      where: { key: METHOD_SETTING_KEY },
      create: { key: METHOD_SETTING_KEY, value },
      update: { value },
    });
  } else {
    await prisma.practiceSetting.deleteMany({ where: { key: METHOD_SETTING_KEY } });
  }
  revalidatePath(page(clientId));
  redirect(`${page(clientId)}?saved=method`);
}

// Sign off the client's values-spiral result — optionally overriding the
// center of gravity — before it can enter the synthesis (spec §5c).
export async function reviewSpiralLens(clientId: string, formData: FormData) {
  await requirePractitioner();
  const lens = await prisma.lensResult.findUnique({
    where: { userId_lens: { userId: clientId, lens: "SPIRAL" } },
  });
  if (!lens) redirect(page(clientId));

  const override = String(formData.get("centerOverride") ?? "");
  const valid = STAGES.some((s) => s.key === override);
  const result = {
    ...(lens.result as object),
    ...(valid ? { practitionerCenter: override } : {}),
  };
  await prisma.lensResult.update({
    where: { id: lens.id },
    data: { result, practitionerReviewed: true },
  });
  revalidatePath(page(clientId));
  redirect(`${page(clientId)}?saved=spiral`);
}

export async function draftSynthesis(clientId: string) {
  const practitioner = await requirePractitioner();
  const result = await runIntegrativeSynthesis(clientId, practitioner.id);
  revalidatePath(page(clientId));
  redirect(result.ok ? `${page(clientId)}?saved=synthesis` : `${page(clientId)}?error=${result.error}`);
}

// ---- C12r: the client-facing reading (practitioner control) ----

// Generate or refresh a client's reading (force = ignore the input hash).
export async function regenerateReading(clientId: string) {
  await requirePractitioner();
  const result = await ensureReading(clientId, { force: true });
  revalidatePath(page(clientId));
  redirect(result.ok ? `${page(clientId)}?saved=reading` : `${page(clientId)}?error=${result.error}`);
}

// Lightly edit the reading in her voice (and publish it if it was held).
export async function saveReadingEdit(clientId: string, formData: FormData) {
  await requirePractitioner();
  const content = String(formData.get("content") ?? "").trim();
  if (!content) redirect(`${page(clientId)}?error=empty`);
  await prisma.integrativeReading.updateMany({
    where: { userId: clientId },
    // Her essay edit becomes the reading; the structured blocks are cleared so
    // the client never sees generated blocks that diverge from her words.
    data: { content, structured: Prisma.DbNull, editedByPractitioner: true, status: "PUBLISHED" },
  });
  revalidatePath(page(clientId));
  redirect(`${page(clientId)}?saved=reading`);
}

// Approve a held reading so the client can see it.
export async function approveReading(clientId: string) {
  await requirePractitioner();
  await prisma.integrativeReading.updateMany({
    where: { userId: clientId, status: "PENDING_REVIEW" },
    data: { status: "PUBLISHED" },
  });
  revalidatePath(page(clientId));
  redirect(`${page(clientId)}?saved=reading`);
}

// Practice-wide: hold new readings for her review before clients see them.
export async function setReadingHold(clientId: string, on: boolean) {
  await requirePractitioner();
  if (on) {
    await prisma.practiceSetting.upsert({
      where: { key: READING_HOLD_KEY },
      create: { key: READING_HOLD_KEY, value: "1" },
      update: { value: "1" },
    });
  } else {
    await prisma.practiceSetting.deleteMany({ where: { key: READING_HOLD_KEY } });
  }
  revalidatePath(page(clientId));
  redirect(`${page(clientId)}?saved=reading`);
}
