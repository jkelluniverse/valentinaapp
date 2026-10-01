import Link from "next/link";
import { getTenant } from "@/lib/tenancy";
import { getBillingView } from "@/lib/billing/state";

// BILLING §4.4 — the practitioner-facing billing posture, one quiet line.
// Renders nothing for ACTIVE (and therefore never for Valentina/FOUNDING_
// COMP). Clients never see any of this, anywhere.

export async function BillingStatusBanner() {
  const tenant = await getTenant();
  const view = await getBillingView(tenant.id).catch(() => null);
  if (!view || view.status === "ACTIVE") return null;

  const copy =
    view.status === "PAST_DUE"
      ? "Payment issue — update your card and everything continues uninterrupted."
      : view.status === "SUSPENDED"
        ? "New activity is paused over a billing issue — everything here stays safe and readable."
        : "This plan has ended — your practice data stays yours, readable and exportable.";

  return (
    <div className="mb-6 flex flex-wrap items-center gap-3 rounded-md border border-mocha bg-blush px-4 py-2.5 text-sm text-wine">
      <span>{copy}</span>
      <Link
        href="/practitioner/settings/billing"
        className="font-medium underline underline-offset-4 hover:text-wine-dark"
      >
        Manage billing →
      </Link>
    </div>
  );
}
