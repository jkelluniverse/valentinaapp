"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { runSessionPrep } from "@/lib/session-prep";

export async function runPrep(clientId: string) {
  const practitioner = await requirePractitioner();
  const base = `/practitioner/clients/${clientId}/prep`;

  const result = await runSessionPrep(clientId, practitioner.id);

  revalidatePath(base);
  if (result.ok) redirect(`${base}?done=1`);
  redirect(`${base}?error=${result.error}`);
}

export async function savePrepNotes(prepId: string, formData: FormData) {
  await requirePractitioner();

  const notes = String(formData.get("notes") ?? "").trim() || null;
  const prep = await prisma.sessionPrep.update({
    where: { id: prepId },
    data: { practitionerNotes: notes },
    select: { clientId: true },
  });

  const base = `/practitioner/clients/${prep.clientId}/prep`;
  revalidatePath(base);
  redirect(`${base}?prep=${prepId}&saved=1`);
}
