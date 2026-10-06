import type { Lead, Prisma } from "@prisma/client";
import type { IntakeAnswers } from "@/lib/booking-form";
import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import { getPractitioner, getOrCreateConfig, isSlotOpen, hasConflict, openSlots, formatInZone, zoneAbbrev } from "@/lib/schedule";
import { appointmentEvent, buildInvite } from "@/lib/ics";
import { sendEmail } from "@/lib/notify";
import { signToken, verifyToken } from "@/lib/sign";

// C18 §4 — the discovery funnel's service layer. Self-contained and separate
// from the session path (lib/appointments.ts): a discovery call belongs to a
// Lead, is free (no charge), is virtual by default, and emails a prospect who
// has no account (so the confirmation carries a signed reschedule/cancel link).

const DAY_MS = 86_400_000;

export function discoveryWhen(startAt: Date, timezone: string): string {
  return `${formatInZone(startAt, timezone, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })} ${zoneAbbrev(startAt, timezone)}`;
}

type BookArgs = {
  name: string;
  email: string;
  phone?: string | null;
  note?: string | null;
  /** C42 §2.3 — the Rule 0.8 snapshot of her questions and their answers,
   *  keyed by fieldId. phone/note above are the compatibility columns. */
  intakeAnswers?: IntakeAnswers | null;
  startAt: Date;
  source?: string | null;
  baseUrl: string; // for the signed reschedule link in the confirmation email
};

export type BookResult =
  | { ok: true; leadId: string; appointmentId: string; startAt: Date; timezone: string }
  | { ok: false; error: "unavailable" | "no_practitioner" | "conflict" };

// Create Lead + DISCOVERY Appointment, then fan out to the same calendar/email
// machinery C10 uses. Slot is re-validated server-side against discovery hours.
export async function bookDiscoveryCall(args: BookArgs): Promise<BookResult> {
  const practitioner = await getPractitioner();
  if (!practitioner) return { ok: false, error: "no_practitioner" };
  const config = await getOrCreateConfig(practitioner.id);
  const now = new Date();

  // The slot must still be an open, on-grid discovery slot (guards races + forged
  // times), and must not overlap anything already booked (buffer applied).
  if (!(await isSlotOpen(practitioner.id, args.startAt, now, "DISCOVERY"))) {
    return { ok: false, error: "unavailable" };
  }
  const endAt = new Date(args.startAt.getTime() + config.discoveryMinutes * 60000);
  if (await hasConflict(practitioner.id, args.startAt, endAt, config.bufferMinutes)) {
    return { ok: false, error: "conflict" };
  }

  // Virtual by default (her chosen medium): a standing discovery room if set,
  // else the general room. Never blocks the booking if neither exists.
  const videoUrl = config.discoveryVideoUrl || config.defaultVideoUrl || null;

  const appt = await prisma.appointment.create({
    data: {
      practitionerId: practitioner.id,
      clientId: null,
      kind: "DISCOVERY",
      startAt: args.startAt,
      endAt,
      location: "VIRTUAL",
      videoUrl,
      videoProvider: videoUrl ? "MANUAL" : null,
      bookedBy: "client",
      clientNote: args.note?.trim() || null,
    },
  });

  const lead = await prisma.lead.create({
    data: {
      name: args.name.trim(),
      email: args.email.trim().toLowerCase(),
      phone: args.phone?.trim() || null,
      note: args.note?.trim() || null,
      intakeAnswers: (args.intakeAnswers ?? undefined) as Prisma.InputJsonValue | undefined,
      status: "SCHEDULED",
      appointmentId: appt.id,
      source: args.source?.trim() || null,
    },
  });

  await notifyDiscovery(appt.id, "booked", args.baseUrl);
  return { ok: true, leadId: lead.id, appointmentId: appt.id, startAt: args.startAt, timezone: config.timezone };
}

