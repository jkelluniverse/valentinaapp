import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { SlotGrid } from "@/components/SlotGrid";
import {
  getPractitioner,
  getOrCreateConfig,
  openSlots,
  formatInZone,
  zoneAbbrev,
  isSlotOpen,
  DAY_MS,
} from "@/lib/schedule";
import { bookForClient } from "../actions";
import { PendingButton } from "@/components/PendingButton";

export const dynamic = "force-dynamic";

export default async function BookForClientPage({
  params,
  searchParams,
}: {
  params: { clientId: string };
  searchParams: { start?: string; error?: string };
}) {
  await requirePractitioner();
  const practitioner = await getPractitioner();
  if (!practitioner) notFound();

  const client = await prisma.user.findFirst({
    where: { id: params.clientId, role: "CLIENT" },
    select: { id: true, name: true, email: true },
  });
  if (!client) notFound();

  const config = await getOrCreateConfig(practitioner.id);
  const now = new Date();
  const name = client.name || client.email;

  // If a slot was chosen, show the compact confirm; else show the picker.
  const chosen = searchParams.start ? new Date(searchParams.start) : null;
  const chosenValid =
    chosen && !Number.isNaN(chosen.getTime()) && (await isSlotOpen(practitioner.id, chosen, now));

  const bookAction = bookForClient.bind(null, client.id);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>Book a session</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">{name}</h1>
        <SignatureRule />
      </div>

      {searchParams.error === "taken" && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          That time is no longer free — pick another.
        </p>
      )}
      {searchParams.error === "anytime" && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          Enter a valid date and time.
        </p>
      )}

      {chosenValid && chosen ? (
        <div className="rounded-lg border border-line bg-white p-6 shadow-soft">
          <p className="text-lg font-medium text-ink-strong">
            {formatInZone(chosen, config.timezone, {
              weekday: "long",
              month: "long",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}{" "}
            <span className="text-slate">{zoneAbbrev(chosen, config.timezone)}</span>
          </p>
          <form action={bookAction} className="mt-5 flex flex-col gap-4">
            <input type="hidden" name="mode" value="slot" />
            <input type="hidden" name="start" value={chosen.toISOString()} />
            <ConfirmFields />
            <div className="flex items-center gap-4">
              <PendingButton className="rounded-md bg-wine px-5 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-wine/90">
                Confirm for {name}
              </PendingButton>
              <Link
                href={`/practitioner/clients/${client.id}/book`}
                className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
              >
                Pick another time
              </Link>
            </div>
          </form>
        </div>
      ) : (
        <>
          <section className="flex flex-col gap-4">
            <h2 className="text-xl font-semibold">Open times</h2>
            <PickerSlots
              practitionerId={practitioner.id}
              clientId={client.id}
              timezone={config.timezone}
              now={now}
              maxAdvanceDays={config.maxAdvanceDays}
            />
          </section>

          <section className="rounded-lg border border-line bg-white p-6 shadow-soft">
            <h2 className="mb-1 text-xl font-semibold">Any time</h2>
            <p className="mb-4 text-sm text-slate">
              Book outside your standard hours — for the end-of-session next booking.
            </p>
            <form action={bookAction} className="flex flex-col gap-4">
              <input type="hidden" name="mode" value="anytime" />
              <div className="flex flex-wrap gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-ink-strong">Date</span>
                  <input
                    type="date"
                    name="date"
                    required
                    className="rounded-md border border-line px-3 py-2 text-ink"
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium text-ink-strong">
                    Time ({zoneAbbrev(now, config.timezone)})
                  </span>
                  <input
                    type="time"
                    name="time"
                    required
                    className="rounded-md border border-line px-3 py-2 text-ink"
                  />
                </label>
              </div>
              <ConfirmFields />
              <PendingButton className="self-start rounded-md border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush">
                Book this time
              </PendingButton>
            </form>
          </section>
        </>
      )}

      <Link
        href={`/practitioner/clients/${client.id}`}
        className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
      >
        Back to {name}
      </Link>
    </div>
  );
}

function ConfirmFields() {
  return (
    <div className="flex flex-wrap gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink-strong">Location</span>
        <select name="location" className="rounded-md border border-line px-3 py-2 text-ink">
          <option value="VIRTUAL">Virtual</option>
          <option value="IN_PERSON">In person</option>
        </select>
      </label>
      <label className="flex flex-1 flex-col gap-1.5">
        <span className="text-sm font-medium text-ink-strong">Topic (optional)</span>
        <input
          type="text"
          name="note"
          className="rounded-md border border-line px-3 py-2 text-ink"
          placeholder="What you'll focus on"
        />
      </label>
    </div>
  );
}

async function PickerSlots({
  practitionerId,
  clientId,
  timezone,
  now,
  maxAdvanceDays,
}: {
  practitionerId: string;
  clientId: string;
  timezone: string;
  now: Date;
  maxAdvanceDays: number;
}) {
  const { slots } = await openSlots(
    practitionerId,
    now,
    new Date(now.getTime() + maxAdvanceDays * DAY_MS),
    now,
  );
  return (
    <SlotGrid
      slots={slots}
      timezone={timezone}
      confirmBase={`/practitioner/clients/${clientId}/book`}
    />
  );
}
