import Link from "next/link";
import type { EntryType } from "@prisma/client";
import { entryTypeLabel } from "@/lib/entry-meta";

// Pure presentational pieces for log entries, shared by the client timeline
// and the practitioner read-only view.

export type EntryView = {
  id: string;
  type: EntryType;
  occurredAt: Date;
  body: string;
  trigger: string | null;
  mood: number | null;
  tags: string[];
};

const TYPE_STYLE: Record<EntryType, string> = {
  REFLECTION: "bg-blush text-wine",
  TRIGGER: "border border-mocha text-mocha",
  INSIGHT: "bg-blush-deep text-wine",
  PROGRESS: "bg-wine text-white",
};

export function TypePill({ type }: { type: EntryType }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TYPE_STYLE[type]}`}
    >
      {entryTypeLabel(type)}
    </span>
  );
}

export function MoodDots({ mood }: { mood: number | null }) {
  if (!mood) return null;
  return (
    <span className="flex items-center gap-1" aria-label={`Mood ${mood} of 5`} title={`Mood ${mood} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={`h-1.5 w-1.5 rounded-full ${n <= mood ? "bg-mocha" : "bg-line"}`}
        />
      ))}
    </span>
  );
}

export function TagChips({ tags }: { tags: string[] }) {
  if (!tags.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tags.map((tag) => (
        <span key={tag} className="rounded-full bg-cream px-2 py-0.5 text-xs text-slate">
          {tag.replace(/_/g, " ")}
        </span>
      ))}
    </div>
  );
}

export function formatDay(d: Date) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(d);
}

export function formatTime(d: Date) {
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(d);
}

const TRUNCATE_AT = 240;

export function EntryCard({ entry, href }: { entry: EntryView; href?: string }) {
  const truncated = entry.body.length > TRUNCATE_AT;
  const shown = truncated ? `${entry.body.slice(0, TRUNCATE_AT).trimEnd()}…` : entry.body;

  return (
    <article className="flex flex-col gap-3 rounded-lg border border-line bg-white p-5 shadow-soft">
      <div className="flex flex-wrap items-center gap-3">
        <TypePill type={entry.type} />
        <MoodDots mood={entry.mood} />
        <span className="ml-auto text-xs text-slate">{formatTime(entry.occurredAt)}</span>
      </div>
      <p className="whitespace-pre-wrap leading-relaxed text-ink">
        {shown}
        {truncated && href && (
          <>
            {" "}
            <Link href={href} className="text-sm font-medium text-wine underline-offset-4 hover:underline">
              Read more
            </Link>
          </>
        )}
      </p>
      {entry.trigger && (
        <p className="text-sm text-slate">
          <span className="font-medium text-mocha">Prompted by:</span> {entry.trigger}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TagChips tags={entry.tags} />
        {href && (
          <Link
            href={href}
            className="ml-auto text-sm font-medium text-wine underline-offset-4 hover:underline"
          >
            View
          </Link>
        )}
      </div>
    </article>
  );
}

// Group entries (already sorted desc) by calendar day for the timeline.
export function groupByDay<T extends { occurredAt: Date }>(entries: T[]) {
  const groups: { day: string; items: T[] }[] = [];
  for (const entry of entries) {
    const day = formatDay(entry.occurredAt);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.items.push(entry);
    else groups.push({ day, items: [entry] });
  }
  return groups;
}
