import { Prisma } from "@prisma/client";
import { rawPrisma } from "@/lib/prisma-internal";
import { verifyStripeSignature } from "./stripe";

// BILLING §4.4/§4.5 — the webhook-driven status lifecycle. Cross-tenant by
// nature (tenant = the event's Stripe customer id, never the request host),
// so this file uses the raw client deliberately (allowlisted).
//
//   invoice.paid                  → ACTIVE, graceUntil cleared
//   invoice.payment_failed        → PAST_DUE, graceUntil = now + 14 days
//   customer.subscription.deleted → CANCELED
//   (grace expiry → SUSPENDED happens in the daily tick sweep, not here)
//
// Same idempotency contract as the Square ingress: WebhookEvent unique-
// create is the lock; a processing failure releases it for the retry.

const GRACE_DAYS = 14;

export type StripeIngestResult = { status: number; note: string };

export async function ingestStripeEvent(
  headers: Record<string, string>,
  rawBody: string
): Promise<StripeIngestResult> {
  const sig = headers["stripe-signature"] ?? "";
  if (!verifyStripeSignature(rawBody, sig)) return { status: 403, note: "bad signature" };

  let event: { id?: string; type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(rawBody);
  } catch {
    return { status: 400, note: "malformed body" };
  }
  const eventId = event.id;
  if (!eventId || !event.type) return { status: 200, note: "ignored (no id/type)" };

  const HANDLED = new Set(["invoice.paid", "invoice.payment_failed", "customer.subscription.deleted"]);
  if (!HANDLED.has(event.type)) return { status: 200, note: `ignored (${event.type})` };

  try {
    await rawPrisma.webhookEvent.create({ data: { id: eventId, layer: "stripe" } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { status: 200, note: "duplicate event (already processed)" };
    }
    throw e;
  }

  let result: StripeIngestResult;
  try {
    result = await applyEvent(event.type, event.data?.object ?? {});
  } catch (e) {
    await rawPrisma.webhookEvent.delete({ where: { id: eventId } }).catch(() => undefined);
    throw e;
  }
  await rawPrisma.webhookEvent
    .update({ where: { id: eventId }, data: { processedAt: new Date() } })
    .catch(() => undefined);
  return result;
}

async function applyEvent(type: string, obj: Record<string, unknown>): Promise<StripeIngestResult> {
  const customerId = typeof obj.customer === "string" ? obj.customer : null;
  if (!customerId) return { status: 200, note: "ignored (no customer)" };
  const row = await rawPrisma.tenantBilling.findUnique({ where: { stripeCustomerId: customerId } });
  if (!row) return { status: 200, note: "ignored (unmatched customer)" };

  if (type === "invoice.paid") {
    const periodEnd = typeof obj.period_end === "number" ? new Date(obj.period_end * 1000) : row.currentPeriodEnd;
    await rawPrisma.tenantBilling.update({
      where: { id: row.id },
      data: { status: "ACTIVE", graceUntil: null, currentPeriodEnd: periodEnd },
    });
    return { status: 200, note: `tenant ${row.tenantId} → ACTIVE` };
  }
  if (type === "invoice.payment_failed") {
    await rawPrisma.tenantBilling.update({
      where: { id: row.id },
      data: { status: "PAST_DUE", graceUntil: new Date(Date.now() + GRACE_DAYS * 86400_000) },
    });
    return { status: 200, note: `tenant ${row.tenantId} → PAST_DUE (grace ${GRACE_DAYS}d)` };
  }
  // customer.subscription.deleted
  await rawPrisma.tenantBilling.update({
    where: { id: row.id },
    data: { status: "CANCELED", graceUntil: null },
  });
  return { status: 200, note: `tenant ${row.tenantId} → CANCELED` };
}

// §4.4 — the daily sweep: PAST_DUE past its grace window becomes SUSPENDED.
// FOUNDING_COMP rows never have graceUntil, so they can never trip this.
export async function sweepBillingGrace(): Promise<{ suspended: number }> {
  const res = await rawPrisma.tenantBilling.updateMany({
    where: { status: "PAST_DUE", graceUntil: { lt: new Date() } },
    data: { status: "SUSPENDED" },
  });
  return { suspended: res.count };
}
