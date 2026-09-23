import { prisma } from "@/lib/prisma";
import { decryptToken } from "./crypto";
import { SquarePaymentProvider, fetchMainLocationId } from "./square";
import type { ConnectedAccountRef } from "./types";

// CLAUDE-BILLING §3.5 — one-off checkout links (Phase B2). Square-hosted
// quick pay: zero PCI surface, no card UI of ours. The pending Payment row
// is created HERE, keyed on the provider order id, so the webhook can attach
// the completed payment to the right tenant + client.
//
// Valentina's env-legacy arrangement never reaches this path — her existing
// invoice/charge flows (lib/square.ts) are untouched (Rule 0.6).

export type CheckoutResult =
  | { ok: true; paymentId: string; url: string }
  | { ok: false; reason: "not-connected" | "needs-reconnect" };

export async function createCheckoutLink(args: {
  tenantId: string;
  clientId: string;
  purpose: string; // "session" | "package" | tenant-defined
  amountCents: number;
  description: string;
  redirectUrl: string;
}): Promise<CheckoutResult> {
  const row = await prisma.connectedPaymentAccount.findFirst({ where: { tenantId: args.tenantId } });
  if (!row) return { ok: false, reason: "not-connected" };
  // §3.3 — NEEDS_RECONNECT (or REVOKED) degrades gracefully, never errors.
  if (row.status !== "CONNECTED") return { ok: false, reason: "needs-reconnect" };

  const ref: ConnectedAccountRef = {
    tenantId: args.tenantId,
    provider: row.provider,
    merchantId: row.merchantId,
    locationId: row.locationId,
    accessToken: decryptToken(row.accessTokenEnc),
  };

  // Quick-pay links require a location; B1 connects didn't need one, so
  // backfill lazily from the provider and persist for next time.
  if (!ref.locationId) {
    ref.locationId = await fetchMainLocationId(ref.accessToken);
    if (!ref.locationId) return { ok: false, reason: "needs-reconnect" };
    await prisma.connectedPaymentAccount
      .update({ where: { id: row.id }, data: { locationId: ref.locationId } })
      .catch(() => undefined);
  }

  const provider = new SquarePaymentProvider();
  const { checkoutUrl, providerRef } = await provider.createCheckout({
    account: ref,
    amountCents: args.amountCents,
    currency: "USD",
    description: args.description,
    clientRef: args.clientId,
    redirectUrl: args.redirectUrl,
  });

  // Pending row, keyed on the order id until the webhook delivers the real
  // payment id. checkoutUrl rides in raw for the client-facing pay page.
  const payment = await prisma.payment.create({
    data: {
      tenantId: args.tenantId,
      clientId: args.clientId,
      provider: provider.name,
      providerPaymentId: `order:${providerRef}`,
      amountCents: args.amountCents,
      currency: "USD",
      purpose: args.purpose,
      status: "PENDING",
      occurredAt: new Date(),
      raw: { checkoutUrl, orderId: providerRef },
    },
  });
  return { ok: true, paymentId: payment.id, url: checkoutUrl };
}
