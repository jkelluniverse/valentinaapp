"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth-guards";
import { record, snapshot } from "@/lib/record";
import { parseFields, answerableFields, answersDigest, type WorksheetAnswers } from "@/lib/worksheet-meta";

// Ownership re-derived from the session on every write; answers content never
// hits logs. Consent gate (C1) applies before a client can submit.

export async function submitWorksheet(assignmentId: string, formData: FormData) {
  const user = await requireClient();
  if (!user.consentAt) redirect("/space?error=consent");

  const assignment = await prisma.worksheetAssignment.findFirst({
    where: { id: assignmentId, clientId: user.id, status: "PENDING" },
    include: { worksheet: true },
  });
  if (!assignment) redirect("/space");

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("answers") ?? "{}"));
  } catch {
    raw = {};
  }
  const fields = parseFields(assignment.worksheet.schema);
  const fieldIds = new Set(answerableFields(fields).map((f) => f.id));

  // Keep only answers keyed to real fields, with sane value shapes.
  const answers: WorksheetAnswers = {};
  if (raw && typeof raw === "object") {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!fieldIds.has(k)) continue;
      if (
        typeof v === "string" ||
        typeof v === "boolean" ||
        (typeof v === "number" && v >= 1 && v <= 5) ||
        (Array.isArray(v) && v.every((x) => typeof x === "string"))
      ) {
        answers[k] = v as WorksheetAnswers[string];
      }
    }
  }

  const back = `/space/worksheets/${assignmentId}`;
  // Server-side required check (the form is a convenience, not the boundary).
  for (const f of answerableFields(fields)) {
    if (!f.required) continue;
    const v = answers[f.id];
    if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) {
      redirect(`${back}?error=required`);
    }
  }
  const anyAnswer = Object.values(answers).some(
    (v) => v !== "" && !(Array.isArray(v) && v.length === 0),
  );
  if (!anyAnswer) redirect(`${back}?error=required`);

  await prisma.$transaction(async (tx) => {
    const response = await tx.worksheetResponse.create({
      data: { assignmentId: assignment.id, answers },
    });
    await tx.worksheetAssignment.update({
      where: { id: assignment.id },
      data: { status: "COMPLETED" },
    });
    // Feed the unified record (C4) with a short digest snapshot.
    await record.append(
      {
        clientId: user.id,
        kind: "WORKSHEET_RESPONSE",
        occurredAt: response.completedAt,
        title: assignment.worksheet.title,
        summary: snapshot(answersDigest(fields, answers)) ?? "Completed a worksheet",
        tags: [],
        sourceType: "WorksheetResponse",
        sourceId: response.id,
      },
      tx,
    );
    // C11: completing the practice intake stamps the profile.
    if (assignment.worksheet.isIntake) {
      await tx.clientProfile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, intakeCompletedAt: response.completedAt },
        update: { intakeCompletedAt: response.completedAt },
      });
    }
    // C12: the values-spiral assessment scores into a lens result — held for
    // practitioner review before it enters any synthesis (stage-typing is
    // interpretive; the tool prepares, she decides).
    if (assignment.worksheet.isSpiral) {
      const { scoreSpiral } = await import("@/lib/spiral");
      const score = scoreSpiral(answers);
      if (score) {
        const lensData = {
          lens: "SPIRAL",
          sourceType: "ASSESSMENT",
          result: score as unknown as object,
          contentRef: score.contentRef,
          practitionerReviewed: false,
          generatedAt: response.completedAt,
        };
        await tx.lensResult.upsert({
          where: { userId_lens: { userId: user.id, lens: "SPIRAL" } },
          create: { userId: user.id, ...lensData },
          update: lensData,
        });
      }
    }
  });

  revalidatePath("/space");
  redirect(`${back}?done=1`);
}

export async function dismissWorksheet(assignmentId: string) {
  const user = await requireClient();
  await prisma.worksheetAssignment.updateMany({
    where: { id: assignmentId, clientId: user.id, status: "PENDING" },
    data: { status: "DISMISSED" },
  });
  revalidatePath("/space");
  redirect("/space");
}
