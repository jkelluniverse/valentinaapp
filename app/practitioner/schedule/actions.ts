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
