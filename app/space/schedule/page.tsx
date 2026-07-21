import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { AddToCalendar } from "@/components/AddToCalendar";
import { SlotGrid } from "@/components/SlotGrid";
import {
  getPractitioner,
  getOrCreateConfig,
  openSlots,
  formatInZone,
  zoneAbbrev,
  DAY_MS,
} from "@/lib/schedule";
import { clientPackageSummary } from "@/lib/packages";
import { formatMoney } from "@/lib/billing";

export const dynamic = "force-dynamic";

// C13-PKG §10 + C10-POLICY §2 — the client's sessions home: package standing
// (words first, pips as content), upcoming sessions with Reschedule and Cancel
// always both offered (the cost changes at the boundary, never the ability),
// and the "Continue our work" package shelf.
export default async function ClientSchedulePage({
  searchParams,
}: {
  searchParams: {
    booked?: string;
    cancelled?: string;
    rescheduled?: string;
    fee?: string;
    error?: string;
    paid?: string;
    package?: string;
  };
}) {
  const user = await requireClient();
  const t = await getTranslations("sessions");
  const dateLocale = user.locale === "es" ? "es-419" : "en-US";

  const practitioner = await getPractitioner();
  if (!practitioner) {
    return <p className="text-ink">{t("schedule.notSetUp")}</p>;
  }
  const config = await getOrCreateConfig(practitioner.id);
  const now = new Date();

  const [upcoming, { slots }, charges, packages, packageSkus] = await Promise.all([
    prisma.appointment.findMany({
      where: { clientId: user.id, status: "SCHEDULED", startAt: { gte: now } },
      orderBy: { startAt: "asc" },
    }),
    openSlots(practitioner.id, now, new Date(now.getTime() + config.maxAdvanceDays * DAY_MS), now),
    prisma.charge.findMany({ where: { clientId: user.id } }),
    clientPackageSummary(user.id),
    prisma.priceBook.findMany({
      where: { active: true, kind: "PACKAGE" },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const chargeFor = new Map(
    charges
      .filter((c) => c.appointmentId && c.kind === "SESSION")
      .map((c) => [c.appointmentId!, c]),
  );
  const openFees = charges.filter(
    (c) => c.kind === "LATE_FEE" && (c.status === "DUE" || c.status === "PENDING"),
  );
  const activePackages = packages.filter((p) => p.status === "ACTIVE");
  const pastPackages = packages.filter((p) => p.status !== "ACTIVE");

  const whenLabel = (d: Date) =>
    formatInZone(d, config.timezone, {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      locale: dateLocale,
    });
  const dayLabel = (d: Date) =>
    formatInZone(d, config.timezone, { month: "long", year: "numeric", locale: dateLocale });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>{t("schedule.eyebrow")}</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">{t("schedule.title")}</h1>
        <SignatureRule />
      </div>

      {searchParams.booked && <Notice>{t("schedule.banner.booked")}</Notice>}
      {searchParams.cancelled && (
        <Notice>
          {searchParams.fee ? t("schedule.banner.cancelledFee") : t("schedule.banner.cancelled")}
        </Notice>
      )}
      {searchParams.rescheduled && (
        <Notice>
          {searchParams.fee
            ? t("schedule.banner.rescheduledFee")
            : t("schedule.banner.rescheduled")}
        </Notice>
      )}
      {searchParams.paid && <Notice>{t("schedule.banner.paid")}</Notice>}
      {searchParams.package && <Notice>{t("schedule.banner.package")}</Notice>}
      {searchParams.error === "taken" && <Notice>{t("schedule.banner.taken")}</Notice>}

      {!user.consentAt && (
        <p className="rounded-md border border-mocha bg-white px-4 py-3 text-sm text-wine">
          {t("schedule.noConsent")}
        </p>
      )}

      {/* C13-PKG §10 — the package widget: words first, pips as content. */}
      {packages.length > 0 && (
        <section className="rounded-lg border border-line bg-white p-6 shadow-soft">
          <p className="text-label font-semibold uppercase tracking-wide text-mocha">
            {t("package.title")}
          </p>
          {activePackages.length === 0 ? (
            <p className="mt-2 text-ink">{t("package.allComplete")}</p>
          ) : (
            <div className="mt-2 flex flex-col gap-4">
              {activePackages.map((p) => (
                <div key={p.id} className="flex flex-col gap-1.5">
                  <p className="text-lg font-medium text-ink-strong">
                    {t("package.remaining", { count: p.sessionsTotal - p.used })}
                  </p>
                  <p
                    className="text-lg leading-none tracking-[0.35em] text-mocha"
                    aria-label={t("package.pipsLabel", {
                      used: p.used,
                      reserved: p.reserved,
                      available: p.available,
                    })}
                  >
                    {"●".repeat(p.used)}
                    {"◐".repeat(p.reserved)}
                    {"○".repeat(p.available)}
                  </p>
                  <p className="text-sm text-slate">
                    {t("package.detail", {
                      total: p.sessionsTotal,
                      used: p.used,
                      reserved: p.reserved,
                    })}
                    {p.expiresAt ? ` · ${t("package.through", { date: dayLabel(p.expiresAt) })}` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
          {pastPackages.length > 0 && (
            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-medium text-slate underline-offset-4 hover:text-wine hover:underline">
                {t("package.history")}
              </summary>
              <ul className="mt-2 flex flex-col gap-1.5">
                {pastPackages.map((p) => (
                  <li key={p.id} className="text-sm text-slate">
                    {t("package.historyItem", {
                      total: p.sessionsTotal,
                      date: dayLabel(p.purchasedAt),
                    })}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      )}

      {/* C10-POLICY — open late-change fees, settled the same way as sessions. */}
      {openFees.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">{t("fees.title")}</h2>
          {openFees.map((c) => (
            <div
              key={c.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white px-5 py-4 shadow-soft"
            >
              <span className="text-sm text-ink">
                {c.feeReason === "NO_SHOW"
                  ? t("fees.reason.NO_SHOW")
                  : c.feeReason === "LATE_CANCEL"
                    ? t("fees.reason.LATE_CANCEL")
                    : t("fees.reason.LATE_RESCHEDULE")}
                {" · "}
                {formatMoney(c.amountCents, c.currency)}
              </span>
              {c.status === "DUE" ? (
                <Link
                  href={`/space/schedule/pay/${c.id}`}
                  className="ml-auto rounded-md bg-wine px-3.5 py-1.5 text-sm font-medium text-cream transition-colors hover:bg-wine/90"
                >
                  {t("fees.settle")}
                </Link>
              ) : (
                <span className="ml-auto text-sm text-slate">{t("schedule.pending")}</span>
              )}
            </div>
          ))}
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">{t("schedule.upcoming")}</h2>
          {upcoming.map((a) => {
            const charge = chargeFor.get(a.id);
            return (
              <div
                key={a.id}
                className="flex flex-col gap-2 rounded-lg border border-line bg-white p-5 shadow-soft"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <p className="font-medium text-ink-strong">
                    {whenLabel(a.startAt)}{" "}
                    <span className="text-slate">{zoneAbbrev(a.startAt, config.timezone)}</span>
                  </p>
                  {/* C19 §0 — no secrets: the client always sees when a
                      session is (to be) recorded. */}
                  {a.recordingConfirmed && (
                    <span className="text-[12px] text-slate">
                      {user.locale === "es" ? "esta sesión se graba" : "this session is recorded"}
                    </span>
                  )}
                  <span className="ml-auto flex items-center gap-4">
                    {a.location === "VIRTUAL" && a.videoUrl && (
                      <a
                        href={a.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md bg-wine px-4 py-1.5 text-sm font-medium text-cream transition-colors hover:bg-wine/90"
                      >
                        {t("schedule.join")}
                      </a>
                    )}
                    {/* C10-POLICY §2 — always both. The cost changes at the
                        boundary, never the ability. */}
                    <Link
                      href={`/space/schedule/reschedule/${a.id}`}
                      className="text-sm font-medium text-slate underline-offset-4 hover:text-wine hover:underline"
                    >
                      {t("schedule.reschedule")}
                    </Link>
                    <Link
                      href={`/space/schedule/cancel/${a.id}`}
                      className="text-sm font-medium text-slate underline-offset-4 hover:text-wine hover:underline"
                    >
                      {t("schedule.cancel")}
                    </Link>
                  </span>
                </div>
                <AddToCalendar
                  event={{
                    title: "Session · Valentina Vélez",
                    start: a.startAt,
                    end: a.endAt,
                    description:
                      a.location === "VIRTUAL" && a.videoUrl
                        ? `Join here at the time: ${a.videoUrl}`
                        : null,
                    location: a.location === "VIRTUAL" ? a.videoUrl ?? "Virtual" : "In person",
                  }}
                  icsHref={`/api/appointment-invite/${a.id}`}
                  label={t("schedule.addToCalendar")}
                />
                {a.clientNote && (
                  <p className="text-sm text-slate">{t("schedule.topic", { note: a.clientNote })}</p>
                )}
                {charge && charge.status === "COVERED" && (
                  <p className="flex items-center gap-2 text-sm text-slate">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-mocha" />
                    {t("schedule.covered")}
                  </p>
                )}
                {charge && charge.status === "PAID" && (
                  <p className="flex items-center gap-2 text-sm text-slate">
                    <span className="inline-block h-2.5 w-2.5 rounded-full bg-wine" />
                    {t("schedule.paid")}
                    {charge.paidAt ? ` · ${charge.paidAt.toISOString().slice(0, 10)}` : ""}
                  </p>
                )}
                {charge && (charge.status === "DUE" || charge.status === "PENDING") && (
                  <p className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="flex items-center gap-2 text-slate">
                      <span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-mocha" />
                      {charge.status === "PENDING" ? t("schedule.pending") : t("schedule.due")}
                    </span>
                    {charge.status === "DUE" && (
                      <Link
                        href={`/space/schedule/pay/${charge.id}`}
                        className="rounded-md bg-wine px-3.5 py-1.5 text-sm font-medium text-cream transition-colors hover:bg-wine/90"
                      >
                        {t("schedule.settle")}
                      </Link>
                    )}
                  </p>
                )}
              </div>
            );
          })}
        </section>
      )}

      {user.consentAt && (
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">{t("schedule.openTimes")}</h2>
          <SlotGrid slots={slots} timezone={config.timezone} confirmBase="/space/schedule/confirm" />
        </section>
      )}

      {/* C13-PKG §10 — Continue our work: her package SKUs, her names. */}
      {packageSkus.length > 0 && (
        <section className="rounded-lg border border-line bg-white p-6 shadow-soft">
          <h2 className="mb-1 text-xl font-semibold">{t("continue.title")}</h2>
          <p className="mb-4 max-w-prose text-sm text-slate">{t("continue.lede")}</p>
          <ul className="flex flex-col gap-2">
            {packageSkus.map((sku) => (
              <li key={sku.id}>
                <Link
                  href={`/space/schedule/packages/${sku.id}`}
                  className="flex flex-wrap items-center gap-3 rounded-md border border-line/70 px-4 py-3 transition-colors hover:bg-blush"
                >
                  <span className="font-medium text-ink-strong">{sku.name}</span>
                  {sku.sessionsIncluded ? (
                    <span className="text-sm text-slate">
                      {t("continue.sessions", { count: sku.sessionsIncluded })}
                    </span>
                  ) : null}
                  <span className="ml-auto text-sm font-medium text-wine">
                    {formatMoney(sku.amountCents, sku.currency)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link
        href="/space"
        className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
      >
        {t("schedule.back")}
      </Link>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">{children}</p>;
}
