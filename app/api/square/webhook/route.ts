import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifySquareSignature } from "@/lib/square";

// Square webhook (C13.5/6). Signature-verified; idempotent; metadata-only
// logging (event type + ids — never amounts). Two jobs:
// 1. payment carrying our charge id (reference_id) → confirm that charge PAID.
// 2. payment taken outside the app (POS/reader/invoice) → stash it as an
//    ExternalPayment for one-tap matching in the ledger.
export const dynamic = "force-dynamic";

type PaymentEvent = {
  type?: string;
  data?: {
    object?: {
      payment?: {
        id?: string;
        status?: string;
        reference_id?: string;
        customer_id?: string;
        amount_money?: { amount?: number; currency?: string };
      };
    };
  };
};

export async function POST(req: Request) {
  const raw = await req.text();
  const h = headers();

  // The signature covers the exact public notification URL Square calls.
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  const notificationUrl = `${proto}://${host}/api/square/webhook`;
  const signature = h.get("x-square-hmacsha256-signature");

  if (!verifySquareSignature(raw, signature, notificationUrl)) {
    return new NextResponse("Bad signature", { status: 401 });
  }

  let event: PaymentEvent;
  try {
    event = JSON.parse(raw) as PaymentEvent;
  } catch {
    return new NextResponse("Bad payload", { status: 400 });
  }

  if (event.type !== "payment.created" && event.type !== "payment.updated") {
    return NextResponse.json({ ok: true }); // not ours — acknowledge and move on
  }

  const payment = event.data?.object?.payment;
  if (!payment?.id) return NextResponse.json({ ok: true });
  console.log(`[square-webhook] ${event.type} payment=${payment.id} status=${payment.status}`);

  if (payment.status !== "COMPLETED") return NextResponse.json({ ok: true });

  // 1. Our charge? reference_id carries the charge id we set on CreatePayment.
  if (payment.reference_id) {
    const charge = await prisma.charge.findUnique({ where: { id: payment.reference_id } });
    if (charge && charge.status !== "PAID") {
      await prisma.charge.update({
        where: { id: charge.id },
        data: {
          status: "PAID",
          paidAt: new Date(),
          paidVia: charge.paidVia ?? "portal-card",
          squarePaymentId: payment.id,
          lastActionById: "square-webhook",
        },
      });
    }
    if (charge) return NextResponse.json({ ok: true });
  }

  // Already linked to a charge some other way? Done.
  const linked = await prisma.charge.findUnique({ where: { squarePaymentId: payment.id } });
  if (linked) return NextResponse.json({ ok: true });

  // 2. An outside-the-app payment — surface it for one-tap matching.
  await prisma.externalPayment.upsert({
    where: { squarePaymentId: payment.id },
    create: {
      squarePaymentId: payment.id,
      squareCustomerId: payment.customer_id ?? null,
      amountCents: payment.amount_money?.amount ?? 0,
      currency: payment.amount_money?.currency ?? "USD",
      status: payment.status ?? "COMPLETED",
    },
    update: { status: payment.status ?? "COMPLETED" },
  });

  return NextResponse.json({ ok: true });
}
