import { prisma } from "@/lib/prisma";
import { getTenant } from "@/lib/tenancy";
import { emitEvent } from "@/lib/intake/engine";

// CLIENT-ONBOARDING §4.6 — the birth-time UPDATE flow. The only UPDATE-purpose
// flow that ships in v1.1 (the schema + service support are general; this is
// the small, immediately-useful one). A client who chose "birth time unknown"
// at intake adds it later; the time-dependent readings recompute, cache
// untouched for unchanged inputs.

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export async function addBirthTime(
  clientId: string,
  time: string,
): Promise<{ ok: true; recomputed: boolean } | { ok: false; error: "time" | "noprofile" }> {
  if (!TIME_RE.test(time)) return { ok: false, error: "time" };
  const tenant = await getTenant();
  const profile = await prisma.clientProfile.findUnique({ where: { userId: clientId } });
  if (!profile) return { ok: false, error: "noprofile" };

  // A short UPDATE-purpose flow row records the change for the timeline and
  // future reassessment comparisons (§4.6); it's born COMPLETE.
  const flow = await prisma.intakeFlow.create({
    data: { clientId, purpose: "UPDATE", status: "COMPLETE", schemaHash: "birthtime", currentStep: "birth", startedAt: new Date(), completedAt: new Date() },
  });
  await prisma.intakeAnswer.create({
    data: { flowId: flow.id, fieldKey: "birth.time", value: time as unknown as object, questionTextSnapshot: "Time of birth" },
  });

  await prisma.clientProfile.update({
    where: { userId: clientId },
    data: { birthTime: time, birthTimeUnknown: false, birthTimePrecision: "EXACT" },
  });

  // Targeted recompute — ensureChart's inputHash changes with the new time,
  // so time-dependent readings regenerate; unchanged inputs stay cached.
  let recomputed = false;
  try {
    const fresh = await prisma.clientProfile.findUnique({ where: { userId: clientId } });
    if (fresh?.birthDate) {
      const { ensureChart } = await import("@/lib/human-design");
      recomputed = await ensureChart(fresh as never);
    }
  } catch (e) {
    console.error(`[intake] birth-time recompute failed client=${clientId}: ${e instanceof Error ? e.message : "error"}`);
  }

  await emitEvent({ tenantId: tenant.id, clientId, actor: "client", eventKey: "intake.birthtime_added", meta: { recomputed } });
  return { ok: true, recomputed };
}
