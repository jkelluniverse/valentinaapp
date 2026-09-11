import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePractitioner } from "@/lib/auth-guards";
import { getTenant } from "@/lib/tenancy";
import { getBillingView } from "@/lib/billing/state";
import { createPortalSession, stripeConfigured } from "@/lib/billing/stripe";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { PendingButton } from "@/components/PendingButton";

// BILLING §4.3 — the tenant's plan & billing page. One button: Manage
// billing → Stripe's hosted Customer Portal (card updates, invoices,
// receipts — all Stripe-hosted, nothing built here). Practitioner-only by
// route; clients never see billing language anywhere (§B4 copy rule).
// FOUNDING_COMP (Valentina) never touches Stripe.

export const dynamic = "force-dynamic";

const STATUS_COPY: Record<string, { label: string; tone: "ok" | "warn" }> = {
  ACTIVE: { label: "Active", tone: "ok" },
  PAST_DUE: { label: "Payment issue", tone: "warn" },
  SUSPENDED: { label: "Paused — billing needs attention", tone: "warn" },
  CANCELED: { label: "Canceled", tone: "warn" },
};

export default async function BillingSettingsPage({
  searchParams,
}: {
  searchParams: { billing?: string };
}) {
  await requirePractitioner();
  const tenant = await getTenant();
  const view = await getBillingView(tenant.id);
  const status = STATUS_COPY[view.status];

  async function manageBilling() {
    "use server";
    await requirePractitioner();
    const { getTenant: gt } = await import("@/lib/tenancy");
    const t = await gt();
    const { getBillingView: gv } = await import("@/lib/billing/state");
    const v = await gv(t.id);
    if (!v.stripeCustomerId || !stripeConfigured()) {
      redirect("/practitioner/settings/billing?billing=noportal");
    }
    const { getBaseUrlSafe } = await import("@/lib/base-url");
    const url = await createPortalSession(
      v.stripeCustomerId!,
      `${getBaseUrlSafe()}/practitioner/settings/billing`
    ).catch(() => null);
    if (!url) redirect("/practitioner/settings/billing?billing=portalfail");
    redirect(url!);
  }

  return (
    <div className="flex flex-col gap-8">
      <Link href="/practitioner/settings" className="text-[13px] text-whisper underline-offset-4 hover:text-wine hover:underline">
        ← settings
      </Link>
      <div className="flex flex-col gap-2">
        <Eyebrow>Plan &amp; billing</Eyebrow>
        <h1 className="font-headline text-[2rem] font-medium text-ink-strong">Your plan</h1>
        <SignatureRule />
      </div>

      {searchParams.billing === "portalfail" && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          The billing portal didn&apos;t open — try again in a moment.
        </p>
      )}

      {view.comped ? (
        <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-6 shadow-card">
          <p className="font-medium text-ink-strong">Founding partner — no platform charges</p>
          <p className="max-w-prose text-sm text-slate">
            Your practice runs on a founding arrangement. There&apos;s nothing to manage here.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-6 shadow-card">
          <div className="flex flex-col gap-1">
            <p className="font-medium text-ink-strong">{view.planLabel}</p>
            <p className="text-sm">
              <span className={status.tone === "ok" ? "text-slate" : "font-medium text-wine"}>{status.label}</span>
              {view.currentPeriodEnd && view.status === "ACTIVE" && (
                <span className="text-slate"> · renews {view.currentPeriodEnd.toISOString().slice(0, 10)}</span>
              )}
              {view.graceUntil && view.status === "PAST_DUE" && (
                <span className="text-slate"> · grace until {view.graceUntil.toISOString().slice(0, 10)}</span>
              )}
            </p>
            {view.status === "PAST_DUE" && (
              <p className="max-w-prose text-sm text-slate">
                A payment didn&apos;t go through — update your card and everything continues
                uninterrupted. Your practice keeps working in the meantime.
              </p>
            )}
            {(view.status === "SUSPENDED" || view.status === "CANCELED") && (
              <p className="max-w-prose text-sm text-slate">
                Everything you and your clients have made stays safe and readable, and exports
                work as always. New invites and new session processing resume the moment billing
                is settled.
              </p>
            )}
          </div>
          <form action={manageBilling}>
            <PendingButton className="rounded-lg bg-wine px-5 py-2.5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-wine-dark">
              Manage billing
            </PendingButton>
          </form>
          <p className="text-[13px] text-slate">
            Card updates, invoices, and receipts open in Stripe&apos;s secure portal.
          </p>
        </div>
      )}
    </div>
  );
}
