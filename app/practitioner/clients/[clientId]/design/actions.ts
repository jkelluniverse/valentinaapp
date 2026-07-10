"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { METHOD_SETTING_KEY, runIntegrativeSynthesis } from "@/lib/integrative";
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
