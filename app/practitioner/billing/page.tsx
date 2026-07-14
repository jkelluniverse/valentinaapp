import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { PageHeader } from "@/components/PageHeader";
import { ledgerSummary, formatMoney } from "@/lib/billing";
import { PROGRAM_STAGES, programStageLabel } from "@/lib/program-config";
import { squareConfigured } from "@/lib/square";
import { getPractitioner, getOrCreateConfig, formatInZone } from "@/lib/schedule";
import { clientLabel } from "@/lib/appointments";
import {
  markChargePaid,
  waiveCharge,
  remindCharge,
  billAppointment,
  addRate,
  retireRate,
  matchExternalPayment,
} from "./actions";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

const BANNERS: Record<string, string> = {
  paid: "Marked paid.",
  waived: "Waived — noted with your name.",
  reminded: "A gentle note is on its way.",
  noemail: "Reminders need the email provider set up (RESEND_API_KEY).",
  billed: "Charge created at the current rate.",
  norate: "No rate matched — add one below, then bill it again.",
  rate: "Rate added.",
  badrate: "A name and an amount above zero are both needed.",
  matched: "Matched — the session shows as paid.",
};

export default async function BillingPage({
  searchParams,
}: {
  searchParams: { billing?: string };
}) {
  await requirePractitioner();
  const practitioner = await getPractitioner();
  const config = practitioner ? await getOrCreateConfig(practitioner.id) : null;
  const now = new Date();

  const [summary, awaiting, recent, rates, externals, clients] = await Promise.all([
    ledgerSummary(now),
    prisma.charge.findMany({
      where: { status: { in: ["DUE", "PENDING"] } },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
    }),
    prisma.charge.findMany({
      where: { status: "PAID" },
      orderBy: { paidAt: "desc" },
      take: 15,
    }),
    prisma.priceBook.findMany({ where: { active: true }, orderBy: { createdAt: "desc" } }),
    prisma.externalPayment.findMany({
      where: { matchedChargeId: null },
      orderBy: { receivedAt: "desc" },
    }),
    prisma.user.findMany({
      where: { role: "CLIENT" },
      select: { id: true, name: true, email: true },
    }),
  ]);

  const clientById = new Map(clients.map((c) => [c.id, c]));
  const nameOf = (id: string) => {
    const c = clientById.get(id);
    return c ? clientLabel(c) : "Unknown";
  };

  // Unbilled sessions: booked but no charge (e.g. before rates existed).
  const chargedApptIds = new Set(
    (await prisma.charge.findMany({
      where: { appointmentId: { not: null } },
      select: { appointmentId: true },
    })).map((c) => c.appointmentId!),
  );
  const unbilled = (
    await prisma.appointment.findMany({
      // C18 — only billable sessions; free discovery calls are never "unbilled".
      where: {
        kind: "SESSION",
        status: { in: ["SCHEDULED", "COMPLETED"] },
        startAt: { gte: new Date(now.getTime() - 60 * DAY) },
      },
      orderBy: { startAt: "asc" },
    })
  ).filter((a) => !chargedApptIds.has(a.id));

  const aging = awaiting.filter(
    (c) => c.dueAt && now.getTime() - c.dueAt.getTime() > 7 * DAY,
  );

  const fmtWhen = (d: Date | null) =>
    d && config
      ? formatInZone(d, config.timezone, { month: "short", day: "numeric" })
      : d?.toISOString().slice(0, 10) ?? "—";

  return (
    <div className="flex flex-col gap-4 md:gap-8">
      <PageHeader
        title="Billing"
        eyebrow="Your practice"
        lede="Your ledger — Square remains the money's home; this mirrors it for practice context."
      />

      {searchParams.billing && BANNERS[searchParams.billing] && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          {BANNERS[searchParams.billing]}
        </p>
      )}

      {!squareConfigured() && (
        <p className="rounded-md border border-mocha bg-white px-4 py-3 text-sm text-wine">
          Square isn&apos;t connected yet (SQUARE_ACCESS_TOKEN &amp; friends) — the ledger works
          fully by hand meanwhile: mark sessions paid in person, or waive them.
        </p>
      )}

      {/* This month */}
      <section className="rounded-lg border border-line bg-white p-6 shadow-soft">
        <p className="text-label font-semibold uppercase tracking-wide text-mocha">This month</p>
        <p className="mt-2 text-lg text-ink">
          Collected <span className="font-semibold text-ink-strong">{formatMoney(summary.collectedCents)}</span>
          {" · "}Awaiting <span className="font-semibold text-ink-strong">{formatMoney(summary.awaitingCents)}</span>
          {summary.unbilledCount > 0 && (
            <>
              {" · "}
              {summary.unbilledCount} session{summary.unbilledCount === 1 ? "" : "s"} unbilled
            </>
          )}
        </p>
        <Link
          href="/practitioner/billing/export"
          className="mt-3 inline-block text-sm font-medium text-wine underline-offset-4 hover:underline"
        >
          Download CSV for bookkeeping
        </Link>
      </section>

      {/* Worth a look */}
      {(aging.length > 0 || externals.length > 0) && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Worth a look</h2>
          {aging.map((c) => (
            <p key={c.id} className="rounded-md border border-line bg-white px-4 py-3 text-sm text-ink">
              {nameOf(c.clientId)}&apos;s session from {fmtWhen(c.dueAt)} is still awaiting payment
              ({Math.floor((now.getTime() - c.dueAt!.getTime()) / DAY)} days).
            </p>
          ))}
          {externals.map((e) => (
            <div key={e.id} className="rounded-md border border-line bg-white px-4 py-3 text-sm">
              <p className="text-ink">
                A Square payment of {formatMoney(e.amountCents, e.currency)} from{" "}
                {fmtWhen(e.receivedAt)} isn&apos;t linked to a session yet.
              </p>
              {awaiting.length > 0 && (
                <form action={matchExternalPayment.bind(null, e.id)} className="mt-2 flex flex-wrap items-center gap-2">
                  <select name="chargeId" className="rounded-md border border-line px-2.5 py-1.5 text-sm text-ink">
                    {awaiting.map((c) => (
                      <option key={c.id} value={c.id}>
                        {nameOf(c.clientId)} · {formatMoney(c.amountCents, c.currency)} · {fmtWhen(c.dueAt)}
                      </option>
                    ))}
                  </select>
                  <button className="rounded-md border border-mocha px-3 py-1.5 text-sm font-medium text-wine transition-colors hover:bg-blush">
                    Match
                  </button>
                </form>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Awaiting */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Awaiting</h2>
        {awaiting.length === 0 ? (
          <p className="text-ink">Nothing awaiting — all settled.</p>
        ) : (
          awaiting.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white px-5 py-4 shadow-soft"
            >
              <Link
                href={`/practitioner/clients/${c.clientId}`}
                className="font-medium text-ink-strong underline-offset-4 hover:text-wine hover:underline"
              >
                {nameOf(c.clientId)}
              </Link>
              <span className="text-sm text-slate">
                {c.description} · {formatMoney(c.amountCents, c.currency)} · due {fmtWhen(c.dueAt)}
                {c.status === "PENDING" ? " · payment on its way" : ""}
              </span>
              <span className="ml-auto flex items-center gap-3">
                <form action={remindCharge.bind(null, c.id)}>
                  <button className="text-sm font-medium text-slate underline-offset-4 hover:text-wine hover:underline">
                    Remind
                  </button>
                </form>
                <form action={markChargePaid.bind(null, c.id)}>
                  <button className="text-sm font-medium text-wine underline-offset-4 hover:underline">
                    Mark paid
                  </button>
                </form>
                <form action={waiveCharge.bind(null, c.id)}>
                  <button className="text-sm font-medium text-slate underline-offset-4 hover:text-wine hover:underline">
                    Waive
                  </button>
                </form>
              </span>
            </div>
          ))
        )}
      </section>

      {/* Unbilled sessions */}
      {unbilled.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Unbilled sessions</h2>
          {unbilled.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white px-5 py-4 shadow-soft"
            >
              <span className="font-medium text-ink-strong">{nameOf(a.clientId ?? "")}</span>
              <span className="text-sm text-slate">{fmtWhen(a.startAt)}</span>
              <form action={billAppointment.bind(null, a.id)} className="ml-auto">
                <button className="rounded-md border border-mocha px-3.5 py-1.5 text-sm font-medium text-wine transition-colors hover:bg-blush">
                  Bill at current rate
                </button>
              </form>
            </div>
          ))}
        </section>
      )}

      {/* Recent payments */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Recent payments</h2>
        {recent.length === 0 ? (
          <p className="text-ink">No payments recorded yet.</p>
        ) : (
          recent.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center gap-3 rounded-md border border-line bg-white px-5 py-3 text-sm"
            >
              <span className="font-medium text-ink-strong">{nameOf(c.clientId)}</span>
              <span className="text-ink">{formatMoney(c.amountCents, c.currency)}</span>
              <span className="text-slate">
                {c.paidVia === "portal-card"
                  ? "card, in the portal"
                  : c.paidVia === "square-external"
                    ? "Square, outside the app"
                    : c.paidVia === "waived"
                      ? "waived"
                      : "in person"}
              </span>
              <span className="ml-auto text-slate">{fmtWhen(c.paidAt)}</span>
            </div>
          ))
        )}
      </section>

      {/* Rates */}
      <section className="rounded-lg border border-line bg-white p-6 shadow-soft">
        <h2 className="mb-1 text-xl font-semibold">Your rates</h2>
        <p className="mb-4 text-sm text-slate">
          New bookings are billed at the newest matching rate — a stage rate for clients in that
          stage, otherwise the general one.
        </p>
        {rates.length > 0 && (
          <ul className="mb-4 flex flex-col gap-2">
            {rates.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line/70 px-4 py-2.5 text-sm">
                <span className="font-medium text-ink-strong">{r.name}</span>
                <span className="text-ink">{formatMoney(r.amountCents, r.currency)}</span>
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
            <span className="text-sm font-medium text-ink-strong">Name</span>
            <input
              type="text"
              name="name"
              placeholder="Standard session"
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
            <span className="text-sm font-medium text-ink-strong">Stage (optional)</span>
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
            Add rate
          </button>
        </form>
      </section>
    </div>
  );
}
