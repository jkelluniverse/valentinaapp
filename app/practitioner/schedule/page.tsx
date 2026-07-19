import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { getBaseUrl } from "@/lib/base-url";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { getPractitioner, getOrCreateConfig, formatInZone, zoneAbbrev, DAY_MS } from "@/lib/schedule";
import { partyLabel } from "@/lib/appointments";
import { formatMoney } from "@/lib/billing";
import { emailConfigured } from "@/lib/notify";
import { CopyField } from "@/components/CopyField";
import { rotateFeedSecret } from "../availability/actions";
import { waiveCharge } from "../billing/actions";
import {
  markSessionCompleted,
  markSessionNoShow,
  markSessionDidntHappen,
  revertSessionStatus,
  setCalendarSyncDone,
} from "./actions";

export const dynamic = "force-dynamic";

const MARK_BANNERS: Record<string, string> = {
  completed: "Marked completed.",
  noshow: "Marked as a no-show.",
  quiet: "Set aside quietly — no fee, nothing owed.",
  reverted: "Back to scheduled.",
};

export default async function PractitionerSchedulePage({
  searchParams,
}: {
  searchParams: { saved?: string; marked?: string; billing?: string };
}) {
  await requirePractitioner();
  const practitioner = await getPractitioner();
  if (!practitioner) return null;

  const config = await getOrCreateConfig(practitioner.id);
  const now = new Date();

  const [appointments, recent] = await Promise.all([
    prisma.appointment.findMany({
      where: {
        practitionerId: practitioner.id,
        status: "SCHEDULED",
        endAt: { gt: now },
      },
      include: {
        client: { select: { id: true, name: true, email: true } },
        lead: { select: { name: true, email: true } }, // C18 — discovery calls
      },
      orderBy: { startAt: "asc" },
      take: 100,
    }),
    // C13-PKG §5 — past sessions (and today's ended ones), her overrides. The
    // cron auto-completes; anything still SCHEDULED here just hasn't ticked
    // over yet, or needs a different word from her.
    prisma.appointment.findMany({
      where: {
        practitionerId: practitioner.id,
        kind: "SESSION",
        status: { in: ["SCHEDULED", "COMPLETED", "NO_SHOW"] },
        endAt: { lte: now, gte: new Date(now.getTime() - 14 * DAY_MS) },
      },
      include: {
        client: { select: { id: true, name: true, email: true } },
        lead: { select: { name: true, email: true } },
      },
      orderBy: { startAt: "desc" },
      take: 50,
    }),
  ]);
  // C13.6c — the quiet payment mark: ring = awaiting, filled = paid.
  const charges = await prisma.charge.findMany({
    where: {
      appointmentId: { in: [...appointments, ...recent].map((a) => a.id) },
    },
  });
  const chargeFor = new Map(
    charges.filter((c) => c.kind === "SESSION").map((c) => [c.appointmentId!, c]),
  );
  const lateFeeFor = new Map(
    charges.filter((c) => c.kind === "LATE_FEE").map((c) => [c.appointmentId!, c]),
  );

  const base = getBaseUrl();
  const httpsFeed = `${base}/api/calendar/${config.calendarFeedSecret}.ics`;
  const webcalFeed = httpsFeed.replace(/^https?:/, "webcal:");
  const calendarSyncDone =
    (await prisma.practiceSetting.findUnique({ where: { key: "calendarSyncDone" } }))?.value ===
    "on";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>Scheduling</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">Your schedule</h1>
        <SignatureRule />
        <p className="max-w-prose text-ink">
          Upcoming sessions, and the calendar feed that keeps your iPhone in sync.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link
          href="/practitioner/availability"
          className="rounded-md border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush"
        >
          Set availability
        </Link>
      </div>

      {searchParams.saved === "rotated" && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          Feed link rotated — re-subscribe with the new link below; the old one no longer works.
        </p>
      )}
      {searchParams.marked && MARK_BANNERS[searchParams.marked] && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          {MARK_BANNERS[searchParams.marked]}
        </p>
      )}
      {searchParams.billing === "waived" && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          Waived — noted with your name.
        </p>
      )}

      {/* Calendar sync — full card until she marks it verified, then one line. */}
      {calendarSyncDone ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white px-5 py-3 text-sm shadow-soft">
          <span className="text-ink">
            <span className="font-medium text-ink-strong">Calendar synced ✓</span> — your bookings
            flow to Apple Calendar.
          </span>
          <form action={setCalendarSyncDone.bind(null, false)} className="ml-auto">
            <button className="font-medium text-slate underline-offset-4 hover:text-wine hover:underline">
              Show setup
            </button>
          </form>
        </div>
      ) : (
        <section className="rounded-lg border border-line bg-white p-6 shadow-soft">
          <h2 className="mb-1 text-xl font-semibold">Sync to your iPhone</h2>
          <p className="mb-4 max-w-prose text-sm text-slate">
            Subscribe once and your bookings appear in Apple Calendar with your normal alerts. On
            iPhone: tap the link below, or Settings → Calendar → Accounts → Add Account → Other →
            Add Subscribed Calendar, and paste the address. It&apos;s one-way and refreshes on
            iOS&apos;s own schedule (minutes up to an hour) — each booking email also carries a
            one-tap invite.
          </p>
          <div className="flex flex-col gap-4">
            <a
              href={webcalFeed}
              className="self-start rounded-md bg-wine px-5 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-wine/90"
            >
              Add to Apple Calendar
            </a>
            <CopyField label="Or copy the feed address" value={httpsFeed} />
            <p className="text-xs text-slate">
              Keep this address private — anyone with it can see your sessions. Rotating it revokes
              the old link.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <form action={setCalendarSyncDone.bind(null, true)}>
                <button className="rounded-md border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush">
                  It&apos;s syncing — mark as done
                </button>
              </form>
              <form action={rotateFeedSecret}>
                <button className="text-sm font-medium text-slate underline-offset-4 hover:text-wine hover:underline">
                  Rotate feed link
                </button>
              </form>
            </div>
          </div>
        </section>
      )}

      {!emailConfigured() && (
        <p className="rounded-md border border-mocha bg-white px-4 py-3 text-sm text-wine">
          Booking notification emails are off until an email provider is configured
          (RESEND_API_KEY + NOTIFY_FROM_EMAIL). Bookings still work and appear on the calendar feed.
        </p>
      )}

      {/* Upcoming */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Upcoming sessions</h2>
        {appointments.length === 0 ? (
          <p className="text-ink">No upcoming sessions.</p>
        ) : (
          appointments.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white p-5 shadow-soft"
            >
              <p className="font-medium text-ink-strong">
                {formatInZone(a.startAt, config.timezone, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}{" "}
                <span className="text-slate">{zoneAbbrev(a.startAt, config.timezone)}</span>
              </p>
              {a.kind === "DISCOVERY" ? (
                <Link
                  href="/practitioner/leads"
                  className="font-medium text-wine underline-offset-4 hover:underline"
                >
                  Discovery — {partyLabel(a)}
                </Link>
              ) : (
                <Link
                  href={`/practitioner/clients/${a.client?.id ?? ""}`}
                  className="font-medium text-wine underline-offset-4 hover:underline"
                >
                  {partyLabel(a)}
                </Link>
              )}
              <span className="inline-flex items-center rounded-full bg-blush-deep px-2.5 py-0.5 text-xs font-medium text-wine">
                {a.location === "VIRTUAL" ? "Virtual" : "In person"}
              </span>
              {(() => {
                const c = chargeFor.get(a.id);
                if (!c) return null;
                if (c.status === "PAID")
                  return (
                    <span title="Paid" className="inline-block h-2.5 w-2.5 rounded-full bg-wine" />
                  );
                if (c.status === "DUE" || c.status === "PENDING")
                  return (
                    <span
                      title="Awaiting payment"
                      className="inline-block h-2.5 w-2.5 rounded-full border-2 border-mocha"
                    />
                  );
                return null;
              })()}
              {a.bookedBy === "client" && (
                <span className="text-xs text-slate">booked by client</span>
              )}
              {a.location === "VIRTUAL" && a.videoUrl && (
                <a
                  href={a.videoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto rounded-md border border-mocha px-3 py-1.5 text-sm font-medium text-wine transition-colors hover:bg-blush"
                >
                  Join
                </a>
              )}
            </div>
          ))
        )}
      </section>

      {/* C13-PKG §5 + C10-POLICY §3 — recent sessions: how each one landed.
          One-tap words, not modals; the cron auto-completes the usual case. */}
      {recent.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Recent sessions</h2>
          <div className="flex flex-col divide-y divide-line rounded-lg border border-line bg-white shadow-soft">
            {recent.map((a) => {
              const fee = lateFeeFor.get(a.id);
              return (
                <div key={a.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5 text-sm">
                  <span className="text-ink">
                    {formatInZone(a.startAt, config.timezone, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                  <Link
                    href={`/practitioner/clients/${a.client?.id ?? ""}`}
                    className="font-medium text-ink-strong underline-offset-4 hover:text-wine hover:underline"
                  >
                    {partyLabel(a)}
                  </Link>
                  {a.status === "SCHEDULED" ? (
                    <span className="ml-auto flex items-center gap-3">
                      <form action={markSessionCompleted.bind(null, a.id)}>
                        <button className="font-medium text-wine underline-offset-4 hover:underline">
                          Completed
                        </button>
                      </form>
                      <span className="text-line">·</span>
                      <form action={markSessionNoShow.bind(null, a.id)}>
                        <button className="font-medium text-slate underline-offset-4 hover:text-wine hover:underline">
                          No-show
                        </button>
                      </form>
                      <span className="text-line">·</span>
                      <form action={markSessionDidntHappen.bind(null, a.id)}>
                        <button className="font-medium text-slate underline-offset-4 hover:text-wine hover:underline">
                          Didn&apos;t happen
                        </button>
                      </form>
                    </span>
                  ) : (
                    <span className="ml-auto flex items-center gap-3">
                      <span className="text-slate">
                        {a.status === "COMPLETED" ? "completed" : "no-show"}
                      </span>
                      {a.status === "NO_SHOW" &&
                        fee &&
                        (fee.status === "DUE" || fee.status === "PENDING") && (
                          <span className="flex items-center gap-2 text-xs text-slate">
                            {formatMoney(fee.amountCents, fee.currency)} fee applied
                            <form action={waiveCharge.bind(null, fee.id)}>
                              <input type="hidden" name="back" value="/practitioner/schedule" />
                              <button className="font-medium text-slate underline-offset-4 hover:text-wine hover:underline">
                                Waive
                              </button>
                            </form>
                          </span>
                        )}
                      <form action={revertSessionStatus.bind(null, a.id)}>
                        <button className="font-medium text-slate underline-offset-4 hover:text-wine hover:underline">
                          Revert
                        </button>
                      </form>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
