import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { PageHeader } from "@/components/PageHeader";
import { getOrCreateConfig, getPractitioner, formatInZone } from "@/lib/schedule";
import { LeadActions } from "./LeadActions";

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

export default async function LeadsPage() {
  await requirePractitioner();
  const [leads, practitioner] = await Promise.all([
    prisma.lead.findMany({
      orderBy: { createdAt: "desc" },
      include: { appointment: { select: { startAt: true, status: true } } },
      take: 200,
    }),
    getPractitioner(),
  ]);
  const config = practitioner ? await getOrCreateConfig(practitioner.id) : null;
  const tz = config?.timezone ?? "America/New_York";

  return (
    <div className="flex flex-col gap-4 md:gap-8">
      <PageHeader title="Leads" eyebrow="Your practice" />

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
