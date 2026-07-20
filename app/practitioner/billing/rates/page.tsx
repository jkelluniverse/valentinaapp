import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { PageHeader } from "@/components/PageHeader";
import { formatMoney } from "@/lib/billing";
import { PROGRAM_STAGES, programStageLabel } from "@/lib/program-config";
import { addRate, retireRate } from "../actions";

export const dynamic = "force-dynamic";

// BILLING-DASH §3 — configuration is not daily work. The rates & packages
// editor lives here, one tap off the dashboard.

const BANNERS: Record<string, string> = {
  rate: "Rate added.",
  badrate: "A name and an amount above zero are both needed.",
  badpackage: "A package needs how many sessions it includes (a whole number).",
};

export default async function RatesPage({
  searchParams,
}: {
  searchParams: { billing?: string };
}) {
  await requirePractitioner();
  const rates = await prisma.priceBook.findMany({
    where: { active: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <PageHeader
        title="Rates & packages"
        eyebrow="Billing · settings"
        lede="New bookings are billed at the newest matching rate — a stage rate for clients in that stage, otherwise the general one. Packages appear in the client portal under “Continue our work”."
      />

      {searchParams.billing && BANNERS[searchParams.billing] && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          {BANNERS[searchParams.billing]}
        </p>
      )}

      <section className="rounded-lg border border-line bg-white p-6 shadow-soft">
        {rates.length > 0 && (
          <ul className="mb-4 flex flex-col gap-2">
            {rates.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-line/70 px-4 py-2.5 text-sm"
              >
                <span className="font-medium text-ink-strong">{r.name}</span>
                <span className="text-ink">{formatMoney(r.amountCents, r.currency)}</span>
                {r.kind === "PACKAGE" && (
                  <span className="rounded-full bg-blush-deep px-2 py-0.5 text-xs font-medium text-wine">
                    {r.sessionsIncluded ?? "?"} session{r.sessionsIncluded === 1 ? "" : "s"}
                  </span>
                )}
                {r.stage && (
                  <span className="rounded-full border border-mocha px-2 py-0.5 text-xs font-medium text-mocha">
                    {programStageLabel(r.stage)}
                  </span>
                )}
                <form action={retireRate.bind(null, r.id)} className="ml-auto">
                  <button className="text-sm font-medium text-slate underline-offset-4 hover:text-wine hover:underline">
                    Retire
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={addRate} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-strong">Kind</span>
            <select name="kind" className="rounded-md border border-line px-3 py-2 text-ink">
              <option value="SESSION">Session rate</option>
              <option value="PACKAGE">Package</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-strong">Name</span>
            <input
              type="text"
              name="name"
              placeholder="Standard session · 6-session package"
              required
              className="rounded-md border border-line px-3 py-2 text-ink"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-strong">Amount (USD)</span>
            <input
              type="number"
              name="amount"
              min={1}
              step="0.01"
              required
              className="w-32 rounded-md border border-line px-3 py-2 text-ink"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-strong">
              Sessions <span className="font-normal text-slate">(packages)</span>
            </span>
            <input
              type="number"
              name="sessions"
              min={1}
              step={1}
              placeholder="3 · 6 · 9"
              className="w-24 rounded-md border border-line px-3 py-2 text-ink"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-strong">
              Stage <span className="font-normal text-slate">(session rates)</span>
            </span>
            <select name="stage" className="rounded-md border border-line px-3 py-2 text-ink">
              <option value="">Any stage</option>
              {PROGRAM_STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <button className="rounded-md bg-wine px-4 py-2 text-sm font-medium text-cream transition-colors hover:bg-wine/90">
            Add
          </button>
        </form>
      </section>

      <Link
        href="/practitioner/billing"
        className="self-start text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
      >
        Back to Billing
      </Link>
    </div>
  );
}
