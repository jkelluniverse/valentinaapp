import { prisma } from "@/lib/prisma";
import { getTenant } from "@/lib/tenancy";

// CLAUDE-BILLING §3.3 — the NEEDS_RECONNECT surface: quiet, specific, one
// tap. Renders nothing unless this tenant's OAuth connection actually
// needs attention (her env-based setup never does).

export async function PaymentsReconnectBanner() {
  const tenant = await getTenant();
  const row = await prisma.connectedPaymentAccount
    .findFirst({ where: { tenantId: tenant.id }, select: { status: true } })
    .catch(() => null);
  if (row?.status !== "NEEDS_RECONNECT") return null;
  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-md border border-mocha bg-blush px-4 py-2.5 text-sm text-wine">
      <span>Your Square connection needs a quick re-connect.</span>
      <a href="/api/payments/square/start" className="font-medium underline underline-offset-4 hover:text-wine-dark">
        Reconnect →
      </a>
    </div>
  );
}