// C40 §1.11 — THE SECOND BOOKING PATH. /book is the public door, and the
// likelier one for a double-hold. Same preamble as bookDiscoveryCall; the
// appointment is REQUESTED, the Lead is REQUESTED (so the leads page does not
// say "Call booked" about a call she has not agreed to), no video link yet,
// no prospect confirmation — the practitioner hears, the prospect reads the
// ruling-224 note on the page they just submitted.
export async function requestDiscoveryCall(args: BookArgs): Promise<BookResult> {
  const practitioner = await getPractitioner();
  if (!practitioner) return { ok: false, error: "no_practitioner" };
  const config = await getOrCreateConfig(practitioner.id);
  const now = new Date();
  if (!(await isSlotOpen(practitioner.id, args.startAt, now, "DISCOVERY"))) return { ok: false, error: "unavailable" };
  const endAt = new Date(args.startAt.getTime() + config.discoveryMinutes * 60000);
  if (await hasConflict(practitioner.id, args.startAt, endAt, config.bufferMinutes)) return { ok: false, error: "conflict" };

  const appt = await prisma.appointment.create({
    data: { practitionerId: practitioner.id, clientId: null, kind: "DISCOVERY", startAt: args.startAt, endAt, status: "REQUESTED", location: "VIRTUAL", bookedBy: "client", clientNote: args.note?.trim() || null },
  });
  const lead = await prisma.lead.create({
    data: { name: args.name.trim(), email: args.email.trim().toLowerCase(), phone: args.phone?.trim() || null, note: args.note?.trim() || null, intakeAnswers: (args.intakeAnswers ?? undefined) as Prisma.InputJsonValue | undefined, status: "REQUESTED", appointmentId: appt.id, source: args.source?.trim() || null },
  });
  await notifyDiscovery(appt.id, "requested", args.baseUrl);
  return { ok: true, leadId: lead.id, appointmentId: appt.id, startAt: args.startAt, timezone: config.timezone };
}

/** Approval = the exact tail of bookDiscoveryCall from the create onward:
 *  appointment SCHEDULED with the standing room, Lead SCHEDULED, then the same
 *  "booked" announcement both parties get from a direct booking. Re-checks the
 *  slot with the request itself ignored (it is busy under ruling 223). */
export async function approveDiscoveryRequest(appointmentId: string, practitionerId: string, baseUrl: string): Promise<{ ok: boolean; error?: "not-requested" | "conflict" }> {
  const appt = await prisma.appointment.findFirst({ where: { id: appointmentId, practitionerId, kind: "DISCOVERY" } });
  if (!appt || appt.status !== "REQUESTED") return { ok: false, error: "not-requested" };
  const config = await getOrCreateConfig(practitionerId);
  if (await hasConflict(practitionerId, appt.startAt, appt.endAt, config.bufferMinutes, appointmentId)) return { ok: false, error: "conflict" };
  const videoUrl = config.discoveryVideoUrl || config.defaultVideoUrl || null;
  await prisma.appointment.update({ where: { id: appointmentId }, data: { status: "SCHEDULED", videoUrl, videoProvider: videoUrl ? "MANUAL" : null } });
  await prisma.lead.updateMany({ where: { appointmentId }, data: { status: "SCHEDULED" } });
  await notifyDiscovery(appointmentId, "booked", baseUrl);
  return { ok: true };
}

export async function declineDiscoveryRequest(appointmentId: string, practitionerId: string, baseUrl: string): Promise<{ ok: boolean }> {
  const appt = await prisma.appointment.findFirst({ where: { id: appointmentId, practitionerId, kind: "DISCOVERY" } });
  if (!appt || appt.status !== "REQUESTED") return { ok: false };
  await prisma.appointment.update({ where: { id: appointmentId }, data: { status: "DECLINED" } });
  await prisma.lead.updateMany({ where: { appointmentId }, data: { status: "CLOSED" } });
  await notifyDiscovery(appointmentId, "declined", baseUrl);
  return { ok: true };
}

type NotifyKind = "booked" | "rescheduled" | "cancelled" | "requested" | "declined" | "expired"; // C40 adds the last three

