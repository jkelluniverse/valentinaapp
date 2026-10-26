import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { PageHeader } from "@/components/PageHeader";
import { PendingButton } from "@/components/PendingButton";
import { getOrCreateConfig, getPractitioner, formatInZone } from "@/lib/schedule";
import { formatMoney } from "@/lib/billing";
import { squareConfigured } from "@/lib/square";
import { LeadActions } from "./LeadActions";
import { sendLeadPackageInvoice } from "./actions";
import { isExternalAnswerKey, type IntakeAnswers } from "@/lib/booking-form";

export const dynamic = "force-dynamic";

// C18 §5 — a small, useful leads list. No pipeline theater: hairline rows with
// name, status, call date, and their note, plus the one conversion action.
const STATUS_LABEL: Record<string, string> = {
  NEW: "New",
  REQUESTED: "Call requested", // C40 — asked, not yet agreed
  SCHEDULED: "Call booked",
  COMPLETED: "Call done",
  CONVERTED: "Client",
  CLOSED: "Closed",
};

// C42 §2.3 — the practitioner reads `q`, the question AS IT WAS ASKED, never
// the live label (Rule 0.8). Her own form's answers and the external
// provider's are split by key: hers by fieldId, Calendly's under `ext:<n>`.
function parseAnswers(raw: unknown): { own: [string, { q: string; a: unknown }][]; ext: [string, { q: string; a: unknown }][] } {
  const own: [string, { q: string; a: unknown }][] = [];
  const ext: [string, { q: string; a: unknown }][] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { own, ext };
  for (const [k, v] of Object.entries(raw as IntakeAnswers)) {
    if (!v || typeof v !== "object" || typeof (v as { q?: unknown }).q !== "string") continue;
    (isExternalAnswerKey(k) ? ext : own).push([k, v as { q: string; a: unknown }]);
  }
  return { own, ext };
}
function showAnswer(a: unknown): string {
  if (Array.isArray(a)) return a.map(String).join(", ");
  if (typeof a === "boolean") return a ? "yes" : "no";
  return String(a ?? "");
}
function AnswerList({ rows }: { rows: [string, { q: string; a: unknown }][] }) {
  return (
    <dl className="mt-1 flex max-w-prose flex-col gap-0.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex flex-col sm:flex-row sm:gap-2">
          <dt className="text-slate">{v.q}</dt>
          <dd className="text-ink">{showAnswer(v.a)}</dd>
        </div>
      ))}
    </dl>
  );
}
// The provider comes from the appointment the external booking re-pointed the
// lead at (ingest.ts sets appointmentId), because `source` is FIRST-TOUCH by
// design (C37) — a lead her own form created and Calendly later booked still
// says "/book" there. Fall back to the source prefix for leads with no
// appointment, then to a generic heading.
function providerLabel(externalProvider: string | null | undefined, source: string | null): string {
  const p = (externalProvider ?? (source?.startsWith("external:") ? source.slice("external:".length) : "")).toLowerCase();
  return p === "calendly" ? "From Calendly" : p === "acuity" ? "From Acuity" : "From their booking tool";
}

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
      include: { appointment: { select: { startAt: true, status: true, externalProvider: true } } },
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
                {/* C42 — her questions, as asked; legacy leads (no snapshot) keep the note line. */}
                {(() => {
                  const { own, ext } = parseAnswers(lead.intakeAnswers);
                  return (
                    <>
                      {own.length > 0 ? (
                        <div data-c42="answers"><AnswerList rows={own} /></div>
                      ) : (
                        lead.note && <p className="mt-0.5 max-w-prose text-sm italic text-slate">“{lead.note}”</p>
                      )}
                      {ext.length > 0 && (
                        <div data-c42="external-answers" className="mt-1.5">
                          <p className="text-xs font-medium uppercase tracking-wide text-mocha">{providerLabel(lead.appointment?.externalProvider, lead.source)}</p>
                          <AnswerList rows={ext} />
                        </div>
                      )}
                    </>
                  );
                })()}
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
