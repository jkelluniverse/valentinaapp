import Link from "next/link";
import { requirePractitioner } from "@/lib/auth-guards";
import { getTenant } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { getAccountView } from "@/lib/payments/account";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { PendingButton } from "@/components/PendingButton";
import { createPaymentLinkAction } from "./actions";

// BILLING §3.5 Phase B2 — the payments ledger: every Payment row for this
// tenant, filterable by client and date, plus one-off checkout-link creation.
// Valentina's env-legacy arrangement doesn't use this path — her existing
// billing pages (C13) are untouched; this page simply has nothing to show
// until/unless she opts into the Connect flow.

export const dynamic = "force-dynamic";

const fmtMoney = (cents: number, currency: string) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);

export default async function PaymentsLedgerPage({
  searchParams,
}: {
  searchParams: { client?: string; from?: string; to?: string; created?: string; error?: string };
}) {
  await requirePractitioner();
  const tenant = await getTenant();
  const account = await getAccountView(tenant.id);

  const where: { clientId?: string; occurredAt?: { gte?: Date; lte?: Date } } = {};
  if (searchParams.client) where.clientId = searchParams.client;
  const from = searchParams.from ? new Date(searchParams.from) : null;
  const to = searchParams.to ? new Date(`${searchParams.to}T23:59:59`) : null;
  if ((from && !isNaN(+from)) || (to && !isNaN(+to))) {
    where.occurredAt = {
      ...(from && !isNaN(+from) ? { gte: from } : {}),
      ...(to && !isNaN(+to) ? { lte: to } : {}),
    };
  }

  const [payments, clients] = await Promise.all([
    prisma.payment.findMany({ where, orderBy: { occurredAt: "desc" }, take: 200 }),
    prisma.user.findMany({
      where: { role: "CLIENT", active: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const nameFor = new Map(clients.map((c) => [c.id, c.name ?? c.email]));
  const created = searchParams.created
    ? payments.find((p) => p.id === searchParams.created)
    : null;
  const createdUrl = (created?.raw as { checkoutUrl?: string } | null)?.checkoutUrl;

  const errors: Record<string, string> = {
    amount: "Enter an amount between $0.01 and $5,000.",
    client: "Pick a client for this link.",
    description: "Give the link a short description — it shows on the payment.",
    provider: "Square didn't accept the request — try again in a moment.",
    "not-connected": "Connect Square first — the link needs somewhere for the money to go.",
    "needs-reconnect": "Your Square connection needs a quick re-connect before new links can be made.",
  };

  const oauthConnected = account?.source === "oauth" && account.status === "CONNECTED";
  const fieldCls =
    "rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-wine focus:ring-2 focus:ring-wine/20";

  return (
    <div className="flex flex-col gap-8">
      <Link href="/practitioner/settings/payments" className="text-[13px] text-whisper underline-offset-4 hover:text-wine hover:underline">
        ← payment settings
      </Link>
      <div className="flex flex-col gap-2">
        <Eyebrow>Payments</Eyebrow>
        <h1 className="font-headline text-[2rem] font-medium text-ink-strong">Payments ledger</h1>
        <SignatureRule />
        <p className="max-w-prose text-ink">
          Every payment made through your connected account, newest first. Money always lands
          directly in your Square account.
        </p>
      </div>

      {account?.source === "oauth" && account.status === "NEEDS_RECONNECT" && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          Your Square connection needs a quick re-connect — new payment links are paused until
          then.{" "}
          <a href="/api/payments/square/start" className="font-medium underline underline-offset-4">
            Reconnect Square
          </a>
        </p>
      )}

      {searchParams.error && errors[searchParams.error] && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">{errors[searchParams.error]}</p>
      )}

      {created && createdUrl && (
        <div className="flex flex-col gap-2 rounded-card border border-mocha/50 bg-blush p-5">
          <p className="text-sm font-medium text-wine">
            Payment link created for {nameFor.get(created.clientId ?? "") ?? "your client"} —{" "}
            {fmtMoney(created.amountCents, created.currency)}.
          </p>
          <p className="break-all rounded-md bg-white/70 px-3 py-2 font-mono text-[13px] text-ink">
            {`${(await import("@/lib/base-url")).getBaseUrlSafe()}/space/pay-link/${created.id}`}
          </p>
          <p className="text-[13px] text-slate">
            Share that link with them — it opens in their space (after sign-in) and carries them
            straight to Square&apos;s payment page. It marks itself paid here the moment Square
            confirms.
          </p>
        </div>
      )}

      {oauthConnected && (
        <form action={createPaymentLinkAction} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-card">
          <p className="text-[13px] font-semibold uppercase tracking-wide text-mocha">Create a payment link</p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
              Client
              <select name="clientId" required className={fieldCls}>
                <option value="">Choose…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name ?? c.email}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
              Amount (USD)
              <input name="amount" type="number" step="0.01" min="0.01" required placeholder="150.00" className={`${fieldCls} w-32`} />
            </label>
            <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
              For
              <select name="purpose" className={fieldCls}>
                <option value="session">Session</option>
                <option value="package">Package</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="flex min-w-[220px] flex-1 flex-col gap-1 text-[13px] font-medium text-slate">
              Description
              <input name="description" required maxLength={120} placeholder="e.g. Deep-dive session, August" className={fieldCls} />
            </label>
            <PendingButton className="rounded-lg bg-wine px-5 py-2.5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-wine-dark">
              Create link
            </PendingButton>
          </div>
        </form>
      )}

      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
          Client
          <select name="client" defaultValue={searchParams.client ?? ""} className={fieldCls}>
            <option value="">Everyone</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name ?? c.email}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
          From
          <input name="from" type="date" defaultValue={searchParams.from ?? ""} className={fieldCls} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
          To
          <input name="to" type="date" defaultValue={searchParams.to ?? ""} className={fieldCls} />
        </label>
        <button className="rounded-md border border-line px-4 py-2 text-sm font-medium text-slate transition-colors hover:border-mocha hover:text-wine">
          Filter
        </button>
      </form>

      {payments.length === 0 ? (
        <p className="rounded-card border border-line bg-surface p-6 text-sm text-slate shadow-card">
          No payments here yet — they appear the moment Square confirms one.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-line">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="border-b border-line text-left text-[12px] uppercase tracking-wide text-mocha">
                <th className="px-4 py-2.5">Date</th>
                <th className="px-4 py-2.5">Client</th>
                <th className="px-4 py-2.5">For</th>
                <th className="px-4 py-2.5 text-right">Amount</th>
                <th className="px-4 py-2.5">Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5 text-slate">{p.occurredAt.toISOString().slice(0, 10)}</td>
                  <td className="px-4 py-2.5 text-ink">{p.clientId ? nameFor.get(p.clientId) ?? "—" : "—"}</td>
                  <td className="px-4 py-2.5 text-slate">{p.purpose}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-ink-strong">{fmtMoney(p.amountCents, p.currency)}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={
                        p.status === "COMPLETED"
                          ? "rounded-full bg-blush px-2.5 py-0.5 text-[12px] font-medium text-wine"
                          : "rounded-full border border-line px-2.5 py-0.5 text-[12px] text-slate"
                      }
                    >
                      {p.status.toLowerCase()}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
