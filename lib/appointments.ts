import type { SessionLocation } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getOrCreateConfig, hasConflict, formatInZone, zoneAbbrev, isSlotOpen } from "@/lib/schedule";
import { appointmentEvent, buildInvite } from "@/lib/ics";
import { sendEmail } from "@/lib/notify";
import {
  createChargeForAppointment,
  cancelChargeForAppointment,
  applyLateFee,
  formatMoney,
} from "@/lib/billing";
import {
  consumeCreditForAppointment,
  releaseCreditForAppointment,
  unconsumeCreditForAppointment,
} from "@/lib/packages";
import { pickLocale, sessionEmail, lateFeeEmail } from "@/lib/email-copy";

// The service layer for appointments: booking with a server-side double-book
// guard, reschedule, cancel, the completion lifecycle (C13-PKG §5), the
// 24-hour late-change policy (C10-POLICY), and the practitioner/client
// notification email (with an .ics invite). Called by both the client and
// practitioner actions so the rules live in exactly one place.

export function clientLabel(user: { name: string | null; email: string }): string {
  const first = user.name?.trim().split(/\s+/)[0];
  return first || user.email.split("@")[0];
}

// C18 — an appointment's other party: a client User for sessions, or a Lead for
// discovery calls. Callers that load ALL appointments (the ICS feed, Today, the
// practitioner schedule) use this so a discovery call shows the prospect's name.
export function apptParty(appt: {
  client?: { name: string | null; email: string } | null;
  lead?: { name: string; email: string } | null;
}): { name: string | null; email: string } | null {
  if (appt.client) return appt.client;
  if (appt.lead) return { name: appt.lead.name, email: appt.lead.email };
  return null;
}

export function partyLabel(appt: {
  client?: { name: string | null; email: string } | null;
  lead?: { name: string; email: string } | null;
}): string {
  const p = apptParty(appt);
  return p ? clientLabel(p) : "Someone";
}

// C10-POLICY §1 — the boundary, UTC vs UTC. Exactly-24h counts as FREE
// (client-favorable; boundary disputes should never be about seconds).
export function isLateChange(startAt: Date, cutoffHours: number, now = new Date()): boolean {
  return startAt.getTime() - now.getTime() < cutoffHours * 3_600_000;
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

  // C13.2 + C13-PKG §4: a package credit covers the session when available;
  // otherwise a DUE charge at her current rate (silently skipped while the
  // price book is empty — shows as "unbilled").
  await createChargeForAppointment(appt);

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
  // A reserved package credit rides with the appointment to its new time
  // (C10-POLICY §5) — same appointment row, nothing to move.
  await notify(appointmentId, "rescheduled");
  return { ok: true as const };
}

export async function cancelAppointment(
  appointmentId: string,
  actorId = "system",
  creditReason = "CANCELLED",
) {
  const appt = await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: "CANCELLED" },
  });
  // An open charge dies with its session; paid ones stay (refunds live in
  // Square). A reserved package credit RELEASES back to available.
  await cancelChargeForAppointment(appt.id, actorId);
  await releaseCreditForAppointment(appt.id, actorId, creditReason);
  await notify(appointmentId, "cancelled");
  return { ok: true as const };
}

// ---------------------------------------------------------------------------
// C10-POLICY §2 — client self-service. The COST changes at the boundary,
// never the ability. The action layer shows the fee sheet; these enforce it
// server-side (feeConfirmed must be explicit inside the window).

export type PolicyCheck = {
  late: boolean;
  lateFeeCents: number;
  cutoffHours: number;
};

export async function checkChangePolicy(appt: { startAt: Date; practitionerId: string }): Promise<PolicyCheck> {
  const config = await getOrCreateConfig(appt.practitionerId);
  return {
    late: isLateChange(appt.startAt, config.cancelCutoffHours),
    lateFeeCents: config.lateFeeCents,
    cutoffHours: config.cancelCutoffHours,
  };
}

export async function clientCancelWithPolicy(
  appointmentId: string,
  client: { id: string },
  feeConfirmed: boolean,
): Promise<{ ok: true; feeApplied: boolean } | { ok: false; error: string; feeCents?: number }> {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt || appt.clientId !== client.id) return { ok: false, error: "not-found" };
  if (appt.status !== "SCHEDULED") return { ok: false, error: "not-scheduled" };

  const policy = await checkChangePolicy(appt);
  if (!policy.late) {
    await cancelAppointment(appointmentId, client.id, "CANCELLED");
    return { ok: true, feeApplied: false };
  }
  // Inside the window: allowed, but $50 — and only with in-the-moment consent.
  if (!feeConfirmed) return { ok: false, error: "fee-confirm", feeCents: policy.lateFeeCents };
  const fee = await applyLateFee({
    appointmentId,
    clientId: client.id,
    reason: "LATE_CANCEL",
    actorId: client.id,
    lateFeeCents: policy.lateFeeCents,
  });
  // Credit RELEASES; the fee stands separately (§5 — never consume + charge).
  await cancelAppointment(appointmentId, client.id, "LATE_CANCEL");
  if (fee.created) await notifyLateFee(appointmentId, client.id, "LATE_CANCEL", policy.lateFeeCents);
  return { ok: true, feeApplied: fee.created };
}