// Email both parties. Never throws — a failed email must not fail the booking.
export async function notifyDiscovery(appointmentId: string, kind: NotifyKind, baseUrl: string): Promise<void> {
  try {
    const appt = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { lead: true },
    });
    if (!appt || !appt.lead) return;
    const lead = appt.lead;
    const practitioner = await prisma.user.findFirst({
      where: { id: appt.practitionerId },
      select: { name: true, email: true },
    });
    const config = await getOrCreateConfig(appt.practitionerId);
    const when = discoveryWhen(appt.startAt, config.timezone);
    const firstName = lead.name.trim().split(/\s+/)[0] || lead.name;

    // C40 — a REQUEST goes to her only; DECLINED/EXPIRED go to the prospect only.
    if (kind === "requested") {
      if (practitioner?.email) {
        await sendEmail({
          to: practitioner.email,
          subject: `Discovery call requested — ${lead.name}, ${when}`,
          text: `${lead.name} has asked for a free discovery call.\n\nWhen: ${when}\nEmail: ${lead.email}\n` + (lead.phone ? `Phone: ${lead.phone}\n` : "") + (lead.note ? `\nWhat brings them:\n${lead.note}\n` : "") + `\nApprove or decline from your schedule. Unanswered requests lapse after 48 hours.`,
        });
      }
      await sendPushToUser(appt.practitionerId, { title: "Discovery call request", body: `${lead.name} · ${when}`, url: "/practitioner/schedule?show=requests" });
      return;
    }
    if (kind === "declined" || kind === "expired") {
      await sendEmail({
        to: lead.email,
        subject: kind === "declined" ? `About your request for ${when}` : `Your request for ${when} lapsed`,
        text:
          kind === "declined"
            ? `[JACOB — decline copy. Placeholder: "Hi ${firstName}, ${practitioner?.name ?? "Valentina"} isn't able to take ${when}. You're welcome to request another time."]`
            : `Hi ${firstName}, your discovery call request for ${when} wasn't answered within 48 hours, so that time has been released. You're welcome to request another.`,
      });
      return;
    }

    const ics = buildInvite(appointmentEvent(appt, `${firstName} (discovery)`));
    const attachments = kind === "cancelled" ? undefined : [{ filename: "discovery-call.ics", content: ics }];
    const manageUrl = `${baseUrl}/discovery/${signToken(appt.id)}`;

    // Practitioner — a new prospect wants to talk.
    if (practitioner?.email) {
      await sendEmail({
        to: practitioner.email,
        subject:
          kind === "cancelled"
            ? `Discovery call cancelled — ${lead.name}, ${when}`
            : `Discovery call ${kind === "booked" ? "booked" : "moved"} — ${lead.name}, ${when}`,
        text:
          `${lead.name} ${kind === "cancelled" ? "cancelled their" : kind === "booked" ? "booked a" : "moved their"} free discovery call.\n\n` +
          `When: ${when}\n` +
          `Email: ${lead.email}\n` +
          (lead.phone ? `Phone: ${lead.phone}\n` : "") +
          (appt.location === "VIRTUAL" ? `Where: ${appt.videoUrl || "Virtual"}\n` : "") +
          (lead.note ? `\nWhat brings them:\n${lead.note}\n` : "") +
          (kind === "cancelled" ? "" : "\nThe attached invite adds it to your calendar."),
        attachments,
      });
    }

    // Prospect — their confirmation, with the video link + a way to change it.
    await sendEmail({
      to: lead.email,
      subject:
        kind === "cancelled"
          ? `Your discovery call on ${when} was cancelled`
          : `Your free discovery call is ${kind === "booked" ? "confirmed" : "updated"} — ${when}`,
      text:
        (kind === "cancelled"
          ? `Hi ${firstName}, your discovery call on ${when} has been cancelled. You're welcome to book another anytime.`
          : `Hi ${firstName}, your free discovery call with Valentina is set for ${when}.`) +
        (kind !== "cancelled" && appt.videoUrl ? `\n\nJoin here at the time: ${appt.videoUrl}` : "") +
        (kind !== "cancelled" ? `\n\nNeed to change it? Reschedule or cancel here: ${manageUrl}` : "") +
        (kind !== "cancelled" ? "\n\nThe attached invite adds it to your calendar." : ""),
      attachments,
    });
  } catch (err) {
    console.error("[discovery] notify failed", err instanceof Error ? err.message : "unknown");
  }
}

// Public reschedule (signed link). Re-validates the new slot against discovery hours.
export async function rescheduleDiscovery(
  appointmentId: string,
  startAt: Date,
  baseUrl: string,
): Promise<{ ok: boolean; error?: string }> {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId }, include: { lead: true } });
  if (!appt || appt.kind !== "DISCOVERY" || appt.status !== "SCHEDULED") return { ok: false, error: "gone" };
  const config = await getOrCreateConfig(appt.practitionerId);
  const now = new Date();
  if (!(await isSlotOpen(appt.practitionerId, startAt, now, "DISCOVERY"))) return { ok: false, error: "unavailable" };
  const endAt = new Date(startAt.getTime() + config.discoveryMinutes * 60000);
  if (await hasConflict(appt.practitionerId, startAt, endAt, config.bufferMinutes, appointmentId)) {
    return { ok: false, error: "conflict" };
  }
  await prisma.appointment.update({ where: { id: appointmentId }, data: { startAt, endAt } });
  await notifyDiscovery(appointmentId, "rescheduled", baseUrl);
  return { ok: true };
}

