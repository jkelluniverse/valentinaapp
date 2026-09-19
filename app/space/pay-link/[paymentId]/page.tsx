import { notFound, redirect } from "next/navigation";
import { requireClient } from "@/lib/auth-guards";
import { getTenant } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { SignatureRule, Eyebrow } from "@/components/brand";

// BILLING §3.3/§3.5 Phase B2 — the client's route into a Square-hosted
// checkout. A healthy connection redirects straight to Square; a connection
// that needs attention degrades to a calm, human message — never an error
// (the §3.3 graceful-unavailable rule). Strictly the client's own payment.

export const dynamic = "force-dynamic";

export default async function PayLinkPage({ params }: { params: { paymentId: string } }) {
  const user = await requireClient();
  const tenant = await getTenant();

  const payment = await prisma.payment.findFirst({
    where: { id: params.paymentId, clientId: user.id },
  });
  if (!payment) notFound();

  const checkoutUrl = (payment.raw as { checkoutUrl?: string } | null)?.checkoutUrl;
  const account = await prisma.connectedPaymentAccount.findFirst({
    where: { tenantId: tenant.id },
    select: { status: true },
  });

  if (payment.status === "PENDING" && account?.status === "CONNECTED" && checkoutUrl) {
    redirect(checkoutUrl);
  }

  const amount = new Intl.NumberFormat("en-US", { style: "currency", currency: payment.currency }).format(
    payment.amountCents / 100
  );

  return (
    <div className="mx-auto flex min-h-[50vh] max-w-md flex-col justify-center gap-4 py-10">
      <Eyebrow>Payment</Eyebrow>
      {payment.status === "COMPLETED" ? (
        <>
          <h1 className="text-[1.75rem] font-semibold">All settled — thank you</h1>
          <SignatureRule />
          <p className="text-lg leading-relaxed text-ink">
            Your {amount} payment{payment.purpose !== "external" ? ` for ${payment.purpose}` : ""} went
            through. Nothing more to do.
          </p>
        </>
      ) : (
        <>
          <h1 className="text-[1.75rem] font-semibold">One small pause</h1>
          <SignatureRule />
          <p className="text-lg leading-relaxed text-ink">
            Online payment is temporarily unavailable — reach out to {tenant.displayName} and
            they&apos;ll sort it with you directly.
          </p>
        </>
      )}
    </div>
  );
}
