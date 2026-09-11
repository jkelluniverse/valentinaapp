import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { SlotGrid } from "@/components/SlotGrid";
import { checkChangePolicy } from "@/lib/appointments";
import {
  getOrCreateConfig,
  openSlots,
  isSlotOpen,
  formatInZone,
  zoneAbbrev,
  DAY_MS,
} from "@/lib/schedule";
import { formatMoney } from "@/lib/billing";
import { rescheduleMyAppointment } from "../../actions";
import { PendingButton } from "@/components/PendingButton";

export const dynamic = "force-dynamic";

// C10-POLICY §2 — self-serve reschedule. The boundary is judged against the
// ORIGINAL time (that's the held slot), so the disclosure sits on the page
// header BEFORE a new time is picked — no surprises at the confirm step.
export default async function RescheduleSessionPage({
  params,
  searchParams,
}: {
  params: { appointmentId: string };
  searchParams: { start?: string; error?: string };
}) {
  const user = await requireClient();
  const t = await getTranslations("sessions");
  const dateLocale = user.locale === "es" ? "es-419" : "en-US";

  const appt = await prisma.appointment.findUnique({ where: { id: params.appointmentId } });
  if (!appt || appt.clientId !== user.id || appt.status !== "SCHEDULED") {
    return (
      <div className="flex flex-col gap-6">
        <Header eyebrow={t("schedule.eyebrow")} title={t("cancel.goneTitle")} />
        <p className="text-ink">{t("cancel.goneBody")}</p>
        <Link
          href="/space/schedule"
          className="self-start text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
        >
          {t("purchase.back")}
        </Link>
      </div>
    );
  }

  const config = await getOrCreateConfig(appt.practitionerId);
  const policy = await checkChangePolicy(appt);
  const amount = formatMoney(policy.lateFeeCents);
  const now = new Date();

  const when = (d: Date) =>
    `${formatInZone(d, config.timezone, {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      locale: dateLocale,
    })} ${zoneAbbrev(d, config.timezone)}`;

  // A chosen new time (from the slot grid) — validated server-side again here.
  const chosen = searchParams.start ? new Date(searchParams.start) : null;
  const chosenValid =
    chosen &&
    !Number.isNaN(chosen.getTime()) &&
    (await isSlotOpen(appt.practitionerId, chosen, now));

  const base = `/space/schedule/reschedule/${appt.id}`;

  return (
    <div className="flex flex-col gap-6">
      <Header eyebrow={t("schedule.eyebrow")} title={t("reschedule.title")} />

      <p className="text-ink">{t("reschedule.current", { when: when(appt.startAt) })}</p>

      {/* C10-POLICY — the disclosure BEFORE picking, only on the fee path. */}
      {policy.late && (
        <p className="max-w-prose rounded-md border border-mocha bg-white px-4 py-3 text-sm text-wine">
          {t("reschedule.lateNotice", { hours: policy.cutoffHours, amount })}{" "}
          <Link href="/space/messages" className="font-medium underline underline-offset-4">
            {t("cancel.message")}
          </Link>
        </p>
      )}

      {searchParams.error === "taken" && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          {t("reschedule.taken")}
        </p>
      )}

      {chosenValid && chosen ? (
        <div className="rounded-lg border border-line bg-white p-6 shadow-soft">
          <p className="text-sm text-slate">{t("reschedule.from", { when: when(appt.startAt) })}</p>
          <p className="mt-1 text-lg font-medium text-ink-strong">
            {t("reschedule.to", { when: when(chosen) })}
          </p>
          <form action={rescheduleMyAppointment.bind(null, appt.id)} className="mt-5">
            <input type="hidden" name="start" value={chosen.toISOString()} />
            {policy.late && <input type="hidden" name="feeConfirmed" value="1" />}
            <div className="flex flex-wrap items-center gap-4">
              <PendingButton className="rounded-md bg-wine px-5 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-wine/90">
                {policy.late ? t("reschedule.confirmFee", { amount }) : t("reschedule.confirm")}
              </PendingButton>
              <Link
                href={base}
                className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
              >
                {t("reschedule.another")}
              </Link>
              <Link
                href="/space/schedule"
                className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
              >
                {t("cancel.keep")}
              </Link>
            </div>
          </form>
        </div>
      ) : (
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">{t("reschedule.pick")}</h2>
          <NewTimeSlots
            practitionerId={appt.practitionerId}
            timezone={config.timezone}
            maxAdvanceDays={config.maxAdvanceDays}
            now={now}
            confirmBase={base}
          />
        </section>
      )}

      <Link
        href="/space/schedule"
        className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
      >
        {t("purchase.back")}
      </Link>
    </div>
  );
}

function Header({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="flex flex-col gap-2">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="text-[2.25rem] font-semibold">{title}</h1>
      <SignatureRule />
    </div>
  );
}

async function NewTimeSlots({
  practitionerId,
  timezone,
  maxAdvanceDays,
  now,
  confirmBase,
}: {
  practitionerId: string;
  timezone: string;
  maxAdvanceDays: number;
  now: Date;
  confirmBase: string;
}) {
  const { slots } = await openSlots(
    practitionerId,
    now,
    new Date(now.getTime() + maxAdvanceDays * DAY_MS),
    now,
  );
  return <SlotGrid slots={slots} timezone={timezone} confirmBase={confirmBase} />;
}
