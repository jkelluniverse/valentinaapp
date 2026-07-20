import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { PageHeader } from "@/components/PageHeader";
import { formatMoney } from "@/lib/billing";
import { billingDashboard, type BillingDashboard } from "@/lib/billing-dashboard";
import { squareConfigured } from "@/lib/square";
import { getPractitioner, getOrCreateConfig, formatInZone } from "@/lib/schedule";
import { clientLabel } from "@/lib/appointments";
import { programStageLabel } from "@/lib/program-config";
import {
  markChargePaid,
  waiveCharge,
  remindCharge,
  billAppointment,
  matchExternalPayment,
  dismissExternalPayment,
  sendChargeInvoice,
  sendRenewalEmail,
  markSessionPaidInPerson,
  noChargeSession,
  resendReceipt,
} from "./actions";

export const dynamic = "force-dynamic";

// BILLING-DASH — the owner's dashboard. Six boxes, each one question in plain
// words; tap a box and its panel swaps in below with one-tap fixes. Money is
// the sanctioned exception to the no-KPI-tiles rule (C13 §6) — numbers ARE
// the content here. No red, no alarms: attention = wine numerals + worded
// meaning lines.

const BANNERS: Record<string, string> = {
  paid: "Marked paid.",
  waived: "Waived — noted with your name.",
  reminded: "A gentle note is on its way — invoice attached, pay button included.",
  nothingdue: "Nothing due on that one.",
  noemail: "This needs the email provider set up (RESEND_API_KEY).",
  billed: "Charge created at the current rate — they'll see it in their portal.",
  norate: "No rate matched — add one under Rates & packages, then try again.",
  matched: "Matched — the session shows as paid.",
  dismissed: "Dismissed — it won't appear here again.",
  invoicesent: "Invoice sent — your branded email carries it, PDF attached.",
  invoicealready: "That one already has an invoice out — Remind nudges it.",
  invoicefail: "The invoice couldn't be created just now — nothing was sent.",
  invoiceconfig: "Invoices need Square connected.",
  renewalsent: "Renewal email sent — your packages, your words.",
  renewalmuted: "This client has renewal messages turned off — honored.",
  renewalfail: "The renewal email couldn't be sent just now.",
  receiptsent: "Receipt on its way.",
};

const PANELS = ["awaiting", "renewal", "lastone", "unbilled", "collected", "expected"] as const;
type PanelKey = (typeof PANELS)[number];

