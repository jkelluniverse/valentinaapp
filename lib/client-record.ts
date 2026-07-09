import type { RecordItem, RecordKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// The derived record (C4 spec §6): the psyche-map scaffolding. Compute-on-read
// at this practice's scale; if the dashboard ever needs it faster, cache into
// a ClientRecordSummary maintained by the record service (flagged, not built).
// This bundle is C5's scoped input and what C8 renders.

const DAY = 24 * 60 * 60 * 1000;

export type Theme = {
  tag: string;
  count: number;
  firstSeen: Date;
  lastSeen: Date;
  trend: "up" | "down" | "steady";
};

export type MoodPoint = { period: string; avgMood: number; samples: number };

export type Cadence = {
  lastActive: Date | null;
  thisWeek: number;
  lastFourWeeks: number;
  weekStreak: number;
};

export type ClientRecord = {
  timeline: RecordItem[];
  themes: Theme[];
  moodTrend: MoodPoint[];
  cadence: Cadence;
  counts: Partial<Record<RecordKind, number>> & { total: number };
};

export async function getClientRecord(
  clientId: string,
  filters: { kind?: RecordKind; tag?: string } = {},
): Promise<ClientRecord> {
  // One scoped fetch feeds both the timeline and the rollups (cap for safety).
  const all = await prisma.recordItem.findMany({
    where: { clientId },
    orderBy: { occurredAt: "desc" },
    take: 1000,
  });

  const timeline = all
    .filter((i) => (filters.kind ? i.kind === filters.kind : true))
    .filter((i) => (filters.tag ? i.tags.includes(filters.tag) : true))
    .slice(0, 100);

  return {
    timeline,
    themes: computeThemes(all),
    moodTrend: computeMoodTrend(all),
    cadence: computeCadence(all),
    counts: computeCounts(all),
  };
}

function computeThemes(items: RecordItem[]): Theme[] {
  const now = Date.now();
  const byTag = new Map<string, { count: number; recent: number; prior: number; first: Date; last: Date }>();

  for (const item of items) {
    for (const tag of item.tags) {
      const t = item.occurredAt;
      const cur = byTag.get(tag) ?? { count: 0, recent: 0, prior: 0, first: t, last: t };
      cur.count += 1;
      const age = now - t.getTime();
      if (age <= 28 * DAY) cur.recent += 1;
      else if (age <= 56 * DAY) cur.prior += 1;
      if (t < cur.first) cur.first = t;
      if (t > cur.last) cur.last = t;
      byTag.set(tag, cur);
    }
  }

  return [...byTag.entries()]
    .map(([tag, v]) => ({
      tag,
      count: v.count,
      firstSeen: v.first,
      lastSeen: v.last,
      trend: (v.recent > v.prior ? "up" : v.recent < v.prior ? "down" : "steady") as Theme["trend"],
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
}

function computeMoodTrend(items: RecordItem[]): MoodPoint[] {
  const byMonth = new Map<string, { sum: number; n: number; order: number }>();

  for (const item of items) {
    if (item.mood == null) continue;
    const d = item.occurredAt;
    const key = new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(d);
    const order = d.getFullYear() * 12 + d.getMonth();
    const cur = byMonth.get(key) ?? { sum: 0, n: 0, order };
    cur.sum += item.mood;
    cur.n += 1;
    byMonth.set(key, cur);
  }

  return [...byMonth.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .slice(-6)
    .map(([period, v]) => ({ period, avgMood: Math.round((v.sum / v.n) * 10) / 10, samples: v.n }));
}

function startOfWeek(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7; // Monday start
  x.setDate(x.getDate() - day);
  return x.getTime();
}

function computeCadence(items: RecordItem[]): Cadence {
  const now = Date.now();
  const lastActive = items.length ? items[0].occurredAt : null;
  const thisWeekStart = startOfWeek(new Date());

  const thisWeek = items.filter((i) => i.occurredAt.getTime() >= thisWeekStart).length;
  const lastFourWeeks = items.filter((i) => now - i.occurredAt.getTime() <= 28 * DAY).length;

  // Consecutive weeks with at least one item, counting back from this week
  // (or last week, so an early-Monday visit doesn't read as a broken streak).
  const weeks = new Set(items.map((i) => startOfWeek(i.occurredAt)));
  let weekStreak = 0;
  let cursor = thisWeekStart;
  if (!weeks.has(cursor)) cursor -= 7 * DAY;
  while (weeks.has(cursor)) {
    weekStreak += 1;
    cursor -= 7 * DAY;
  }

  return { lastActive, thisWeek, lastFourWeeks, weekStreak };
}

function computeCounts(items: RecordItem[]) {
  const counts: Partial<Record<RecordKind, number>> & { total: number } = { total: items.length };
  for (const item of items) {
    counts[item.kind] = (counts[item.kind] ?? 0) + 1;
  }
  return counts;
}
