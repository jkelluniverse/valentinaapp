import type { RecordItem, SessionPrep } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Needs-attention signals (C8 spec §6), computed from C4 rollups + C5 preps.
// Thresholds are config with sensible defaults — tune to Valentina's
// preference when her worksheet returns. UI phrasing stays gentle.

export const ATTENTION = {
  inactiveDays: 14, // "hasn't logged in a while" after this many days
  moodDipMargin: 1, // recent avg mood this far below baseline = a dip
  moodWindowDays: 14, // window for "recent" mood
  staleInviteDays: 5, // pending invites older than this
  recentActivityDays: 7, // home-page activity count window
};

const DAY = 24 * 60 * 60 * 1000;

export type ClientSignal = {
  lastActive: Date | null;
  recentMood: number | null; // avg over the mood window
  baselineMood: number | null; // all-time avg
  moodDip: boolean;
  inactive: boolean;
  referralFlagged: boolean;
};

export type ClientRow = {
  id: string;
  name: string | null;
  email: string;
  active: boolean;
  signal: ClientSignal;
};

export type Overview = {
  clients: ClientRow[];
  counts: { activeClients: number; pendingInvites: number; recentItems: number };
  feed: (RecordItem & { clientName: string })[];
  attention: {
    referralFlagged: ClientRow[];
    inactive: ClientRow[];
    moodDips: ClientRow[];
    staleInvites: { id: string; email: string; name: string | null; createdAt: Date }[];
  };
  recentPreps: (Pick<SessionPrep, "id" | "clientId" | "createdAt" | "referralFlag" | "practitionerNotes"> & {
    clientName: string;
  })[];
};

// One pass over the practice: per-client signals + everything the home needs.
// At this practice's scale (one practitioner, a modest roster) plain queries
// beat cleverness; revisit if the record ever gets large.
export async function getPracticeOverview(): Promise<Overview> {
  const now = Date.now();

  const [clients, pendingInvites, items, latestPreps, recentPrepRows] = await Promise.all([
    prisma.user.findMany({
      where: { role: "CLIENT" },
      select: { id: true, name: true, email: true, active: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.invite.findMany({
      where: { status: "PENDING" },
      select: { id: true, email: true, name: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.recordItem.findMany({
      select: { clientId: true, occurredAt: true, mood: true },
      orderBy: { occurredAt: "desc" },
      take: 5000,
    }),
    prisma.sessionPrep.findMany({
      select: { clientId: true, referralFlag: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.sessionPrep.findMany({
      select: { id: true, clientId: true, createdAt: true, referralFlag: true, practitionerNotes: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  const nameOf = new Map(clients.map((c) => [c.id, c.name || c.email]));

  // Latest prep per client decides the referral signal.
  const latestPrepByClient = new Map<string, boolean>();
  for (const p of latestPreps) {
    if (!latestPrepByClient.has(p.clientId)) latestPrepByClient.set(p.clientId, p.referralFlag);
  }

  // Per-client activity + mood aggregates.
  const agg = new Map<
    string,
    { last: Date | null; recentSum: number; recentN: number; allSum: number; allN: number }
  >();
  for (const item of items) {
    const a = agg.get(item.clientId) ?? { last: null, recentSum: 0, recentN: 0, allSum: 0, allN: 0 };
    if (!a.last || item.occurredAt > a.last) a.last = item.occurredAt;
    if (item.mood != null) {
      a.allSum += item.mood;
      a.allN += 1;
      if (now - item.occurredAt.getTime() <= ATTENTION.moodWindowDays * DAY) {
        a.recentSum += item.mood;
        a.recentN += 1;
      }
    }
    agg.set(item.clientId, a);
  }

  const rows: ClientRow[] = clients.map((c) => {
    const a = agg.get(c.id);
    const recentMood = a && a.recentN > 0 ? a.recentSum / a.recentN : null;
    const baselineMood = a && a.allN >= 3 ? a.allSum / a.allN : null; // need a little history for a baseline
    const lastActive = a?.last ?? null;
    return {
      id: c.id,
      name: c.name,
      email: c.email,
      active: c.active,
      signal: {
        lastActive,
        recentMood: recentMood != null ? Math.round(recentMood * 10) / 10 : null,
        baselineMood: baselineMood != null ? Math.round(baselineMood * 10) / 10 : null,
        moodDip:
          recentMood != null && baselineMood != null &&
          baselineMood - recentMood >= ATTENTION.moodDipMargin,
        inactive:
          c.active &&
          (!lastActive || now - lastActive.getTime() > ATTENTION.inactiveDays * DAY),
        referralFlagged: latestPrepByClient.get(c.id) === true,
      },
    };
  });

  const feedItems = await prisma.recordItem.findMany({
    orderBy: { occurredAt: "desc" },
    take: 20,
  });

  return {
    clients: rows,
    counts: {
      activeClients: clients.filter((c) => c.active).length,
      pendingInvites: pendingInvites.length,
      recentItems: items.filter((i) => now - i.occurredAt.getTime() <= ATTENTION.recentActivityDays * DAY).length,
    },
    feed: feedItems.map((i) => ({ ...i, clientName: nameOf.get(i.clientId) ?? "Client" })),
    attention: {
      referralFlagged: rows.filter((r) => r.signal.referralFlagged),
      inactive: rows.filter((r) => r.signal.inactive),
      moodDips: rows.filter((r) => r.signal.moodDip),
      staleInvites: pendingInvites.filter(
        (i) => now - i.createdAt.getTime() > ATTENTION.staleInviteDays * DAY,
      ),
    },
    recentPreps: recentPrepRows.map((p) => ({ ...p, clientName: nameOf.get(p.clientId) ?? "Client" })),
  };
}
