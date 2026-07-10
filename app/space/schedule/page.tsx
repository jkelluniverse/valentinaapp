import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { SlotGrid } from "@/components/SlotGrid";
import {
  getPractitioner,
  getOrCreateConfig,
  openSlots,
  formatInZone,
  zoneAbbrev,
  DAY_MS,
} from "@/lib/schedule";
import { cancelMyAppointment } from "./actions";

export const dynamic = "force-dynamic";

export default async function ClientSchedulePage({
  searchParams,
}: {
  searchParams: { booked?: string; cancelled?: string; error?: string };
}) {
  const user = await requireClient();
  const practitioner = await getPractitioner();
  if (!practitioner) {
    return <p className="text-ink">Scheduling isn&apos;t set up yet.</p>;
  }
  const config = await getOrCreateConfig(practitioner.id);
  const now = new Date();

  const [upcoming, { slots }] = await Promise.all([
    prisma.appointment.findMany({
      where: { clientId: user.id, status: "SCHEDULED", startAt: { gte: now } },
      orderBy: { startAt: "asc" },
    }),
    openSlots(practitioner.id, now, new Date(now.getTime() + config.maxAdvanceDays * DAY_MS), now),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>Sessions</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">Book a session</h1>
        <SignatureRule />
      </div>

      {searchParams.booked && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          You&apos;re booked — a confirmation is on its way, and it&apos;s on the calendar below.
        </p>
      )}
      {searchParams.cancelled && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          That session was cancelled.
        </p>
      )}
      {searchParams.error === "taken" && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          That time was just taken — please pick another.
        </p>
      )}
      {searchParams.error === "cutoff" && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          It&apos;s too close to the session to cancel here — reach out directly.
        </p>
      )}

      {!user.consentAt && (
        <p className="rounded-md border border-mocha bg-white px-4 py-3 text-sm text-wine">
          Your consent isn&apos;t on record yet, so booking isn&apos;t open. Please reach out to
          Valentina.
        </p>
      )}

      {upcoming.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Your upcoming sessions</h2>
          {upcoming.map((a) => {
            const cancelCutoff = new Date(a.startAt.getTime() - config.cancelCutoffHours * 3600_000);
            const canCancel = now < cancelCutoff;
            return (
              <div
                key={a.id}
                className="flex flex-col gap-2 rounded-lg border border-line bg-white p-5 shadow-soft"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <p className="font-medium text-ink-strong">
                    {formatInZone(a.startAt, config.timezone, {
                      weekday: "long",
                      month: "long",
                      day: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}{" "}
                    <span className="text-slate">{zoneAbbrev(a.startAt, config.timezone)}</span>
                  </p>
                  <span className="ml-auto flex items-center gap-4">
                    {a.location === "VIRTUAL" && a.videoUrl && (
                      <a
                        href={a.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-md bg-wine px-4 py-1.5 text-sm font-medium text-cream transition-colors hover:bg-wine/90"
                      >
                        Join
                      </a>
                    )}
                    {canCancel && (
                      <form action={cancelMyAppointment.bind(null, a.id)}>
                        <button className="text-sm font-medium text-slate underline-offset-4 hover:text-wine hover:underline">
                          Cancel
                        </button>
                      </form>
                    )}
                  </span>
                </div>
                {a.clientNote && <p className="text-sm text-slate">Topic: {a.clientNote}</p>}
              </div>
            );
          })}
        </section>
      )}

      {user.consentAt && (
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">Open times</h2>
          <SlotGrid slots={slots} timezone={config.timezone} confirmBase="/space/schedule/confirm" />
        </section>
      )}

      <Link
        href="/space"
        className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
      >
        Back to your space
      </Link>
    </div>
  );
}
