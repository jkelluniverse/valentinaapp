"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { getPractitioner, getOrCreateConfig } from "@/lib/schedule";

// AMD-05 — practitioner settings actions. Metadata-only logs.

const PATH = "/practitioner/settings";

export async function savePractitionerLocale(formData: FormData) {
  const user = await requirePractitioner();
  const locale = String(formData.get("locale") ?? "") === "es" ? "es" : "en";
  await prisma.user.update({ where: { id: user.id }, data: { locale } });
  console.info(`[settings] locale updated user=${user.id}`);
  revalidatePath("/", "layout");
  redirect(`${PATH}?saved=language`);
}

// C10-POLICY — the session-change policy knobs: the free/fee boundary, the fee
// itself (entered in dollars, stored in cents), and whether it applies
// automatically or prompts her each time.
export async function savePolicy(formData: FormData) {
  const user = await requirePractitioner();
  const practitioner = await getPractitioner();
  if (!practitioner) redirect(PATH);

  const cutoffRaw = Number(formData.get("cancelCutoffHours"));
  const feeRaw = Number(formData.get("lateFee"));
  if (!Number.isFinite(cutoffRaw) || !Number.isFinite(feeRaw)) {
    redirect(`${PATH}?error=policy`);
  }
  const cancelCutoffHours = Math.min(336, Math.max(0, Math.round(cutoffRaw)));
  const lateFeeCents = Math.min(100_000_00, Math.max(0, Math.round(feeRaw * 100)));
  const lateFeeAutoApply = formData.get("lateFeeAutoApply") === "on";

  await getOrCreateConfig(practitioner.id);
  await prisma.schedulingConfig.update({
    where: { practitionerId: practitioner.id },
    data: { cancelCutoffHours, lateFeeCents, lateFeeAutoApply },
  });
  console.info(`[settings] session policy updated by=${user.id}`);
  revalidatePath(PATH);
  redirect(`${PATH}?saved=policy`);
}

// AMD-05 B3 — deletion requests are handled attributably: who moved it, when.
export async function setDeletionStatus(
  id: string,
  status: "ACKNOWLEDGED" | "CLOSED",
  _formData: FormData,
) {
  const user = await requirePractitioner();
  if (status !== "ACKNOWLEDGED" && status !== "CLOSED") redirect(PATH);
  await prisma.deletionRequest.update({
    where: { id },
    data: { status, handledById: user.id, handledAt: new Date() },
  });
  console.info(`[settings] deletion request ${id} → ${status} by=${user.id}`);
  revalidatePath(PATH);
  redirect(`${PATH}?saved=deletion`);
}
