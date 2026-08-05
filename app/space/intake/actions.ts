"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth-guards";
import { saveAnswer, advanceStep, getActiveFlow } from "@/lib/intake/engine";

// CLIENT-ONBOARDING §4.1 — save behavior. Every field auto-saves the moment
// it changes (Rule 0.2), with the question text snapshotted (Rule 0.8). The
// client never presses Save — saving is not their job. All actions re-verify
// the flow belongs to the signed-in client (IntakeAnswer has no tenantId of
// its own; the flow ownership check is the boundary).

async function ownFlow(flowId: string): Promise<string | null> {
  const user = await requireClient();
  const flow = await prisma.intakeFlow.findFirst({ where: { id: flowId, clientId: user.id }, select: { id: true } });
  return flow ? user.id : null;
}

// Auto-save one field. Returns nothing; the client shows its own "Saved".
export async function saveIntakeField(flowId: string, fieldKey: string, questionText: string, value: unknown): Promise<void> {
  if (!(await ownFlow(flowId))) return;
  await saveAnswer({ flowId, fieldKey, value, questionText });
}

// Advance to the next step (records currentStep + emits step_completed).
export async function advanceIntake(flowId: string, nextStep: string): Promise<void> {
  if (!(await ownFlow(flowId))) return;
  await advanceStep(flowId, nextStep);
  revalidatePath("/space/intake");
  redirect("/space/intake");
}

// Back-navigation (allowed, §4.2) — just moves currentStep; answers persist.
export async function backIntake(flowId: string, prevStep: string): Promise<void> {
  if (!(await ownFlow(flowId))) return;
  await prisma.intakeFlow.update({ where: { id: flowId }, data: { currentStep: prevStep } });
  revalidatePath("/space/intake");
  redirect("/space/intake");
}

// Jump to a specific step from the Review page (edit-jump, §3D).
export async function jumpIntake(flowId: string, stepKey: string): Promise<void> {
  if (!(await ownFlow(flowId))) return;
  await prisma.intakeFlow.update({ where: { id: flowId }, data: { currentStep: stepKey } });
  revalidatePath("/space/intake");
  redirect("/space/intake");
}

// Complete: commit + mark COMPLETE + fire the §5 fan-out (Done never blocks).
export async function completeIntakeAction(flowId: string): Promise<void> {
  const clientId = await ownFlow(flowId);
  if (!clientId) return;
  const { completeIntake, runCompletionFanout } = await import("@/lib/intake/complete");
  const done = await completeIntake(flowId);
  if (done && "blocked" in done) {
    // ADDENDUM M — adults-only platform; calm message, nothing lost.
    redirect("/space/intake?notice=guardian");
  }
  if (done) {
    // Fired, not awaited — the client lands on Done immediately (§3E).
    void runCompletionFanout(flowId, done.clientId).catch(() => undefined);
  }
  revalidatePath("/space/intake");
  redirect("/space/intake?done=1");
}