export default async function BillingPage({
  searchParams,
}: {
  searchParams: { billing?: string; panel?: string };
}) {
  await requirePractitioner();
  const practitioner = await getPractitioner();
  const config = practitioner ? await getOrCreateConfig(practitioner.id) : null;
  const now = new Date();
  const panel: PanelKey = PANELS.includes(searchParams.panel as PanelKey)
    ? (searchParams.panel as PanelKey)
    : "awaiting";

  const [dash, clients, externals] = await Promise.all([
    billingDashboard(now),
    prisma.user.findMany({
      where: { role: "CLIENT" },
      select: { id: true, name: true, email: true, profile: { select: { stage: true } } },
    }),
    prisma.externalPayment.findMany({
      where: { matchedChargeId: null, dismissedAt: null },
      orderBy: { receivedAt: "desc" },
    }),
  ]);

  // Lead-keyed charges ("lead:<id>") resolve to lead names.
  const leadIds = [
    ...new Set(
      [...dash.awaiting.rows, ...dash.collected.rows]
        .map((r) => (r.clientId.startsWith("lead:") ? r.clientId.slice(5) : null))
        .filter((x): x is string => Boolean(x)),
    ),
  ];
  const leads = leadIds.length
    ? await prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, name: true } })
    : [];
  const leadById = new Map(leads.map((l) => [l.id, l]));
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const nameOf = (id: string) => {
    if (id.startsWith("lead:")) {
      const lead = leadById.get(id.slice(5));
      return lead ? `Lead — ${lead.name}` : "Lead";
    }
    const c = clientById.get(id);
    return c ? clientLabel(c) : "Unknown";
  };
  const stageOf = (id: string) => clientById.get(id)?.profile?.stage ?? null;
  const clientHref = (id: string) =>
    id.startsWith("lead:") ? "/practitioner/leads" : `/practitioner/clients/${id}?tab=billing`;

  const fmtWhen = (d: Date | null) =>
    d && config
      ? formatInZone(d, config.timezone, { month: "short", day: "numeric" })
      : d?.toISOString().slice(0, 10) ?? "—";
  const fmtWhenTime = (d: Date | null) =>
    d && config
      ? formatInZone(d, config.timezone, {
          weekday: "short",
          hour: "numeric",
          minute: "2-digit",
        })
      : "—";
  const monthName = (d: Date) =>
    new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(d);

  // The "back" every panel action returns to — same panel, same view.
  const back = `/practitioner/billing?panel=${panel}`;

  // ---- The six boxes: label · number · worded meaning · attention state ----
  const boxes: {
    key: PanelKey;
    label: string;
    big: React.ReactNode;
    meaning: React.ReactNode;
    attention: boolean;
  }[] = [
    {
      key: "collected",
      label: `Collected · ${monthName(dash.monthStart)}`,
      big: formatMoney(dash.collected.cents),
      meaning:
        dash.collected.count === 0 ? (
          "No payments yet this month"
        ) : (
          <>
            {dash.collected.cents >= dash.collected.lastMonthCents ? "Up from" : "Down from"}{" "}
            {formatMoney(dash.collected.lastMonthCents)} in{" "}
            {monthName(new Date(Date.UTC(dash.monthStart.getUTCFullYear(), dash.monthStart.getUTCMonth() - 1, 1)))} ·{" "}
            {dash.collected.count} payment{dash.collected.count === 1 ? "" : "s"}
          </>
        ),
      attention: false,
    },
    {
      key: "awaiting",
      label: "Waiting to be paid",
      big: (
        <>
          {formatMoney(dash.awaiting.cents)}
          {dash.awaiting.people > 0 && (
            <span className="text-lg font-normal text-whisper">
              {" "}· {dash.awaiting.people} {dash.awaiting.people === 1 ? "person" : "people"}
            </span>
          )}
        </>
      ),
      meaning:
        dash.awaiting.rows.length === 0 ? (
          "Nothing waiting — beautifully."
        ) : dash.awaiting.overdueCents > 0 ? (
          <>
            <b className="font-semibold text-wine">{formatMoney(dash.awaiting.overdueCents)} is overdue</b> — one
            tap sends a reminder
          </>
        ) : (
          "All within their due dates"
        ),
      attention: dash.awaiting.overdueCents > 0,
    },
    {
      key: "renewal",
      label: "Out of sessions",
      big: (
        <>
          {dash.renewal.rows.length}
          <span className="text-lg font-normal text-whisper">
            {" "}client{dash.renewal.rows.length === 1 ? "" : "s"}
          </span>
        </>
      ),
      meaning:
        dash.renewal.rows.length === 0 ? (
          "Everyone has sessions ahead"
        ) : (
          <>
            Finished their package — <b className="font-semibold text-wine">ready to continue</b>
          </>
        ),
      attention: dash.renewal.rows.length > 0,
    },
    {
      key: "lastone",
      label: "On their last session",
      big: (
        <>
          {dash.lastSession.rows.length}
          <span className="text-lg font-normal text-whisper">
            {" "}client{dash.lastSession.rows.length === 1 ? "" : "s"}
          </span>
        </>
      ),
      meaning:
        dash.lastSession.rows.length === 0 ? (
          "No packages at their final session"
        ) : (
          <>
            Have the renewal conversation <b className="font-semibold text-wine">in the room</b>
          </>
        ),
      attention: false, // an opportunity, not a problem
    },
    {
      key: "unbilled",
      label: "Sessions not yet billed",
      big: String(dash.unbilled.rows.length),
      meaning:
        dash.unbilled.rows.length === 0 ? (
          "Every session accounted for"
        ) : (
          <>
            Happened, but no charge exists — <b className="font-semibold text-wine">one tap fixes it</b>
          </>
        ),
      attention: dash.unbilled.rows.length > 0,
    },
    {
      key: "expected",
      label: "Booked ahead · next 7 days",
      big: formatMoney(dash.booked.cents),
      meaning:
        dash.booked.count === 0 ? (
          "Nothing on the calendar this week yet"
        ) : dash.booked.willBillCount > 0 ? (
          <>
            {dash.booked.count} session{dash.booked.count === 1 ? "" : "s"} on the calendar ·{" "}
            {dash.booked.willBillCount} will bill at booking
          </>
        ) : (
          <>
            {dash.booked.count} session{dash.booked.count === 1 ? "" : "s"} on the calendar, all covered or
            billed
          </>
        ),
      attention: false,
    },
  ];

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <PageHeader
        title="Billing"
        eyebrow="Your practice"
        lede="Everything money, at a glance — tap any box to act on it. Square remains the money's home."
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

      {/* ——— The six boxes ——— */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {boxes.map((b) => (
          <Link
            key={b.key}
            href={`/practitioner/billing?panel=${b.key}#panel`}
            scroll={false}
            className={`group relative rounded-card border bg-surface p-5 shadow-soft transition-all hover:-translate-y-0.5 hover:border-mocha ${
              panel === b.key ? "border-[1.5px] border-wine" : "border-line"
            }`}
          >
            <span className="absolute right-4 top-4 text-mocha opacity-0 transition-opacity group-hover:opacity-100">
              ›
            </span>
            <p className="text-eyebrow font-semibold uppercase tracking-wide text-mocha">{b.label}</p>
            <p
              className={`mt-2 font-serif text-3xl font-semibold ${
                b.attention ? "text-wine" : "text-ink-strong"
              }`}
            >
              {b.big}
            </p>
            <p className="mt-1.5 text-[12.5px] leading-snug text-whisper">{b.meaning}</p>
          </Link>
        ))}
      </div>

      {/* ——— The panel ——— */}
      <section
        id="panel"
        className="overflow-hidden rounded-card border border-line bg-surface shadow-soft"
      >
        {panel === "awaiting" && (
          <Panel
            title="Waiting to be paid"
            hint="Remind nudges warmly, invoice attached · Send invoice makes it payable online"
          >
            {dash.awaiting.rows.length === 0 ? (
              <Empty>Nothing waiting — beautifully.</Empty>
            ) : (
              dash.awaiting.rows.map((r) => (
                <Row key={r.chargeId}>
                  <Who
                    name={nameOf(r.clientId)}
                    sub={(stageOf(r.clientId) && programStageLabel(stageOf(r.clientId)!)) || ""}
                    href={clientHref(r.clientId)}
                  />
                  <What>
                    {r.description}
                    {" · "}
                    {r.overdueDays > 0 ? (
                      <span className="font-semibold text-wine">
                        overdue {r.overdueDays} day{r.overdueDays === 1 ? "" : "s"}
                      </span>
                    ) : r.dueAt ? (
                      <span className="font-semibold text-gold">due {fmtWhen(r.dueAt)}</span>
                    ) : (
                      "no due date"
                    )}
                    {r.lastRemindedAt ? ` · reminded ${fmtWhen(r.lastRemindedAt)}` : ""}
                  </What>
                  <Amt>{formatMoney(r.amountCents, r.currency)}</Amt>
                  <Acts>
                    <ActForm action={remindCharge.bind(null, r.chargeId)} back={back} label="Remind" />
                    {squareConfigured() && !r.hasInvoice && !r.clientId.startsWith("lead:") && (
                      <ActForm
                        action={sendChargeInvoice.bind(null, r.chargeId)}
                        back={back}
                        label="Send invoice"
                      />
                    )}
                    <ActForm action={markChargePaid.bind(null, r.chargeId)} back={back} label="Mark paid" />
                    <ActForm action={waiveCharge.bind(null, r.chargeId)} back={back} label="Waive" quiet />
                  </Acts>
                </Row>
              ))
            )}
          </Panel>
        )}

        {panel === "renewal" && (
          <Panel
            title="Out of sessions — ready to continue"
            hint="One tap sends the warm renewal email with your package options"
          >
            {dash.renewal.rows.length === 0 ? (
              <Empty>No one is out of sessions — beautifully.</Empty>
            ) : (
              dash.renewal.rows.map((r) => (
                <Row key={r.packageId}>
                  <Who
                    name={nameOf(r.clientId)}
                    sub={`finished ${r.sessionsTotal} sessions · ${fmtWhen(r.finishedAt)}`}
                    href={clientHref(r.clientId)}
                  />
                  <What>
                    {r.renewalEmailSentAt
                      ? `Renewal email sent ${fmtWhen(r.renewalEmailSentAt)} · no purchase yet`
                      : "Renewal email not yet sent"}
                  </What>
                  <Amt> </Amt>
                  <Acts>
                    <ActForm
                      action={sendRenewalEmail.bind(null, r.clientId)}
                      back={back}
                      label={r.renewalEmailSentAt ? "Nudge again" : "Send renewal email"}
                      primary={!r.renewalEmailSentAt}
                    />
                    <LinkAct href={clientHref(r.clientId)} label="Send package invoice" />
                    <LinkAct href={`/practitioner/clients/${r.clientId}/book`} label="Book anyway" quiet />
                  </Acts>
                </Row>
              ))
            )}
          </Panel>
        )}

        {panel === "lastone" && (
          <Panel
            title="On their last session"
            hint="So the continuing conversation happens face to face — not by email afterward"
          >
            {dash.lastSession.rows.length === 0 ? (
              <Empty>No packages at their final session right now.</Empty>
            ) : (
              dash.lastSession.rows.map((r) => (
                <Row key={r.packageId}>
                  <Who
                    name={nameOf(r.clientId)}
                    sub={stageOf(r.clientId) ?? ""}
                    href={clientHref(r.clientId)}
                  />
                  <What>
                    Session {r.sessionNumber} of {r.sessionsTotal}
                    {r.startAt ? ` · booked ${fmtWhenTime(r.startAt)}` : " · booked"}
                  </What>
                  <Amt> </Amt>
                  <Acts>
                    <LinkAct
                      href={`/practitioner/clients/${r.clientId}/prep?renewal=1`}
                      label="Prep with renewal in mind"
                      primary
                    />
                    <ActForm
                      action={sendRenewalEmail.bind(null, r.clientId)}
                      back={back}
                      label="Send options ahead"
                      quiet
                    />
                  </Acts>
                </Row>
              ))
            )}
          </Panel>
        )}

        {panel === "unbilled" && (
          <Panel
            title="Sessions not yet billed"
            hint="These happened but no charge exists — pick how each should be settled"
          >
            {dash.unbilled.rows.length === 0 ? (
              <Empty>Every session is accounted for.</Empty>
            ) : (
              dash.unbilled.rows.map((r) => (
                <Row key={r.appointmentId}>
                  <Who
                    name={nameOf(r.clientId)}
                    sub={`${fmtWhen(r.startAt)} · ${r.location}`}
                    href={clientHref(r.clientId)}
                  />
                  <What>No charge created</What>
                  <Amt>{r.rateCents != null ? formatMoney(r.rateCents, r.currency) : "—"}</Amt>
                  <Acts>
                    <ActForm
                      action={billAppointment.bind(null, r.appointmentId)}
                      back={back}
                      label="Bill it"
                      primary
                    />
                    <ActForm
                      action={markSessionPaidInPerson.bind(null, r.appointmentId)}
                      back={back}
                      label="Paid in person"
                    />
                    <ActForm
                      action={noChargeSession.bind(null, r.appointmentId)}
                      back={back}
                      label="No charge"
                      quiet
                    />
                  </Acts>
                </Row>
              ))
            )}
          </Panel>
        )}

        {panel === "collected" && (
          <Panel
            title="Collected this month"
            hint="Every payment, newest first · totals reconcile with Square to the cent"
          >
            {dash.collected.rows.length === 0 ? (
              <Empty>No payments yet this month.</Empty>
            ) : (
              dash.collected.rows.map((r) => (
                <Row key={r.chargeId}>
                  <Who name={nameOf(r.clientId)} sub={fmtWhen(r.paidAt)} href={clientHref(r.clientId)} />
                  <What>
                    {r.description}
                    {" · "}
                    {r.paidVia === "portal-card"
                      ? "paid in portal"
                      : r.paidVia === "square-invoice"
                        ? "invoice paid"
                        : r.paidVia === "card-on-file"
                          ? "card on file"
                          : r.paidVia === "square-external"
                            ? "Square, outside the app"
                            : "in person"}
                  </What>
                  <Amt>{formatMoney(r.amountCents, r.currency)}</Amt>
                  <Acts>
                    {!r.clientId.startsWith("lead:") && (
                      <ActForm
                        action={resendReceipt.bind(null, r.chargeId)}
                        back={back}
                        label="Receipt"
                        quiet
                      />
                    )}
                  </Acts>
                </Row>
              ))
            )}
          </Panel>
        )}

        {panel === "expected" && (
          <Panel
            title="Booked ahead — next 7 days"
            hint="What the calendar already holds · nothing here needs action"
          >
            {dash.booked.rows.length === 0 ? (
              <Empty>Nothing on the calendar this week yet.</Empty>
            ) : (
              dash.booked.rows.map((r) => (
                <Row key={r.appointmentId}>
                  <Who
                    name={nameOf(r.clientId)}
                    sub={fmtWhenTime(r.startAt)}
                    href={clientHref(r.clientId)}
                  />
                  <What>
                    {r.coverage === "covered"
                      ? `Covered by package${r.packageNote ? ` (${r.packageNote})` : ""}`
                      : r.coverage === "billed"
                        ? "Billed · awaiting payment"
                        : r.coverage === "paid"
                          ? "Already paid"
                          : "Will bill at booking rate"}
                  </What>
                  <Amt>{formatMoney(r.valueCents, r.currency)}</Amt>
                  <Acts>{null}</Acts>
                </Row>
              ))
            )}
          </Panel>
        )}
      </section>

      {/* ——— Unlinked Square payments (self-healing; rare) ——— */}
      {externals.length > 0 && (
        <section className="flex flex-col gap-3">
          {externals.map((e) => (
            <div key={e.id} className="rounded-md border border-line bg-white px-4 py-3 text-sm">
              <p className="text-ink">
                A Square payment of {formatMoney(e.amountCents, e.currency)} from{" "}
                {fmtWhen(e.receivedAt)} isn&apos;t linked to a session yet.
              </p>
              <p className="mt-1 text-xs text-slate">
                Invoice payments link themselves within a few minutes. If this one belongs to an
                awaiting charge, match it — otherwise dismiss it.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {dash.awaiting.rows.length > 0 && (
                  <form
                    action={matchExternalPayment.bind(null, e.id)}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <input type="hidden" name="back" value={back} />
                    <select
                      name="chargeId"
                      className="rounded-md border border-line px-2.5 py-1.5 text-sm text-ink"
                    >
                      {dash.awaiting.rows.map((c) => (
                        <option key={c.chargeId} value={c.chargeId}>
                          {nameOf(c.clientId)} · {formatMoney(c.amountCents, c.currency)} ·{" "}
                          {fmtWhen(c.dueAt)}
                        </option>
                      ))}
                    </select>
                    <button className="rounded-md border border-mocha px-3 py-1.5 text-sm font-medium text-wine transition-colors hover:bg-blush">
                      Match
                    </button>
                  </form>
                )}
                <form action={dismissExternalPayment.bind(null, e.id)}>
                  <button className="rounded-md px-3 py-1.5 text-sm font-medium text-slate transition-colors hover:bg-blush hover:text-wine">
                    Dismiss
                  </button>
                </form>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* ——— Quiet footer ——— */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <Link
          href="/practitioner/billing/export"
          className="text-sm font-semibold text-wine underline-offset-4 hover:underline"
        >
          Download CSV for bookkeeping
        </Link>
        <Link
          href="/practitioner/billing/rates"
          className="text-sm font-semibold text-wine underline-offset-4 hover:underline"
        >
          Rates &amp; packages
        </Link>
        <span className="text-xs text-whisper">
          Rates, packages &amp; fee settings live one tap away — out of the daily view.
        </span>
      </div>
    </div>
  );
}

// ---- Panel building blocks (server-side; actions are plain forms) ----

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-line px-6 py-4">
        <h2 className="font-serif text-lg font-semibold text-ink-strong">{title}</h2>
        <span className="text-xs text-whisper">{hint}</span>
      </div>
      {children}
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-6 py-3.5 last:border-b-0 hover:bg-blush/40">
      {children}
    </div>
  );
}

function Who({ name, sub, href }: { name: string; sub: string; href: string }) {
  return (
    <div className="w-full sm:w-44 sm:flex-none">
      <Link
        href={href}
        className="text-[14.5px] font-semibold text-ink-strong underline-offset-4 hover:text-wine hover:underline"
      >
        {name}
      </Link>
      {sub && <p className="text-[11.5px] text-whisper">{sub}</p>}
    </div>
  );
}

function What({ children }: { children: React.ReactNode }) {
  return <p className="min-w-0 flex-1 text-[13.5px] text-ink">{children}</p>;
}

function Amt({ children }: { children: React.ReactNode }) {
  return (
    <p className="w-20 flex-none text-right text-[15px] font-semibold text-ink-strong">{children}</p>
  );
}

function Acts({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-none flex-wrap items-center gap-2">{children}</div>;
}

// A one-tap server action, styled per the reference: pill buttons, ≥44px touch
// target on mobile, primary = wine fill, quiet = borderless.
function ActForm({
  action,
  back,
  label,
  primary = false,
  quiet = false,
}: {
  action: (formData: FormData) => Promise<void>;
  back: string;
  label: string;
  primary?: boolean;
  quiet?: boolean;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="back" value={back} />
      <button className={actClass(primary, quiet)}>{label}</button>
    </form>
  );
}

function LinkAct({
  href,
  label,
  primary = false,
  quiet = false,
}: {
  href: string;
  label: string;
  primary?: boolean;
  quiet?: boolean;
}) {
  return (
    <Link href={href} className={actClass(primary, quiet)}>
      {label}
    </Link>
  );
}

function actClass(primary: boolean, quiet: boolean): string {
  if (primary)
    return "inline-block whitespace-nowrap rounded-full bg-wine px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-wine-dark";
  if (quiet)
    return "inline-block whitespace-nowrap rounded-full px-3 py-2 text-[12.5px] font-semibold text-whisper transition-colors hover:text-ink";
  return "inline-block whitespace-nowrap rounded-full border border-line bg-surface px-3.5 py-2 text-[12.5px] font-semibold text-ink transition-colors hover:border-mocha hover:text-ink-strong";
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-6 py-10 text-center font-serif italic text-whisper">{children}</p>;
}
