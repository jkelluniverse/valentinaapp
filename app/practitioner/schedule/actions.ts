"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePractitioner } from "@/lib/auth-guards";
import {
  completeAppointment,
  markNoShow,
  markDidntHappen,
  revertAppointmentStatus,
} from "@/lib/appointments";

const PATH = "/practitioner/schedule";

// C13-PKG §5 + C10-POLICY §3 — her one-tap overrides on past sessions. The
// auto-complete cron handles the usual case; these are the exceptions, each
// attributable to her. All the money/credit consequences live in the service
// layer — these just carry her intent.

export async function markSessionCompleted(appointmentId: string) {
  const practitioner = await requirePractitioner();
  await completeAppointment(appointmentId, practitioner.id);
  revalidatePath(PATH);
  redirect(`${PATH}?marked=completed`);
}

export async function markSessionNoShow(appointmentId: string) {
  const practitioner = await requirePractitioner();
  await markNoShow(appointmentId, practitioner.id);
  revalidatePath(PATH);
  redirect(`${PATH}?marked=noshow`);
}

export async function markSessionDidntHappen(appointmentId: string) {
  const practitioner = await requirePractitioner();
  await markDidntHappen(appointmentId, practitioner.id);
  revalidatePath(PATH);
  redirect(`${PATH}?marked=quiet`);
}

export async function revertSessionStatus(appointmentId: string) {
  const practitioner = await requirePractitioner();
  await revertAppointmentStatus(appointmentId, practitioner.id);
  revalidatePath(PATH);
  redirect(`${PATH}?marked=reverted`);
}

// The "Sync to your iPhone" card is setup, not furniture — once she's verified
// the subscription works, she marks it done and the card folds to one line.
export async function setCalendarSyncDone(done: boolean) {
  await requirePractitioner();
  const { prisma } = await import("@/lib/prisma");
  if (done) {
    await prisma.practiceSetting.upsert({
      where: { key: "calendarSyncDone" },
      update: { value: "on" },
      create: { key: "calendarSyncDone", value: "on" },
    });
  } else {
    await prisma.practiceSetting.deleteMany({ where: { key: "calendarSyncDone" } });
  }
  revalidatePath(PATH);
  redirect(PATH);
}
