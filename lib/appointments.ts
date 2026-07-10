import type { SessionLocation } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrCreateConfig, hasConflict, formatInZone, zoneAbbrev } from "@/lib/schedule";
import { appointmentEvent, buildInvite } from "@/lib/ics";
import { sendEmail } from "@/lib/notify";

// The service layer for appointments: booking with a server-side double-book
// guard, reschedule, cancel, and the practitioner/client notification email
// (with an .ics invite). Called by both the client and practitioner actions so
// the rules live in exactly one place.

export function clientLabel(user: { name: string | null; email: string }): string {
  const first = user.name?.trim().split(/\s+/)[0];
  return first || user.email.split("@")[0];
}

type BookArgs = {
  practitionerId: string;
  clientId: string;
  startAt: Date;
  endAt: Date;
  bookedBy: "practitioner" | "client";
  location?: SessionLocation;
  clientNote?: string | null;
  videoUrl?: string | null;
};

export async function createAppointment(args: BookArgs) {
  const config = await getOrCreateConfig(args.practitionerId);

  // Final overlap guard inside the write path (races, hand-crafted requests).
  if (await hasConflict(args.practitionerId, args.startAt, args.endAt, config.bufferMinutes)) {
    return { ok: false as const, error: "conflict" };
  }

  const location: SessionLocation = args.location ?? "VIRTUAL";
  // Attach a video link for virtual sessions: the per-appointment link if given,
  // else the practitioner's standing room. Provider "MANUAL" until Zoom/Meet
  // auto-create is wired (spec §8, Option A).
  const videoUrl =
    location === "VIRTUAL" ? args.videoUrl || config.defaultVideoUrl || null : null;

  const appt = await prisma.appointment.create({
    data: {
      practitionerId: args.practitionerId,
      clientId: args.clientId,
      startAt: args.startAt,
      endAt: args.endAt,
      location,
      videoUrl,
      videoProvider: videoUrl ? "MANUAL" : null,
      bookedBy: args.bookedBy,
      clientNote: args.clientNote?.trim() || null,
    },
  });

  await notify(appt.id, "booked");
  return { ok: true as const, appointment: appt };
}

export async function rescheduleAppointment(
  appointmentId: string,
  practitionerId: string,
  startAt: Date,
  endAt: Date,
) {
  const config = await getOrCreateConfig(practitionerId);
  if (await hasConflict(practitionerId, startAt, endAt, config.bufferMinutes, appointmentId)) {
    return { ok: false as const, error: "conflict" };
  }
  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { startAt, endAt, status: "SCHEDULED" },
  });
  await notify(appointmentId, "rescheduled");
  return { ok: true as const };
}

export async function cancelAppointment(appointmentId: string) {
  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: "CANCELLED" },
  });
  await notify(appointmentId, "cancelled");
  return { ok: true as const };
}

type NotifyKind = "booked" | "rescheduled" | "cancelled";

// Email both parties on a change, with an .ics invite so the appointment can be
// added in one tap (covers the subscribed feed's refresh lag). Never throws —
// a failed email must not fail the booking (spec §7).
async function notify(appointmentId: string, kind: NotifyKind): Promise<void> {
  try {
    const appt = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { client: { select: { name: true, email: true } } },
    });
    if (!appt) return;
    const practitioner = await prisma.user.findFirst({
      where: { id: appt.practitionerId },
      select: { name: true, email: true },
    });
    const config = await getOrCreateConfig(appt.practitionerId);
    const label = clientLabel(appt.client);
    const when = `${formatInZone(appt.startAt, config.timezone, {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })} ${zoneAbbrev(appt.startAt, config.timezone)}`;

    const verb =
      kind === "booked" ? "booked" : kind === "rescheduled" ? "moved" : "cancelled";
    const ics = buildInvite(appointmentEvent(appt, label));
    const attachments =
      kind === "cancelled" ? undefined : [{ filename: "session.ics", content: ics }];

    // Practitioner — the key ask: know right away.
    if (practitioner?.email) {
      await sendEmail({
        to: practitioner.email,
        subject: `Session ${verb} — ${label}, ${when}`,
        text:
          `A session with ${label} was ${verb}.\n\n` +
          `When: ${when}\n` +
          `Where: ${appt.location === "VIRTUAL" ? appt.videoUrl || "Virtual" : "In person"}\n` +
          (appt.clientNote ? `Topic: ${appt.clientNote}\n` : "") +
          (kind === "cancelled" ? "" : "\nThe attached invite adds it to your calendar."),
        attachments,
      });
    }

    // Client — their confirmation / update.
    if (appt.client.email) {
      await sendEmail({
        to: appt.client.email,
        subject:
          kind === "cancelled"
            ? `Your session on ${when} was cancelled`
            : `Your session is ${kind === "booked" ? "confirmed" : "updated"} — ${when}`,
        text:
          (kind === "cancelled"
            ? `Your session on ${when} has been cancelled.`
            : `Your session is set for ${when}.`) +
          (kind !== "cancelled" && appt.location === "VIRTUAL" && appt.videoUrl
            ? `\n\nJoin here at the time: ${appt.videoUrl}`
            : "") +
          (kind !== "cancelled" ? "\n\nThe attached invite adds it to your calendar." : ""),
        attachments,
      });
    }
  } catch (err) {
    console.error("[appointments] notify failed", err instanceof Error ? err.message : "unknown");
  }
}
