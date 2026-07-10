"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth-guards";
import { getPractitioner, isSlotOpen, getOrCreateConfig } from "@/lib/schedule";
import { createAppointment, cancelAppointment } from "@/lib/appointments";

const PATH = "/space/schedule";

// Client self-serve booking. Consent (C1) is required before booking, matching
// every other client write path.
export async function bookSlot(formData: FormData) {
  const user = await requireClient();
  if (!user.consentAt) redirect("/space?error=consent");

  const startIso = String(formData.get("start") ?? "");
  const startAt = new Date(startIso);
  if (Number.isNaN(startAt.getTime())) redirect(`${PATH}?error=slot`);

  const practitioner = await getPractitioner();
  if (!practitioner) redirect(`${PATH}?error=slot`);

  const now = new Date();
  // Re-validate server-side: the slot must still be open on the grid.
  if (!(await isSlotOpen(practitioner.id, startAt, now))) {
    redirect(`${PATH}?error=taken`);
  }

  const config = await getOrCreateConfig(practitioner.id);
  const endAt = new Date(startAt.getTime() + config.sessionMinutes * 60000);
  const note = String(formData.get("note") ?? "").trim() || null;

  const result = await createAppointment({
    practitionerId: practitioner.id,
    clientId: user.id,
    startAt,
    endAt,
    bookedBy: "client",
    location: "VIRTUAL",
    clientNote: note,
  });
  if (!result.ok) redirect(`${PATH}?error=taken`);

  revalidatePath(PATH);
  redirect(`${PATH}?booked=1`);
}

export async function cancelMyAppointment(appointmentId: string) {
  const user = await requireClient();
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  // Scope: a client can only touch their own appointment.
  if (!appt || appt.clientId !== user.id) redirect(`${PATH}?error=scope`);

  const config = await getOrCreateConfig(appt.practitionerId);
  const cutoff = new Date(appt.startAt.getTime() - config.cancelCutoffHours * 3600_000);
  if (new Date() > cutoff) redirect(`${PATH}?error=cutoff`);
  if (appt.status !== "SCHEDULED") redirect(PATH);

  await cancelAppointment(appointmentId);
  revalidatePath(PATH);
  redirect(`${PATH}?cancelled=1`);
}
