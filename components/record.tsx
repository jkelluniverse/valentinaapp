import Link from "next/link";
import type { RecordItem } from "@prisma/client";
import { MoodDots, TagChips, formatTime } from "@/components/entries";
import { recordKindLabel, recordKindPill } from "@/lib/record-meta";
import type { Theme, MoodPoint, Cadence } from "@/lib/client-record";
import { formatDay } from "@/components/entries";

// Presentational pieces for the unified record (C4), shared by the
// practitioner record page and the client's "Your journey".

export function RecordCard({ item, href }: { item: RecordItem; href?: string }) {
  const inner = (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${recordKindPill(item.kind)}`}
        >
          {recordKindLabel(item.kind)}
        </span>
        {item.title && <p className="font-medium text-ink-strong">{item.title}</p>}
        <span className="ml-auto flex items-center gap-3">
          <MoodDots mood={item.mood} />
          <span className="text-xs text-slate">{formatTime(item.occurredAt)}</span>
        </span>
      </div>
      {item.summary && (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{item.summary}</p>
      )}
      <TagChips tags={item.tags} />
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="flex flex-col gap-2 rounded-lg border border-line bg-white p-5 shadow-soft transition-colors hover:bg-blush"
      >
        {inner}
      </Link>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-line bg-white p-5 shadow-soft">
      {inner}
    </div>
  );
}

export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-line bg-white p-4 shadow-soft">
      <p className="text-label font-semibold uppercase tracking-wide text-mocha">{label}</p>
      <p className="font-headline text-2xl font-semibold text-wine">{value}</p>
      {hint && <p className="text-xs text-slate">{hint}</p>}
    </div>
  );
}

const TREND_GLYPH = { up: "↑", down: "↓", steady: "→" } as const;

export function ThemeList({ themes }: { themes: Theme[] }) {
  if (!themes.length) {
    return <p className="text-sm text-ink">No recurring themes yet — tags on entries feed this.</p>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {themes.map((t) => (
        <span
          key={t.tag}
          title={`First seen ${formatDay(t.firstSeen)} · last ${formatDay(t.lastSeen)}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-line bg-white px-3 py-1.5 text-sm text-ink"
        >
          {t.tag}
          <span className="text-xs font-semibold text-wine">{t.count}</span>
          <span className="text-xs text-mocha">{TREND_GLYPH[t.trend]}</span>
        </span>
      ))}
    </div>
  );
}

export function MoodTrend({ trend }: { trend: MoodPoint[] }) {
  if (!trend.length) {
    return <p className="text-sm text-ink">No mood data yet.</p>;
  }
  return (
    <div className="flex flex-wrap items-end gap-4">
      {trend.map((p) => (
        <div key={p.period} className="flex flex-col items-center gap-1">
          <div className="flex h-16 w-8 items-end rounded-md bg-cream">
            <div
              className="w-full rounded-md bg-mocha"
              style={{ height: `${(p.avgMood / 5) * 100}%` }}
              title={`${p.avgMood} avg (${p.samples})`}
            />
          </div>
          <span className="text-xs font-medium text-ink">{p.avgMood}</span>
          <span className="text-xs text-slate">{p.period}</span>
        </div>
      ))}
    </div>
  );
}

export function CadenceLine({ cadence }: { cadence: Cadence }) {
  return (
    <p className="text-sm text-ink">
      {cadence.lastActive ? (
        <>
          Last active <span className="font-medium">{formatDay(cadence.lastActive)}</span> ·{" "}
          {cadence.thisWeek} this week · {cadence.lastFourWeeks} in the last 4 weeks
          {cadence.weekStreak > 1 && (
            <>
              {" "}
              · <span className="font-medium text-wine">{cadence.weekStreak}-week streak</span>
            </>
          )}
        </>
      ) : (
        "No activity yet."
      )}
    </p>
  );
}
