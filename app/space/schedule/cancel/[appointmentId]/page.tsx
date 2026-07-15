import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { checkChangePolicy } from "@/lib/appointments";
import { getOrCreateConfig, formatInZone, zoneAbbrev } from "@/lib/schedule";
import { formatMoney } from "@/lib/billing";
import { cancelMyAppointmentWithPolicy } from "../../actions";

export const dynamic = "force-dynamic";

// C10-POLICY §2 — the cancel sheet. Outside the window: a plain confirm with
// no fee language at all. Inside: the policy stated warmly up front, with the
// human exits (message Valentina, keep the session) right beside the fee.
export default async function CancelSessionPage({
  params,
}: {
  params: { appointmentId: string };
}) {
  const user = await requireClient();
  const t = await getTranslations("sessions");
  const dateLocale = user.locale === "es" ? "es-419" : "en-US";

  const appt = await prisma.appointment.findUnique({ where: { id: params.appointmentId } });
  if (!appt || appt.clientId !== user.id || appt.status !== "SCHEDULED") {
    return (
      <Frame eyebrow={t("schedule.eyebrow")} title={t("cancel.goneTitle")}>
        <p className="text-ink">{t("cancel.goneBody")}</p>
        <BackLink label={t("purchase.back")} />
      </Frame>
    );
  }

  const config = await getOrCreateConfig(appt.practitionerId);
  const policy = await checkChangePolicy(appt);
  const amount = formatMoney(policy.lateFeeCents);
  const when = `${formatInZone(appt.startAt, config.timezone, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    locale: dateLocale,
  })} ${zoneAbbrev(appt.startAt, config.timezone)}`;

  return (
    <Frame eyebrow={t("schedule.eyebrow")} title={t("cancel.title")}>
      <div className="rounded-lg border border-line bg-white p-6 shadow-soft">
        <p className="text-lg font-medium text-ink-strong">{when}</p>

        {policy.late ? (
          <>
            {/* The fee path — policy first, warmly, with every exit visible. */}
            <p className="mt-3 max-w-prose text-ink">
              {t("cancel.lateBody", { hours: policy.cutoffHours, amount })}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <form action={cancelMyAppointmentWithPolicy.bind(null, appt.id, true)}>
                <button className="rounded-md bg-wine px-5 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-wine/90">
                  {t("cancel.anyway", { amount })}
                </button>
              </form>
              <Link
                href="/space/messages"
                className="rounded-md border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush"
              >
                {t("cancel.message")}
              </Link>
              <Link
                href="/space/schedule"
                className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
              >
                {t("cancel.keep")}
              </Link>
            </div>
          </>
        ) : (
          <>
            {/* The free path — no fee language, ever. */}
            <p className="mt-3 max-w-prose text-ink">{t("cancel.freeBody")}</p>
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <form action={cancelMyAppointmentWithPolicy.bind(null, appt.id, false)}>
                <button className="rounded-md bg-wine px-5 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-wine/90">
                  {t("cancel.confirm")}
                </button>
              </form>
              <Link
                href="/space/schedule"
                className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
              >
                {t("cancel.keep")}
              </Link>
            </div>
          </>
        )}
      </div>
    </Frame>
  );
}

function Frame({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">{title}</h1>
        <SignatureRule />
      </div>
      {children}
    </div>
  );
}

function BackLink({ label }: { label: string }) {
  return (
    <Link
      href="/space/schedule"
      className="self-start text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
    >
      {label}
    </Link>
  );
}
