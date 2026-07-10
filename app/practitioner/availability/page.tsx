import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { getPractitioner, getOrCreateConfig } from "@/lib/schedule";
import {
  WEEKDAYS,
  COMMON_TIMEZONES,
  tzLabel,
  minutesToTimeValue,
  minutesToLabel,
} from "@/lib/schedule-meta";
import { saveConfig, saveWeekdayHours, addException, deleteException } from "./actions";

export const dynamic = "force-dynamic";

const NUMBERS: { name: string; label: string; hint: string; min: number; max: number }[] = [
  { name: "sessionMinutes", label: "Session length", hint: "minutes", min: 15, max: 240 },
  { name: "bufferMinutes", label: "Buffer between", hint: "minutes", min: 0, max: 120 },
  { name: "minNoticeHours", label: "Minimum notice", hint: "hours ahead", min: 0, max: 336 },
  { name: "maxAdvanceDays", label: "Booking window", hint: "days out", min: 1, max: 365 },
  { name: "cancelCutoffHours", label: "Cancel cutoff", hint: "hours before", min: 0, max: 336 },
];

export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: { saved?: string; error?: string };
}) {
  await requirePractitioner();
  const practitioner = await getPractitioner();
  if (!practitioner) return null;

  const config = await getOrCreateConfig(practitioner.id);
  const [rules, exceptions] = await Promise.all([
    prisma.availabilityRule.findMany({ where: { practitionerId: practitioner.id } }),
    prisma.availabilityException.findMany({
      where: { practitionerId: practitioner.id, date: { gte: startOfToday() } },
      orderBy: { date: "asc" },
    }),
  ]);

  // One window per weekday in the grid (the model allows more; the UI keeps it calm).
  const byWeekday = new Map<number, (typeof rules)[number]>();
  for (const r of rules) if (!byWeekday.has(r.weekday)) byWeekday.set(r.weekday, r);

  const cfg = config as unknown as Record<string, number>;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>Scheduling</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">Your availability</h1>
        <SignatureRule />
        <p className="max-w-prose text-ink">
          Set the hours you offer, one day at a time. Clients only ever see open slots inside these
          hours.
        </p>
      </div>

      {searchParams.saved && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">Saved.</p>
      )}
      {searchParams.error === "date" && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          Pick a valid date for the exception.
        </p>
      )}
      {searchParams.error === "window" && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          An extra opening needs a start and end time.
        </p>
      )}

      {/* Weekly hours */}
      <section className="rounded-lg border border-line bg-white p-6 shadow-soft">
        <h2 className="mb-1 text-xl font-semibold">Weekly hours</h2>
        <p className="mb-5 text-sm text-slate">
          Times are in {tzLabel(config.timezone)}. Turn a day on and set your window.
        </p>
        <div className="flex flex-col gap-3">
          {WEEKDAYS.map((day) => {
            const rule = byWeekday.get(day.value);
            const enabled = Boolean(rule);
            return (
              <form
                key={day.value}
                action={saveWeekdayHours.bind(null, day.value)}
                className="flex flex-wrap items-center gap-3 rounded-md border border-line/70 px-4 py-3"
              >
                <label className="flex w-32 items-center gap-2">
                  <input
                    type="checkbox"
                    name="enabled"
                    defaultChecked={enabled}
                    className="h-4 w-4 accent-wine"
                  />
                  <span className="font-medium text-ink-strong">{day.long}</span>
                </label>
                <div className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="time"
                    name="start"
                    defaultValue={rule ? minutesToTimeValue(rule.startMinute) : "09:00"}
                    className="rounded-md border border-line px-2 py-1"
                  />
                  <span className="text-slate">to</span>
                  <input
                    type="time"
                    name="end"
                    defaultValue={rule ? minutesToTimeValue(rule.endMinute) : "17:00"}
                    className="rounded-md border border-line px-2 py-1"
                  />
                </div>
                <button className="ml-auto rounded-md border border-mocha px-3 py-1.5 text-sm font-medium text-wine transition-colors hover:bg-blush">
                  Save {day.short}
                </button>
              </form>
            );
          })}
        </div>
      </section>

      {/* Session settings */}
      <section className="rounded-lg border border-line bg-white p-6 shadow-soft">
        <h2 className="mb-5 text-xl font-semibold">Session settings</h2>
        <form action={saveConfig} className="flex flex-col gap-5">
          <label className="flex max-w-md flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-strong">Timezone</span>
            <select
              name="timezone"
              defaultValue={config.timezone}
              className="rounded-md border border-line px-3 py-2 text-ink"
            >
              {COMMON_TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tzLabel(tz)}
                </option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {NUMBERS.map((f) => (
              <label key={f.name} className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink-strong">{f.label}</span>
                <input
                  type="number"
                  name={f.name}
                  min={f.min}
                  max={f.max}
                  defaultValue={cfg[f.name]}
                  className="rounded-md border border-line px-3 py-2 text-ink"
                />
                <span className="text-xs text-slate">{f.hint}</span>
              </label>
            ))}
          </div>

          <label className="flex max-w-md flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-strong">Standing video link</span>
            <input
              type="url"
              name="defaultVideoUrl"
              defaultValue={config.defaultVideoUrl ?? ""}
              placeholder="https://zoom.us/j/your-room"
              className="rounded-md border border-line px-3 py-2 text-ink"
            />
            <span className="text-xs text-slate">
              Used for virtual sessions when an appointment has no link of its own.
            </span>
          </label>

          <button className="self-start rounded-md bg-wine px-5 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-wine/90">
            Save settings
          </button>
        </form>
      </section>

      {/* Blackout dates & extra openings */}
      <section className="rounded-lg border border-line bg-white p-6 shadow-soft">
        <h2 className="mb-1 text-xl font-semibold">Blackout dates &amp; extra openings</h2>
        <p className="mb-5 text-sm text-slate">
          Block a day off, or open a one-off window outside your normal hours.
        </p>

        <form action={addException} className="flex flex-wrap items-end gap-3">
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
            <span className="text-sm font-medium text-ink-strong">Type</span>
            <select name="type" className="rounded-md border border-line px-3 py-2 text-ink">
              <option value="BLOCK">Block (day off)</option>
              <option value="OPEN">Extra opening</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-strong">From</span>
            <input type="time" name="start" className="rounded-md border border-line px-2 py-2" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-strong">To</span>
            <input type="time" name="end" className="rounded-md border border-line px-2 py-2" />
          </label>
          <label className="flex flex-1 flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-strong">Note (optional)</span>
            <input
              type="text"
              name="reason"
              placeholder="e.g. holiday"
              className="rounded-md border border-line px-3 py-2 text-ink"
            />
          </label>
          <button className="rounded-md border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush">
            Add
          </button>
        </form>

        {exceptions.length > 0 && (
          <ul className="mt-5 flex flex-col gap-2">
            {exceptions.map((e) => (
              <li
                key={e.id}
                className="flex flex-wrap items-center gap-3 rounded-md border border-line/70 px-4 py-2.5 text-sm"
              >
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    e.type === "BLOCK" ? "bg-line/50 text-slate" : "bg-blush-deep text-wine"
                  }`}
                >
                  {e.type === "BLOCK" ? "Day off" : "Extra opening"}
                </span>
                <span className="font-medium text-ink-strong">{civilLabel(e.date)}</span>
                <span className="text-slate">
                  {e.startMinute != null && e.endMinute != null
                    ? `${minutesToLabel(e.startMinute)} – ${minutesToLabel(e.endMinute)}`
                    : "all day"}
                  {e.reason ? ` · ${e.reason}` : ""}
                </span>
                <form action={deleteException.bind(null, e.id)} className="ml-auto">
                  <button className="text-sm font-medium text-slate underline-offset-4 hover:text-wine hover:underline">
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link
        href="/practitioner/schedule"
        className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
      >
        Back to the schedule
      </Link>
    </div>
  );
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function civilLabel(d: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}
