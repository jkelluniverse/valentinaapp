import Link from "next/link";
import { requireClient } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { getPractitioner, getOrCreateConfig, isSlotOpen, formatInZone, zoneAbbrev } from "@/lib/schedule";
import { bookSlot } from "../actions";

export const dynamic = "force-dynamic";

export default async function ConfirmBookingPage({
  searchParams,
}: {
  searchParams: { start?: string };
}) {
  const user = await requireClient();
  const practitioner = await getPractitioner();
  const startAt = searchParams.start ? new Date(searchParams.start) : null;

  const valid =
    practitioner &&
    startAt &&
    !Number.isNaN(startAt.getTime()) &&
    Boolean(user.consentAt) &&
    (await isSlotOpen(practitioner.id, startAt, new Date()));

  if (!valid || !startAt || !practitioner) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Eyebrow>Sessions</Eyebrow>
          <h1 className="text-[2.25rem] font-semibold">That time isn&apos;t available</h1>
          <SignatureRule />
        </div>
        <p className="text-ink">It may have just been taken. Please choose another open time.</p>
        <Link
          href="/space/schedule"
          className="self-start rounded-md border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush"
        >
          Back to open times
        </Link>
      </div>
    );
  }

  const config = await getOrCreateConfig(practitioner.id);
  const label = formatInZone(startAt, config.timezone, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Eyebrow>Sessions</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">Confirm your session</h1>
        <SignatureRule />
      </div>

      <div className="rounded-lg border border-line bg-white p-6 shadow-soft">
        <p className="text-lg font-medium text-ink-strong">
          {label} <span className="text-slate">{zoneAbbrev(startAt, config.timezone)}</span>
        </p>
        <p className="mt-1 text-sm text-slate">{config.sessionMinutes} minutes · virtual session</p>

        <form action={bookSlot} className="mt-5 flex flex-col gap-4">
          <input type="hidden" name="start" value={startAt.toISOString()} />
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-strong">
              Anything you&apos;d like to focus on? (optional)
            </span>
            <textarea
              name="note"
              rows={3}
              className="rounded-md border border-line px-3 py-2 text-ink"
              placeholder="A word on what's on your mind"
            />
          </label>
          <div className="flex items-center gap-4">
            <button className="rounded-md bg-wine px-5 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-wine/90">
              Confirm booking
            </button>
            <Link
              href="/space/schedule"
              className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
            >
              Pick another time
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
