"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth-guards";
import { hasConsent } from "@/lib/consent";
import { record, promptResponseToRecord } from "@/lib/record";

// Ownership is re-derived from the session on every action; an assignment id
// that isn't the client's own behaves like a missing one. Response content is
// never logged (spec §7).

export async function respondToAssignment(assignmentId: string, formData: FormData) {
  const user = await requireClient();

  // Unified consent (AMENDMENT-01) applies to responses too.
  if (!(await hasConsent(user.id))) redirect("/space/consent");

  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId, clientId: user.id, status: "PENDING" },
    include: { prompt: { select: { kind: true, title: true } } },
  });
  if (!assignment) redirect("/space");

  const body = String(formData.get("body") ?? "").trim() || null;
  const rawMood = String(formData.get("mood") ?? "");
  const mood = /^[1-5]$/.test(rawMood) ? Number(rawMood) : null;

  // A check-in can be just a mood; anything else needs at least a few words.
  const enough = assignment.prompt.kind === "CHECK_IN" ? mood !== null || body : body;
  if (!enough) redirect(`/space/prompts/${assignmentId}?error=empty`);

  // Response + status + record item land together (C4: single write path).
  await prisma.$transaction(async (tx) => {
    const response = await tx.promptResponse.create({
      data: { assignmentId: assignment.id, body, mood },
    });
    await tx.assignment.update({
      where: { id: assignment.id },
      data: { status: "COMPLETED" },
    });
    await record.append(
      promptResponseToRecord({
        responseId: response.id,
        clientId: user.id,
        promptTitle: assignment.prompt.title,
        completedAt: response.completedAt,
        body: response.body,
        mood: response.mood,
      }),
      tx,
    );
  });

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
