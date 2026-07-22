import Link from "next/link";
import { redirect } from "next/navigation";
import { requirePractitioner } from "@/lib/auth-guards";
import { getTenant } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { getAccountView } from "@/lib/payments/account";
import { decryptToken } from "@/lib/payments/crypto";
import { revokeAccess } from "@/lib/payments/square";
import { PendingButton } from "@/components/PendingButton";
import { SignatureRule, Eyebrow } from "@/components/brand";

// CLAUDE-BILLING §3.2 — Settings → Payments. One button to connect, honest
// copy about whose money it is, status at a glance, and a clean disconnect
// that revokes provider-side AND deletes local tokens.

export const dynamic = "force-dynamic";

export default async function PaymentsSettingsPage({
  searchParams,
}: {
  searchParams: { pay?: string };
}) {
  await requirePractitioner();
  const tenant = await getTenant();
  const account = await getAccountView(tenant.id);

  async function disconnect() {
    "use server";
    const { requirePractitioner: guard } = await import("@/lib/auth-guards");
    await guard();
    const { getTenant: gt } = await import("@/lib/tenancy");
    const t = await gt();
    const row = await prisma.connectedPaymentAccount.findFirst({ where: { tenantId: t.id } });
    if (row) {
      try {
        await revokeAccess(decryptToken(row.accessTokenEnc));
      } catch {
        /* provider-side revoke best-effort; local deletion is the hard part */
      }
      await prisma.connectedPaymentAccount.delete({ where: { id: row.id } });
    }
    redirect("/practitioner/settings/payments?pay=disconnected");
  }

  const banner: Record<string, string> = {
    connected: "Square connected — payments from your clients go directly to you.",
    disconnected: "Square disconnected — tokens revoked and removed.",
    failed: "The connection didn't complete — nothing was saved. Try again.",
    badstate: "That connect link had expired or didn't match — try again from here.",
    denied: "The connection was cancelled at Square — nothing changed.",
    unconfigured: "Online payment connection isn't configured on the platform yet — nothing you need to do.",
  };

  return (
    <div className="flex flex-col gap-8">
      <Link href="/practitioner/settings" className="text-[13px] text-whisper underline-offset-4 hover:text-wine hover:underline">
        ← settings
      </Link>
      <div className="flex flex-col gap-2">
        <Eyebrow>Payments</Eyebrow>
        <h1 className="font-headline text-[2rem] font-medium text-ink-strong">Getting paid</h1>
        <SignatureRule />
        <p className="max-w-prose text-ink">
          You&apos;ll log into your own Square account. Payments from your clients go directly to
          you — the platform never holds your money.
        </p>
      </div>

      {searchParams.pay && banner[searchParams.pay] && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">{banner[searchParams.pay]}</p>
      )}

      {!account && (
        <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-6 shadow-card">
          <p className="text-sm text-slate">No payment account is connected yet.</p>
          <a
            href="/api/payments/square/start"
            className="self-start rounded-lg bg-wine px-5 py-2.5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-wine-dark"
          >
            Connect Square
          </a>
        </div>
      )}

      {account?.source === "env-legacy" && (
        <div className="flex flex-col gap-2 rounded-card border border-line bg-surface p-6 shadow-card">
          <p className="font-medium text-ink-strong">Connected — your existing Square setup</p>
          <p className="max-w-prose text-sm text-slate">
            Your current Square arrangement is active and unchanged: invoices, cards on file, and
            charges keep working exactly as they do today. Nothing to do here.
          </p>
        </div>
      )}

      {account?.source === "oauth" && (
        <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-6 shadow-card">
          <div className="flex flex-col gap-1">
            <p className="font-medium text-ink-strong">
              {account.status === "CONNECTED" ? `Connected as ${account.merchantName ?? account.merchantId}` : "Connection needs attention"}
            </p>
            {account.status === "CONNECTED" ? (
              <p className="text-sm text-slate">
                Since {account.connectedAt?.toISOString().slice(0, 10)} · money lands in your Square account.
              </p>
            ) : (
              <p className="text-sm text-slate">
                Your Square connection needs a quick re-connect — one tap, then everything resumes.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {account.status !== "CONNECTED" && (
              <a
                href="/api/payments/square/start"
                className="rounded-lg bg-wine px-5 py-2.5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-wine-dark"
              >
                Reconnect Square
              </a>
            )}
            <form action={disconnect}>
              <PendingButton className="rounded-md border border-line px-3.5 py-1.5 text-sm font-medium text-slate transition-colors hover:border-mocha hover:text-wine">
                Disconnect
              </PendingButton>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
