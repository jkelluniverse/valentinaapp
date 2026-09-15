import { Prisma } from "@prisma/client";
import { rawPrisma } from "@/lib/prisma-internal";
import { SquarePaymentProvider } from "./square";
import type { PaymentEvent } from "./types";

// CLAUDE-BILLING §3.4 Phase B2 — Square webhook ingestion. Cross-tenant by
// nature (like lib/payments/refresh.ts): the event's merchant_id — not the
// request's host — decides which tenant the payment belongs to, so this file
// uses the raw client deliberately (allowlisted with justification).
//
// Guarantees:
//   · signature-verified before ANYTHING is read from the body (403 on fail)
//   · idempotent via WebhookEvent keyed on the provider event id — replaying
//     the same event changes nothing (unique-create is the lock)
//   · payment completion updates the pending `order:{id}` row created at
//     link time (attaching the real payment id), or records an unmatched
//     payment against the merchant's tenant with no client

export type IngestResult = { status: number; note: string };

export async function ingestSquareEvent(
  headers: Record<string, string>,
  rawBody: string
): Promise<IngestResult> {
  const provider = new SquarePaymentProvider();
  let event;
  try {
    event = await provider.verifyAndParseWebhook({ headers, body: rawBody });
  } catch {
    return { status: 403, note: "bad signature" };
  }
  if (!event) return { status: 200, note: "ignored (not a payment event)" };

  const envelope = event.raw as { event_id?: string; merchant_id?: string };
  const eventId = envelope.event_id;
  if (!eventId) return { status: 200, note: "ignored (no event id)" };

  // Idempotency lock: the unique create IS the claim. A duplicate delivery
  // loses the race here and stops.
  try {
    await rawPrisma.webhookEvent.create({ data: { id: eventId, layer: "square" } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { status: 200, note: "duplicate event (already processed)" };
    }
    throw e;
  }

  let result: IngestResult;
  try {
    result = await applyEvent(event);
  } catch (e) {
    // Release the lock so the provider's retry can reprocess — otherwise a
    // transient failure would be swallowed forever as a "duplicate".
    await rawPrisma.webhookEvent.delete({ where: { id: eventId } }).catch(() => undefined);
    throw e;
  }
  await rawPrisma.webhookEvent
    .update({ where: { id: eventId }, data: { processedAt: new Date() } })
    .catch(() => undefined);
  return result;
}

async function applyEvent(event: PaymentEvent): Promise<IngestResult> {
  const envelope = event.raw as { event_id?: string; merchant_id?: string };
  {
    // merchant_id → tenant. Events for merchants we don't hold a connection
    // for are acknowledged and dropped (never guessed into a tenant).
    const account = envelope.merchant_id
      ? await rawPrisma.connectedPaymentAccount.findFirst({ where: { merchantId: envelope.merchant_id } })
      : null;
    if (!account?.tenantId) {
      return { status: 200, note: "ignored (unmatched merchant)" };
    }

    const keys = [event.providerPaymentId];
    if (event.orderRef) keys.push(`order:${event.orderRef}`);
    const existing = await rawPrisma.payment.findFirst({
      where: { tenantId: account.tenantId, providerPaymentId: { in: keys } },
    });

    if (existing) {
      const raw = (existing.raw ?? {}) as Record<string, unknown>;
      await rawPrisma.payment.update({
        where: { id: existing.id },
        data: {
          providerPaymentId: event.providerPaymentId,
          status: event.status,
          amountCents: event.amountCents || existing.amountCents,
          currency: event.currency,
          occurredAt: event.occurredAt,
          raw: { ...raw, lastEvent: event.raw } as Prisma.InputJsonValue,
        },
      });
      return { status: 200, note: `payment ${existing.id} → ${event.status}` };
    }

    // A payment we didn't originate (e.g. taken directly in Square) — still
    // ledger it for the tenant, unattributed to a client.
    await rawPrisma.payment.create({
      data: {
        tenantId: account.tenantId,
        clientId: null,
        provider: "square",
        providerPaymentId: event.providerPaymentId,
        amountCents: event.amountCents,
        currency: event.currency,
        purpose: "external",
        status: event.status,
        occurredAt: event.occurredAt,
        raw: { lastEvent: event.raw } as Prisma.InputJsonValue,
      },
    });
    return { status: 200, note: "external payment recorded" };
  }
}
