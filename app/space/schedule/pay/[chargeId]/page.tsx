import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { SquareCardForm } from "@/components/SquareCardForm";
import { squarePublicConfig, squareConfigured } from "@/lib/square";
import { formatMoney } from "@/lib/billing";
import { getPractitioner, getOrCreateConfig, formatInZone } from "@/lib/schedule";
import { payChargeWithToken } from "../../actions";

export const dynamic = "force-dynamic";

// The in-portal payment sheet (C13.4). Client-scoped: only your own open
// charge renders; the card form is Square's secure element.
export default async function PayChargePage({
  params,
}: {
  params: { chargeId: string };
}) {
  const user = await requireClient();

  const charge = await prisma.charge.findFirst({
    where: { id: params.chargeId, clientId: user.id },
  });
  if (!charge) notFound();

  if (charge.status === "PAID") {
    return (
      <Done
        title="Already settled"
        body="This session is paid — nothing more to do here."
      />
    );
  }
  if (charge.status !== "DUE" && charge.status !== "PENDING") {
    return (
      <Done title="Nothing due" body="This item isn't awaiting payment." />
    );
  }

  const appt = charge.appointmentId
    ? await prisma.appointment.findUnique({ where: { id: charge.appointmentId } })
    : null;
  const practitioner = await getPractitioner();
  const config = practitioner ? await getOrCreateConfig(practitioner.id) : null;
  const sq = await squarePublicConfig();
  const amountLabel = formatMoney(charge.amountCents, charge.currency);
  const boundPay = payChargeWithToken.bind(null, charge.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Eyebrow>Sessions</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">Settle this session</h1>
        <SignatureRule />
      </div>

      <div className="rounded-lg border border-line bg-white p-6 shadow-soft">
        <p className="text-lg font-medium text-ink-strong">
          {charge.description} · {amountLabel}
        </p>
        {appt && config && (
          <p className="mt-1 text-sm text-slate">
            {formatInZone(appt.startAt, config.timezone, {
              weekday: "long",
              month: "long",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        )}

        <div className="mt-6">
          {squareConfigured() && sq ? (
            <SquareCardForm
              applicationId={sq.applicationId}
              locationId={sq.locationId}
              scriptUrl={sq.scriptUrl}
              sandbox={sq.sandbox}
              amountLabel={amountLabel}
              payAction={boundPay}
            />
          ) : (
            <p className="max-w-prose text-sm text-ink">
              Online payment isn&apos;t set up yet — you can settle in person or however you and
              Valentina usually do, and this will update here.
            </p>
          )}
        </div>
      </div>

      <Link
        href="/space/schedule"
        className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
      >
        Back to your sessions
      </Link>
    </div>
  );
}

function Done({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Eyebrow>Sessions</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">{title}</h1>
        <SignatureRule />
      </div>
      <p className="text-ink">{body}</p>
      <Link
        href="/space/schedule"
        className="self-start text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
      >
        Back to your sessions
      </Link>
    </div>
  );
}
