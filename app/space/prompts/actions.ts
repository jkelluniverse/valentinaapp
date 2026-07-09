"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth-guards";

// Ownership is re-derived from the session on every action; an assignment id
// that isn't the client's own behaves like a missing one. Response content is
// never logged (spec §7).

export async function respondToAssignment(assignmentId: string, formData: FormData) {
  const user = await requireClient();

  // Consent gate from C1 applies to responses too.
  if (!user.consentAt) redirect("/space?error=consent");

  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId, clientId: user.id, status: "PENDING" },
    include: { prompt: { select: { kind: true } } },
  });
  if (!assignment) redirect("/space");

  const body = String(formData.get("body") ?? "").trim() || null;
  const rawMood = String(formData.get("mood") ?? "");
  const mood = /^[1-5]$/.test(rawMood) ? Number(rawMood) : null;

  // A check-in can be just a mood; anything else needs at least a few words.
  const enough = assignment.prompt.kind === "CHECK_IN" ? mood !== null || body : body;
  if (!enough) redirect(`/space/prompts/${assignmentId}?error=empty`);

  await prisma.$transaction([
    prisma.promptResponse.create({
      data: { assignmentId: assignment.id, body, mood },
    }),
    prisma.assignment.update({
      where: { id: assignment.id },
      data: { status: "COMPLETED" },
    }),
  ]);

  revalidatePath("/space");
  redirect("/space?responded=1");
}

export async function dismissAssignment(assignmentId: string) {
  const user = await requireClient();

  await prisma.assignment.updateMany({
    where: { id: assignmentId, clientId: user.id, status: "PENDING" },
    data: { status: "DISMISSED" },
  });

  revalidatePath("/space");
  redirect("/space");
}
