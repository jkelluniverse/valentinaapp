import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { PageHeader } from "@/components/PageHeader";
import { PendingButton } from "@/components/PendingButton";
import { getOrCreateConfig, getPractitioner, formatInZone } from "@/lib/schedule";
import { formatMoney } from "@/lib/billing";
import { squareConfigured } from "@/lib/square";
import { LeadActions } from "./LeadActions";
import { sendLeadPackageInvoice } from "./actions";

export const dynamic = "force-dynamic";

// C18 §5 — a small, useful leads list. No pipeline theater: hairline rows with
// name, status, call date, and their note, plus the one conversion action.
const STATUS_LABEL: Record<string, string> = {
  NEW: "New",
  SCHEDULED: "Call booked",
  COMPLETED: "Call done",
  CONVERTED: "Client",
  CLOSED: "Closed",
};

const INVOICE_BANNERS: Record<string, string> = {
  sent: "Sent — Square emailed the invoice. When it's paid, the package activates on its own.",
  failed: "The invoice couldn't be sent just now — nothing was recorded; try again in a moment.",
  bad: "Pick a package to invoice.",
  square: "Square couldn't place this person just now — try again in a moment.",
  config: "Square isn't connected yet, so invoices can't be sent from here.",
};

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: { invoice?: string };
}) {
  await requirePractitioner();
  const [leads, practitioner, packageSkus] = await Promise.all([
    prisma.lead.findMany({
      orderBy: { createdAt: "desc" },
      include: { appointment: { select: { startAt: true, status: true } } },
      take: 200,
    }),
    getPractitioner(),
    prisma.priceBook.findMany({
      where: { active: true, kind: "PACKAGE" },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const config = practitioner ? await getOrCreateConfig(practitioner.id) : null;
  const tz = config?.timezone ?? "America/New_York";
  const canInvoice = squareConfigured() && packageSkus.length > 0;

  return (
    <div className="flex flex-col gap-4 md:gap-8">
      <PageHeader title="Leads" eyebrow="Your practice" />

      {searchParams.invoice && INVOICE_BANNERS[searchParams.invoice] && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          {INVOICE_BANNERS[searchParams.invoice]}
        </p>
      )}

      {leads.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate">
          No leads yet. When someone books a discovery call from your site, they&apos;ll appear here.
        </p>
      ) : (
        <ul className="-mx-4 flex flex-col divide-y divide-line md:mx-0">
          {leads.map((lead) => (
            <li
              key={lead.id}
              className="flex min-h-[52px] flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between md:px-2"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink-strong">{lead.name}</span>
                  <span className="rounded-full border border-mocha px-2 py-0.5 text-xs font-medium text-mocha">
                    {STATUS_LABEL[lead.status] ?? lead.status}
                  </span>
                  {lead.appointment?.startAt && lead.appointment.status === "SCHEDULED" && (
                    <span className="text-xs text-slate">
                      {formatInZone(lead.appointment.startAt, tz, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  )}
                </div>
                <p className="truncate text-sm text-slate">
                  {lead.email}
                  {lead.phone ? ` · ${lead.phone}` : ""}
                </p>
                {lead.note && (
                  <p className="mt-0.5 max-w-prose text-sm italic text-slate">“{lead.note}”</p>
                )}
                {/* C13-PKG §8 — sell a package post-discovery, pre-portal. */}
                {canInvoice && (lead.status === "SCHEDULED" || lead.status === "COMPLETED") && (
                  <details className="mt-1.5">
                    <summary className="cursor-pointer list-none text-xs font-medium text-slate underline-offset-4 hover:text-wine hover:underline">
                      Send package invoice
                    </summary>
                    <form
                      action={sendLeadPackageInvoice.bind(null, lead.id)}
                      className="mt-2 flex flex-wrap items-center gap-2"
                    >
                      <select
                        name="priceBookId"
                        className="rounded-md border border-line bg-white px-2.5 py-1.5 text-xs text-ink"
                      >
                        {packageSkus.map((sku) => (
                          <option key={sku.id} value={sku.id}>
                            {sku.name} · {formatMoney(sku.amountCents, sku.currency)}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        name="note"
                        placeholder="A note, in your voice (optional)"
                        className="w-56 rounded-md border border-line bg-white px-2.5 py-1.5 text-xs text-ink"
                      />
                      <PendingButton className="rounded-pill border border-wine/40 px-3 py-1 text-xs font-medium text-wine transition-colors hover:bg-wine hover:text-white">
                        Send
                      </PendingButton>
                    </form>
                  </details>
                )}
              </div>
              <div className="shrink-0 sm:pl-4">
                <LeadActions leadId={lead.id} converted={lead.status === "CONVERTED"} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