export async function cancelDiscovery(appointmentId: string, baseUrl: string): Promise<{ ok: boolean }> {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId }, include: { lead: true } });
  if (!appt || appt.kind !== "DISCOVERY") return { ok: false };
  await notifyDiscovery(appointmentId, "cancelled", baseUrl);
  await prisma.appointment.update({ where: { id: appointmentId }, data: { status: "CANCELLED" } });
  if (appt.lead) await prisma.lead.update({ where: { id: appt.lead.id }, data: { status: "CLOSED" } });
  return { ok: true };
}

export function leadFromAppointment(appt: { lead?: Lead | null }): Lead | null {
  return appt.lead ?? null;
}

// C18 §4.5 — resolve a signed manage-link token to the booking's public-safe
// view (current time + open slots to move to). Returns null if forged/gone.
export type ManageView = {
  appointmentId: string;
  name: string;
  whenLabel: string;
  status: "SCHEDULED" | "CANCELLED";
  days: DiscoveryDay[];
  timezone: string;
};

export async function getDiscoveryManage(token: string): Promise<ManageView | null> {
  const appointmentId = verifyToken(token);
  if (!appointmentId) return null;
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId }, include: { lead: true } });
  if (!appt || appt.kind !== "DISCOVERY" || !appt.lead) return null;
  const config = await getOrCreateConfig(appt.practitionerId);
  const { days } = appt.status === "SCHEDULED" ? await getDiscoverySlots() : { days: [] };
  return {
    appointmentId: appt.id,
    name: appt.lead.name.trim().split(/\s+/)[0] || appt.lead.name,
    whenLabel: discoveryWhen(appt.startAt, config.timezone),
    status: appt.status === "CANCELLED" ? "CANCELLED" : "SCHEDULED",
    days,
    timezone: config.timezone,
  };
}

// Verify a manage token and return the appointment id (for the action layer).
export function appointmentIdFromToken(token: string): string | null {
  return verifyToken(token);
}

// The raw times for "add to calendar" links and the downloadable invite —
// token-gated exactly like the manage view; exposes only this one call.
export type DiscoveryInvite = {
  appointmentId: string;
  startAt: Date;
  endAt: Date;
  videoUrl: string | null;
  cancelled: boolean;
  requested: boolean; // C40 — awaiting the practitioner; the confirmed page says so instead of "booked"
};

export async function getDiscoveryInvite(token: string): Promise<DiscoveryInvite | null> {
  const appointmentId = verifyToken(token);
  if (!appointmentId) return null;
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt || appt.kind !== "DISCOVERY") return null;
  return {
    appointmentId: appt.id,
    startAt: appt.startAt,
    endAt: appt.endAt,
    videoUrl: appt.videoUrl,
    cancelled: appt.status === "CANCELLED",
    requested: appt.status === "REQUESTED",
  };
}

// C18 — the ONLY data the public /book page reads: open discovery slots, grouped
// by civil day in the practitioner's timezone. Exposes free/busy times, never
// client data. Returns [] gracefully if discovery hours aren't set up yet.
export type DiscoveryDay = {
  key: string; // yyyy-mm-dd
  label: string; // "Mon, Jul 20"
  slots: { iso: string; label: string }[]; // "2:00 PM"
};

export async function getDiscoverySlots(daysAhead = 30): Promise<{
  timezone: string;
  practitionerName: string | null;
  days: DiscoveryDay[];
}> {
  const practitioner = await getPractitioner();
  if (!practitioner) return { timezone: "America/New_York", practitionerName: null, days: [] };
  const now = new Date();
  const to = new Date(now.getTime() + daysAhead * DAY_MS);
  const { config, slots } = await openSlots(practitioner.id, now, to, now, "DISCOVERY");

  const byDay = new Map<string, DiscoveryDay>();
  for (const s of slots) {
    const key = formatInZone(s.startAt, config.timezone, { year: "numeric", month: "2-digit", day: "2-digit" })
      .split("/")
      .reverse()
      .join("-"); // stable yyyy-mm-dd-ish key for grouping
    const dayLabel = formatInZone(s.startAt, config.timezone, { weekday: "short", month: "short", day: "numeric" });
    const timeLabel = formatInZone(s.startAt, config.timezone, { hour: "numeric", minute: "2-digit" });
    if (!byDay.has(key)) byDay.set(key, { key, label: dayLabel, slots: [] });
    byDay.get(key)!.slots.push({ iso: s.startAt.toISOString(), label: timeLabel });
  }
  return {
    timezone: config.timezone,
    practitionerName: practitioner.name,
    days: [...byDay.values()],
  };
}
