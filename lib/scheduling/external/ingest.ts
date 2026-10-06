import { Prisma } from "@prisma/client";
import { rawPrisma } from "@/lib/prisma-internal";
import type { NormalisedBooking } from "./types";

// C37 — the shared apply step. Cross-tenant by nature (the tenant comes from
// the EVENT, never the request host), so this file uses the raw client
// deliberately and is allowlisted with that justification.
//
// SHAPED ON lib/billing/lifecycle.ts ON PURPOSE (ruling 195). That file is this
// codebase's WORKING precedent for webhook attribution:
//
//     tenant = the event's Stripe customer id, never the request host
//     unmatched customer -> acknowledged and dropped, never guessed into a tenant
//
// The contrast worth keeping in front of whoever reads this next: Square's OAuth
// callback resolves its tenant from the callback HOST, which is why it works for
// exactly one tenant and blocks every other. Same codebase, same week, opposite
// outcomes. Copy the Stripe one.

/** `applied: false` means the delivery was ACCEPTED but changed nothing yet, so
 *  it must NOT consume its idempotency claim — see withIdempotency. */
export type IngestResult = { status: number; note: string; applied?: boolean };

/** The idempotency lock, unchanged from the payments ingress: THE UNIQUE CREATE
 *  IS THE CLAIM. A duplicate delivery loses the race and stops; a processing
 *  failure DELETES the row so the provider's retry can reprocess rather than
 *  being swallowed forever as a duplicate. */
