import Link from "next/link";
import { requirePractitioner } from "@/lib/auth-guards";
import { getTenant } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { PendingButton } from "@/components/PendingButton";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { CalendlyForm, AcuityForm } from "./ConnectForms";
import { disconnectAction } from "./actions";

// C37 §6 — Settings → Online booking. OFF BY DEFAULT: a practice that connects
// nothing sees an invitation, never a half-configured integration.
//
// RULING 197 shapes this whole page. Connection health is a STATUS SHE READS,
// not an alert that chases her. "No bookings yet" is printed as the plain fact
// it is, with the date of the last one, and it NEVER turns into a warning —
// a quiet week is not a fault. Only unambiguous breakage (a signature that will
// not verify) is styled as something to act on.

export const dynamic = "force-dynamic";

function Health({ row }: { row: { status: string; lastEventAt: Date | null; eventCount30d: number; lastError: string | null; lastErrorAt: Date | null } }) {
  const broken = row.status === "NEEDS_ATTENTION";
  return (
    <div className={`rounded-lg border p-3 text-sm ${broken ? "border-wine/40 bg-wine/5" : "border-line bg-canvas-subtle"}`}>
      {broken ? (
        <>
          <p className="font-medium text-wine">This connection needs attention</p>
          <p className="mt-1 text-slate">
            The last delivery could not be verified{row.lastError ? ` (${row.lastError})` : ""}. Reconnect below
            to refresh the key — bookings made in the meantime will not have arrived.
          </p>
        </>
      ) : (
        <>
          <p className="font-medium text-ink-strong">Connected</p>
          {/* Ruling 197 — silence stated as a FACT, in the same neutral voice
              as any other reading. No warning colour, no exclamation. */}
          <p className="mt-1 text-slate">
            {row.lastEventAt
              ? `Last booking received ${row.lastEventAt.toLocaleDateString()}. ${row.eventCount30d} in the last 30 days.`
              : "No bookings received yet. That is normal until someone books, or until the webhook is saved on the provider's side."}
          </p>
        </>
      )}
    </div>
  );
}

export default async function SchedulingSettingsPage() {
  await requirePractitioner();
  const tenant = await getTenant();
  const rows = await prisma.externalSchedulingConnection.findMany({ where: { tenantId: tenant.id } });
  const calendly = rows.find((r) => r.provider === "calendly") ?? null;
  const acuity = rows.find((r) => r.provider === "acuity") ?? null;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-5 py-10">
      <div>
        <Eyebrow>Practice</Eyebrow>
        <h1 className="text-2xl font-medium text-ink-strong">Online booking</h1>
        <SignatureRule />
        <p className="mt-3 max-w-prose text-sm text-slate">
          If you already take bookings through Calendly or Acuity, connect it here and those bookings
          will appear in your schedule automatically. Keep using the tool you know — nothing about how
          your clients book has to change.
        </p>
      </div>

      {/* RULING 193, said plainly to the person it affects. */}
      <div className="rounded-lg border border-line bg-canvas-subtle p-4">
        <p className="text-sm font-medium text-ink-strong">What arrives, and what does not</p>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-slate">
          <li>A booking becomes an appointment on your schedule, plus a contact card for the person.</li>
          <li>
            It does <strong>not</strong> create a client record. Someone who books a call is not yet your
            client, and their answers stay on the contact card until you decide otherwise.
          </li>
          <li>
            Anything they typed into the booking form is visible to you, but it is not part of the
            clinical record and will not be quoted back to you as evidence until you add it yourself.
          </li>
        </ul>
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-medium text-ink-strong">Calendly</h2>
          {calendly && (
            <form action={disconnectAction}>
              <input type="hidden" name="provider" value="calendly" />
              <PendingButton className="text-sm text-slate underline">Disconnect</PendingButton>
            </form>
          )}
        </div>
        {calendly && <Health row={calendly} />}

        {/* A1 — the plan requirement, stated plainly rather than discovered as
            a failure. Calendly gates webhooks behind its paid tiers, so a
            practitioner on the free plan cannot make this work no matter how
            correctly she fills the form in. Better she reads it here. */}
        <div className="rounded-lg border border-gold/40 bg-gold/5 p-3 text-sm text-slate">
          <p className="font-medium text-ink-strong">Calendly requires a paid plan for this</p>
          <p className="mt-1">
            Automatic booking sync uses Calendly&rsquo;s webhooks, which are available on their paid
            tiers only. On the free plan the connection below will save, but no bookings will ever
            arrive. Acuity includes webhooks on all of its plans.
          </p>
        </div>

        <CalendlyForm connected={!!calendly} />
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-medium text-ink-strong">Acuity Scheduling</h2>
          {acuity && (
            <form action={disconnectAction}>
              <input type="hidden" name="provider" value="acuity" />
              <PendingButton className="text-sm text-slate underline">Disconnect</PendingButton>
            </form>
          )}
        </div>
        {acuity && <Health row={acuity} />}
        <AcuityForm connected={!!acuity} />
      </section>

      <Link href="/practitioner/settings" className="text-sm text-slate underline">
        Back to settings
      </Link>
    </main>
  );
}