export async function clientRescheduleWithPolicy(
  appointmentId: string,
  client: { id: string },
  newStart: Date,
  feeConfirmed: boolean,
): Promise<{ ok: true; feeApplied: boolean } | { ok: false; error: string; feeCents?: number }> {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt || appt.clientId !== client.id) return { ok: false, error: "not-found" };
  if (appt.status !== "SCHEDULED") return { ok: false, error: "not-scheduled" };

  const config = await getOrCreateConfig(appt.practitionerId);
  // The boundary is judged against the ORIGINAL time — that's the held slot.
  const late = isLateChange(appt.startAt, config.cancelCutoffHours);
  if (late && !feeConfirmed) return { ok: false, error: "fee-confirm", feeCents: config.lateFeeCents };

  // The new time must be a genuinely open slot (client-grade rules).
  if (!(await isSlotOpen(appt.practitionerId, newStart, new Date(), "SESSION"))) {
    return { ok: false, error: "slot-taken" };
  }
  const newEnd = new Date(newStart.getTime() + config.sessionMinutes * 60_000);
  const moved = await rescheduleAppointment(appointmentId, appt.practitionerId, newStart, newEnd);
  if (!moved.ok) return { ok: false, error: moved.error };

  if (late) {
    const fee = await applyLateFee({
      appointmentId,
      clientId: client.id,
      reason: "LATE_RESCHEDULE",
      actorId: client.id,
      lateFeeCents: config.lateFeeCents,
    });
    if (fee.created) await notifyLateFee(appointmentId, client.id, "LATE_RESCHEDULE", config.lateFeeCents);
    return { ok: true, feeApplied: fee.created };
  }
  return { ok: true, feeApplied: false };
}

// ---------------------------------------------------------------------------
// C13-PKG §5 — how a session becomes "complete". Auto on a timer (the jobs
// tick), reversible by her; no-show marking is hers alone.

export async function completeAppointment(appointmentId: string, actorId: string) {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt || appt.status !== "SCHEDULED") return { ok: false as const };
  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: "COMPLETED" },
  });
  await consumeCreditForAppointment(appointmentId, actorId, "COMPLETED");
  console.log(`[appointments] completed appt=${appointmentId} by=${actorId}`);
  return { ok: true as const };
}

export async function markNoShow(appointmentId: string, actorId: string) {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt || !appt.clientId) return { ok: false as const, feeApplied: false };
  if (appt.status !== "SCHEDULED" && appt.status !== "COMPLETED") {
    return { ok: false as const, feeApplied: false };
  }
  const config = await getOrCreateConfig(appt.practitionerId);
  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: "NO_SHOW" },
  });
  // The unpaid session charge dies (her time is compensated by the fee, not
  // the session bill); the credit releases — or consumes, if she flipped the
  // stricter config (never both fee and consumption by default — §5).
  await cancelChargeForAppointment(appointmentId, actorId);
  if (config.noShowConsumesCredit) {
    await consumeCreditForAppointment(appointmentId, actorId, "NO_SHOW");
  } else {
    await releaseCreditForAppointment(appointmentId, actorId, "NO_SHOW");
  }
  let feeApplied = false;
  if (config.lateFeeAutoApply && !config.noShowConsumesCredit) {
    const fee = await applyLateFee({
      appointmentId,
      clientId: appt.clientId,
      reason: "NO_SHOW",
      actorId,
      lateFeeCents: config.lateFeeCents,
    });
    feeApplied = fee.created;
    if (fee.created) await notifyLateFee(appointmentId, appt.clientId, "NO_SHOW", config.lateFeeCents);
  }
  console.log(`[appointments] no-show appt=${appointmentId} by=${actorId} fee=${feeApplied}`);
  return { ok: true as const, feeApplied };
}

// "Didn't happen" — a quiet mutual non-event: no fee, credit back, bill gone.
export async function markDidntHappen(appointmentId: string, actorId: string) {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt) return { ok: false as const };
  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: "CANCELLED" },
  });
  await cancelChargeForAppointment(appointmentId, actorId);
  await releaseCreditForAppointment(appointmentId, actorId, "CANCELLED");
  return { ok: true as const };
}

