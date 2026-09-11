import Link from "next/link";
import type { Slot } from "@/lib/schedule";
import { formatInZone, zoneAbbrev } from "@/lib/schedule";

// Presentational slot picker: open slots grouped by day, each time a link to a
// confirm step. Server component — rendered entirely server-side, no client JS.
export function SlotGrid({
  slots,
  timezone,
  confirmBase,
  extraQuery,
}: {
  slots: Slot[];
  timezone: string;
  confirmBase: string; // e.g. "/space/schedule/confirm"
  extraQuery?: Record<string, string>;
}) {
  if (slots.length === 0) {
    return (
      <p className="rounded-md border border-line/70 bg-white px-4 py-3 text-sm text-slate">
        No open times in this window. Check back soon, or reach out directly.
      </p>
    );
  }

  // Group by civil day in the practitioner's timezone.
  const groups = new Map<string, Slot[]>();
  for (const s of slots) {
    const key = formatInZone(s.startAt, timezone, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    const arr = groups.get(key) ?? [];
    arr.push(s);
    groups.set(key, arr);
  }

  const suffix = extraQuery
    ? Object.entries(extraQuery)
        .map(([k, v]) => `&${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join("")
    : "";

  return (
    <div className="flex flex-col gap-5">
      {Array.from(groups.entries()).map(([day, daySlots]) => (
        <div key={day} className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-ink-strong">{day}</p>
          <div className="flex flex-wrap gap-2">
            {daySlots.map((s) => {
              const iso = s.startAt.toISOString();
              return (
                <Link
                  key={iso}
                  href={`${confirmBase}?start=${encodeURIComponent(iso)}${suffix}`}
                  className="rounded-md border border-mocha px-3 py-1.5 text-sm font-medium text-wine transition-colors hover:bg-blush"
                >
                  {formatInZone(s.startAt, timezone, { hour: "numeric", minute: "2-digit" })}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-xs text-slate">
        Times shown in {zoneAbbrev(slots[0].startAt, timezone)}.
      </p>
    </div>
  );
}
