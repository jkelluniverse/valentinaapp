"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { writePracticeSetting } from "@/lib/practice-settings";
import { requirePractitioner } from "@/lib/auth-guards";
import { aggregatePatterns, PATTERN_LIBRARY_KEY } from "@/lib/pattern-library";

const PATH = "/practitioner/patterns";

export async function setLibraryEnabled(on: boolean) {
  await requirePractitioner();
  await writePracticeSetting(PATTERN_LIBRARY_KEY, on ? "true" : "false");
  revalidatePath(PATH);
  redirect(PATH);
}

export async function runAggregation() {
  await requirePractitioner();
  const res = await aggregatePatterns();
  revalidatePath(PATH);
  redirect(res.ok ? `${PATH}?ran=1` : `${PATH}?error=disabled`);
}

// The ontology is HER clinical vocabulary — she owns and refines it.
export async function saveDefinition(archetypeId: string, formData: FormData) {
  await requirePractitioner();
  const definition = String(formData.get("definition") ?? "").trim();
  const label = String(formData.get("label") ?? "").trim();
  await prisma.patternArchetype.update({
    where: { id: archetypeId },
    data: { definition, ...(label ? { label } : {}) },
  });
  revalidatePath(PATH);
  redirect(`${PATH}?saved=1`);
}