export async function withIdempotency(
  key: string,
  layer: string,
  work: () => Promise<IngestResult>,
): Promise<IngestResult> {
  try {
    await rawPrisma.webhookEvent.create({ data: { id: key, layer } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { status: 200, note: "duplicate event (already processed)" };
    }
    throw e;
  }
  let result: IngestResult;
  try {
    result = await work();
  } catch (e) {
    await rawPrisma.webhookEvent.delete({ where: { id: key } }).catch(() => undefined);
    throw e;
  }
  // A delivery that applied NOTHING releases its claim. Otherwise a webhook that
  // cannot be applied yet (Acuity carries ids but no times, so it needs an API
  // enrichment hop) would mark itself processed on first arrival and every
  // retry afterwards would be swallowed as a duplicate — the booking would
  // disappear in silence. Marking it processed is a claim that work was DONE.
  if (result.applied === false) {
    await rawPrisma.webhookEvent.delete({ where: { id: key } }).catch(() => undefined);
    return result;
  }
  await rawPrisma.webhookEvent.update({ where: { id: key }, data: { processedAt: new Date() } }).catch(() => undefined);
  return result;
}

/**
 * Apply a normalised booking to a tenant.
 *
 * RULING 193 — this creates an APPOINTMENT and a LIGHTWEIGHT CONTACT (Lead) and
 * NEVER a ClientProfile. A stranger filling in a Calendly form must not
 * manufacture a client record in a live practice.
 *
 * The invitee's answers land on `Lead.intakeAnswers`, which the AI's evidence
 * path CANNOT REACH: lib/client-record.ts builds the record from RecordItem by
 * clientId and from nothing else, so a Json column on Lead is uncitable BY
 * CONSTRUCTION until the practitioner promotes the material into a RecordItem.
 * That is ruling 198's boundary, and it is gated, not asserted in a comment.
 */
export async function applyBooking(
  booking: NormalisedBooking,
  tenantId: string,
  practitionerId: string,
): Promise<IngestResult> {
  const key = { externalProvider: booking.provider, externalId: booking.externalId };

  // RECONCILIATION. The unique (provider, externalId) pair is what makes a
  // reschedule MOVE the booking instead of forking it, and a cancellation
  // KEEPS the row — a cancellation is context, not an absence of context.
  const existing = await rawPrisma.appointment.findFirst({
    where: { externalProvider: booking.provider, externalId: booking.externalId },
  });

  if (booking.action === "canceled") {
    if (!existing) return { status: 200, note: "cancel for an unknown booking — ignored", applied: false };
    // AppointmentStatus spells it CANCELLED (two L's). TenantBillingStatus
    // spells it CANCELED (one). Both are live enums in this schema; neither is
    // being renamed here, because a rename is a migration and this is a feature.
    await rawPrisma.appointment.update({
      where: { id: existing.id },
      data: { status: "CANCELLED", externalPayload: booking.raw as Prisma.InputJsonValue, externalUpdatedAt: new Date() },
    });
    return { status: 200, note: `appointment ${existing.id} → CANCELLED` };
  }

  // A lightweight contact, upserted by email WITHIN the tenant. No email (which
  // Acuity's thin webhook can produce) means no contact — never a placeholder.
  let leadId: string | null = null;
  if (booking.invitee.email) {
    const email = booking.invitee.email.trim().toLowerCase();
    const priorLead = await rawPrisma.lead.findFirst({ where: { tenantId, email } });
    if (priorLead) {
      leadId = priorLead.id;
      // First-touch is preserved: an existing lead keeps its status and source.
      // Only the answers are refreshed, because the latest booking's answers are
      // the ones the practitioner is about to read.
      if (booking.intakeAnswers) {
        // C42 §3 — MERGE, never replace: the provider's answers live under
        // `ext:<n>` and are refreshed as a block; anything her own /book form
        // stored under its fieldIds stays. Both on one Lead, neither
        // overwriting the other. (Before C42 this replaced the whole column —
        // harmless then, because only Calendly ever wrote it.)
        const prior = (priorLead.intakeAnswers ?? {}) as Record<string, unknown>;
        const own = Object.fromEntries(Object.entries(prior).filter(([k]) => !k.startsWith("ext:")));
        await rawPrisma.lead.update({
          where: { id: priorLead.id },
          data: { intakeAnswers: { ...own, ...booking.intakeAnswers } as Prisma.InputJsonValue },
        });
      }
    } else {
      const created = await rawPrisma.lead.create({
        data: {
          tenantId,
          name: booking.invitee.name ?? email,
          email,
          phone: booking.invitee.phone,
          source: `external:${booking.provider}`,
          intakeAnswers: (booking.intakeAnswers ?? undefined) as Prisma.InputJsonValue | undefined,
        },
      });
      leadId = created.id;
    }
  }

  if (existing) {
    await rawPrisma.appointment.update({
      where: { id: existing.id },
      data: {
        startAt: booking.startAt ?? existing.startAt,
        endAt: booking.endAt ?? existing.endAt,
        status: "SCHEDULED",
        externalPayload: booking.raw as Prisma.InputJsonValue,
        externalUpdatedAt: new Date(),
      },
    });
    return { status: 200, note: `appointment ${existing.id} → rescheduled` };
  }

  // A booking with no times cannot become an appointment — Acuity's webhook
  // carries ids only, so the caller must enrich before applying. Stated as a
  // refusal rather than invented as a zero-length slot at the epoch.
  if (!booking.startAt || !booking.endAt) {
    return { status: 200, note: "booking has no times — enrichment required before apply", applied: false };
  }

  const appt = await rawPrisma.appointment.create({
    data: {
      tenantId,
      practitionerId,
      kind: "DISCOVERY",
      startAt: booking.startAt,
      endAt: booking.endAt,
      status: "SCHEDULED",
      bookedBy: "client",
      ...key,
      externalPayload: booking.raw as Prisma.InputJsonValue,
      externalUpdatedAt: new Date(),
    },
  });
  if (leadId) await rawPrisma.lead.update({ where: { id: leadId }, data: { appointmentId: appt.id } }).catch(() => undefined);
  return { status: 200, note: `appointment ${appt.id} created` };
}

/** RULING 197 — connection health is a FACT the practitioner reads, not an
 *  inference the platform draws. Successes record a timestamp and a count;
 *  only unambiguous breakage (a signature that will not verify, a provider
 *  401) sets NEEDS_ATTENTION. SILENCE IS REPORTED, NOT ALERTED ON. */
export async function recordSuccess(connectionId: string): Promise<void> {
  await rawPrisma.externalSchedulingConnection.update({
    where: { id: connectionId },
    data: { lastEventAt: new Date(), eventCount30d: { increment: 1 }, lastError: null, status: "CONNECTED" },
  }).catch(() => undefined);
}

export async function recordFailure(connectionId: string, reason: string): Promise<void> {
  await rawPrisma.externalSchedulingConnection.update({
    where: { id: connectionId },
    data: { lastErrorAt: new Date(), lastError: reason.slice(0, 300), status: "NEEDS_ATTENTION" },
  }).catch(() => undefined);
}