// Reversal (mis-tap): back to SCHEDULED; a consumed or released credit
// returns to RESERVED. A no-show fee, if created, stays visible — one-tap
// Waive is the honest undo for money.
export async function revertAppointmentStatus(appointmentId: string, actorId: string) {
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt || (appt.status !== "COMPLETED" && appt.status !== "NO_SHOW")) {
    return { ok: false as const };
  }
  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: "SCHEDULED" },
  });
  await unconsumeCreditForAppointment(appointmentId, actorId);
  const credit = await prisma.sessionCredit.findUnique({ where: { appointmentId } });
  if (credit?.state === "RELEASED") {
    await prisma.sessionCredit.update({
      where: { id: credit.id },
      data: { state: "RESERVED", releasedAt: null, reason: "MANUAL", actorId },
    });
  }
  // The session charge, if it was cancelled by the marking, comes back DUE.
  await prisma.charge.updateMany({
    where: { appointmentId, kind: "SESSION", status: "CANCELED" },
    data: { status: "DUE", lastActionById: actorId },
  });
  return { ok: true as const };
}

type NotifyKind = "booked" | "rescheduled" | "cancelled";

// Email both parties on a change, with an .ics invite so the appointment can be
// added in one tap (covers the subscribed feed's refresh lag). Never throws —
// a failed email must not fail the booking (spec §7). The client's email
// renders in their language (AMD-05); hers stays in hers.
async function notify(appointmentId: string, kind: NotifyKind): Promise<void> {
  try {
    const appt = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: { client: { select: { name: true, email: true, locale: true } } },
    });
    if (!appt) return;
    // Session notifications only — discovery calls (no client User) send their
    // own emails from lib/discovery.ts.
    if (!appt.client) return;
    const practitioner = await prisma.user.findFirst({
      where: { id: appt.practitionerId },
      select: { name: true, email: true },
    });
    const config = await getOrCreateConfig(appt.practitionerId);
    const label = clientLabel(appt.client);
    const locale = pickLocale(appt.client.locale);
    const when = `${formatInZone(appt.startAt, config.timezone, {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      locale: locale === "es" ? "es-419" : "en-US",
    })} ${zoneAbbrev(appt.startAt, config.timezone)}`;
    const whenEn = `${formatInZone(appt.startAt, config.timezone, {
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
        subject: `Session ${verb} — ${label}, ${whenEn}`,
        text:
          `A session with ${label} was ${verb}.\n\n` +
          `When: ${whenEn}\n` +
          `Where: ${appt.location === "VIRTUAL" ? appt.videoUrl || "Virtual" : "In person"}\n` +
          (appt.clientNote ? `Topic: ${appt.clientNote}\n` : "") +
          (kind === "cancelled" ? "" : "\nThe attached invite adds it to your calendar."),
        attachments,
      });
    }

    // Client — their confirmation / update, in their language.
    if (appt.client.email) {
      const mail = sessionEmail(kind, locale, {
        when,
        videoUrl: kind !== "cancelled" && appt.location === "VIRTUAL" ? appt.videoUrl : null,
      });
      await sendEmail({ to: appt.client.email, subject: mail.subject, text: mail.text, attachments });
    }
  } catch (err) {
    console.error("[appointments] notify failed", err instanceof Error ? err.message : "unknown");
  }
}

// C10-POLICY §6 — the fee, stated plainly once to the client (their language)
// and to her through the normal notification path, with the reason.
async function notifyLateFee(
  appointmentId: string,
  clientId: string,
  reason: "LATE_RESCHEDULE" | "LATE_CANCEL" | "NO_SHOW",
  feeCents: number,
): Promise<void> {
  try {
    const client = await prisma.user.findUnique({
      where: { id: clientId },
      select: { name: true, email: true, locale: true },
    });
    if (!client) return;
    const amount = formatMoney(feeCents);
    if (client.email) {
      const mail = lateFeeEmail(pickLocale(client.locale), { amount, reason });
      await sendEmail({ to: client.email, subject: mail.subject, text: mail.text });
    }
    const practitioner = await prisma.user.findFirst({
      where: { role: "PRACTITIONER" },
      select: { email: true },
    });
    if (practitioner?.email) {
      const reasonLabel =
        reason === "NO_SHOW" ? "no-show" : reason === "LATE_CANCEL" ? "late cancellation" : "late reschedule";
      await sendEmail({
        to: practitioner.email,
        subject: `Late-change fee applied — ${clientLabel(client)}`,
        text:
          `A ${amount} fee was applied for ${clientLabel(client)} (${reasonLabel}).\n\n` +
          `It's in the ledger under Awaiting — Waive is one tap if you'd rather let it go.`,
      });
    }
  } catch {
    console.error(`[appointments] fee notify failed appt=${appointmentId}`);
  }
}
