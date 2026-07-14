import Link from "next/link";
import type { RecordItem, RecordKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { getPracticeOverview } from "@/lib/attention";
import { Greeting } from "@/components/Greeting";
import { getPractitioner, getOrCreateConfig, formatInZone, zonedParts, zonedWallToUtc, DAY_MS } from "@/lib/schedule";
import { partyLabel } from "@/lib/appointments";
import { firstNameOf } from "@/lib/name";

export const dynamic = "force-dynamic";

// A1 — The Study. Answers one question — who has my attention today? — and
// nothing else uninvited. People and hours, worded signals, a quiet feed.

function sinceWords(d: Date | null): string {
  if (!d) return "hasn't written yet";
  const weeks = Math.floor((Date.now() - d.getTime()) / (7 * DAY_MS));
  if (weeks <= 0) return "has been quiet a few days";
  if (weeks === 1) return "hasn't written in over a week";
  if (weeks < 4) return `hasn't written in ${["", "", "two", "three"][weeks]} weeks`;
  return "hasn't written in over a month";
}

function relDay(d: Date): string {
  const days = Math.floor((Date.now() - d.getTime()) / DAY_MS);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(d);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
}

const NUM_WORD = ["zero", "two", "three", "four", "five", "six", "several"];
function countWord(n: number): string {
  return n <= 1 ? "" : NUM_WORD[Math.min(n, 6)] ?? "several";
}

type FeedGroup = { item: RecordItem & { clientName: string }; count: number };

// AMENDMENT-02 §5 — aggregate same-actor-same-kind-same-day repeats into one
// line, use display-cased first names.
function aggregateFeed(feed: (RecordItem & { clientName: string })[]): FeedGroup[] {
  const groups = new Map<string, FeedGroup>();
  for (const item of feed) {
    const day = relDay(item.occurredAt);
    const key = `${item.clientId}|${item.kind}|${day}`;
    const g = groups.get(key);
    if (g) g.count += 1;
    else groups.set(key, { item, count: 1 });
  }
  return [...groups.values()];
}

function feedSentence({ item, count }: FeedGroup): string {
  const when = relDay(item.occurredAt);
  const name = firstNameOf(item.clientName);
  const t = item.title ? `“${item.title}”` : "something";
  const n = countWord(count);
  const byKind: Record<RecordKind, string> = {
    LOG_ENTRY:
      count > 1 ? `${name} kept ${n} reflections ${when}.` : `${name} kept a reflection ${when}.`,
    PROMPT_RESPONSE:
      count > 1 ? `${name} answered ${n} prompts ${when}.` : `${name} responded to a prompt ${when}.`,
    WORKSHEET_RESPONSE:
      count > 1 ? `${name} finished ${n} worksheets ${when}.` : `${name} finished ${t} ${when}.`,
    COURSE_ACTIVITY:
      count > 1 ? `${name} moved through ${n} lessons ${when}.` : `${name} moved through ${t} ${when}.`,
    NOTE: `${name} — ${item.title ?? "a note"} ${when}.`,
    MESSAGE:
      count > 1 ? `${name} sent ${n} messages ${when}.` : `${name} sent a message ${when}.`,
  };
  return byKind[item.kind];
}

export default async function TheStudy() {
  const practitioner = await requirePractitioner();
  const first = practitioner.name?.trim().split(/\s+/)[0] || "there";
  const o = await getPracticeOverview();

  // Today's sessions, in the practitioner's timezone.
  const p = await getPractitioner();
  const config = p ? await getOrCreateConfig(p.id) : null;
  let todays: Awaited<ReturnType<typeof loadToday>> = [];
  if (p && config) todays = await loadToday(p.id, config.timezone);

  // Worth a look — at most three, worded, in priority order. A client who
  // reached out in distress leads everything else.
  const signals: { text: string; href: string }[] = [];
  const crisisFlags = await prisma.message
    .findMany({
      where: { safetyFlag: true, safetyCleared: false, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: { conversation: { select: { clientId: true, client: { select: { name: true, email: true } } } } },
      take: 5,
    })
    .catch(() => []);
  for (const m of crisisFlags) {
    signals.push({
      text: `${m.conversation.client.name || m.conversation.client.email} reached out in distress — please check in.`,
      href: `/practitioner/clients/${m.conversation.clientId}?tab=messages`,
    });
  }

  // C17 — a reflection that met something heavy (Deepening's crisis path). Safety
  // never stays only client-side; it surfaces here too.
  const entryCrisis = await prisma.entryDeepening
    .findMany({
      where: { crisis: true, crisisCleared: false },
      orderBy: { createdAt: "desc" },
      take: 5,
    })
    .catch(() => []);
  if (entryCrisis.length > 0) {
    const names = new Map(
      (
        await prisma.user.findMany({
          where: { id: { in: [...new Set(entryCrisis.map((e) => e.clientId))] } },
          select: { id: true, name: true, email: true },
        })
      ).map((u) => [u.id, u.name || u.email]),
    );
    for (const e of entryCrisis) {
      signals.push({
        text: `${names.get(e.clientId) ?? "A client"} wrote something heavy in their journal — please check in.`,
        href: `/practitioner/clients/${e.clientId}?tab=record`,
      });
    }
  }
  for (const r of o.attention.referralFlagged) {
    signals.push({
      text: `${r.name || r.email}'s last prep suggested care — worth reviewing before today.`,
      href: `/practitioner/clients/${r.id}/prep`,
    });
  }
  for (const r of o.attention.inactive) {
    signals.push({
      text: `${r.name || r.email} ${sinceWords(r.signal.lastActive)}.`,
      href: `/practitioner/clients/${r.id}`,
    });
  }
  for (const r of o.attention.moodDips) {
    signals.push({
      text: `${r.name || r.email}'s mood has been softer than usual lately.`,
      href: `/practitioner/clients/${r.id}`,
    });
  }
  for (const i of o.attention.staleInvites) {
    signals.push({
      text: `${i.name || i.email}'s invitation is still waiting.`,
      href: `/practitioner/clients`,
    });
  }
  const shown = signals.slice(0, 3);
  const moreSignals = signals.length - shown.length;

  const dayLine =
    todays.length === 0
      ? "No sessions on the calendar today."
      : `${todays.length === 1 ? "One session" : `${todays.length} sessions`} today.`;

  return (
    <div className="flex flex-col gap-12">
      <div className="flex flex-col gap-2 gentle-rise">
        <Greeting name={first} />
        <p className="text-lg text-slate">{dayLine}</p>
      </div>

      {todays.length > 0 && config && (
        <section className="flex flex-col gap-3 gentle-rise" style={{ animationDelay: "80ms" }}>
          <p className="text-eyebrow font-semibold uppercase text-mocha">Today</p>
          <div className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface shadow-soft">
            {todays.map((a) => {
              const discovery = a.kind === "DISCOVERY"; // C18
              return (
                <div key={a.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  <span className="font-medium text-ink-strong">
                    {formatInZone(a.startAt, config.timezone, { hour: "numeric", minute: "2-digit" })}
                  </span>
                  {discovery ? (
                    <Link
                      href="/practitioner/leads"
                      className="font-medium text-wine underline-offset-4 hover:underline"
                    >
                      Discovery — {partyLabel(a)}
                    </Link>
                  ) : (
                    <Link
                      href={`/practitioner/clients/${a.clientId}`}
                      className="font-medium text-wine underline-offset-4 hover:underline"
                    >
                      {partyLabel(a)}
                    </Link>
                  )}
                  <span className="text-[13px] text-whisper">
                    {a.location === "VIRTUAL" ? "virtual" : "in person"}
                  </span>
                  <span className="ml-auto flex items-center gap-4 text-sm">
                    {a.location === "VIRTUAL" && a.videoUrl && (
                      <a
                        href={a.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-wine underline-offset-4 hover:underline"
                      >
                        Join
                      </a>
                    )}
                    {!discovery && (
                      <Link
                        href={`/practitioner/clients/${a.clientId}/prep`}
                        className="font-medium text-wine underline-offset-4 hover:underline"
                      >
                        Prepare →
                      </Link>
                    )}
                    {discovery && a.clientNote && (
                      <span className="max-w-[16rem] truncate text-[13px] text-slate" title={a.clientNote}>
                        “{a.clientNote}”
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {shown.length > 0 && (
        <section className="flex flex-col gap-3 gentle-rise" style={{ animationDelay: "160ms" }}>
          <p className="text-eyebrow font-semibold uppercase text-mocha">Worth a look</p>
          <ul className="flex flex-col gap-2">
            {shown.map((s, i) => (
              <li key={i} className="text-[15px] text-ink">
                <Link href={s.href} className="underline-offset-4 hover:text-wine hover:underline">
                  {s.text}
                </Link>
              </li>
            ))}
          </ul>
          {moreSignals > 0 && (
            <Link
              href="/practitioner/clients?filter=attention"
              className="text-[13px] text-whisper underline-offset-4 hover:text-wine hover:underline"
            >
              {moreSignals} more
            </Link>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3 gentle-rise" style={{ animationDelay: "240ms" }}>
        <p className="text-eyebrow font-semibold uppercase text-mocha">Quietly, this week</p>
        {o.feed.length === 0 ? (
          <p className="text-[15px] text-slate">
            All quiet — activity appears here as clients write and respond.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {aggregateFeed(o.feed)
              .slice(0, 7)
              .map((g) => (
                <li key={g.item.id} className="text-[15px] text-ink">
                  <Link
                    href={`/practitioner/clients/${g.item.clientId}`}
                    className="underline-offset-4 hover:text-wine hover:underline"
                  >
                    {feedSentence(g)}
                  </Link>
                </li>
              ))}
          </ul>
        )}
      </section>

      <section className="flex flex-wrap gap-3 border-t border-line pt-8 text-sm">
        <Link
          href="/practitioner/clients"
          className="rounded-lg border border-mocha px-4 py-2 font-medium text-wine transition-colors hover:bg-blush"
        >
          Invite a client
        </Link>
        <Link
          href="/practitioner/worksheets/new"
          className="rounded-lg border border-mocha px-4 py-2 font-medium text-wine transition-colors hover:bg-blush"
        >
          New worksheet
        </Link>
        <Link
          href="/practitioner/search"
          className="rounded-lg border border-mocha px-4 py-2 font-medium text-wine transition-colors hover:bg-blush"
        >
          Search…
        </Link>
      </section>
    </div>
  );
}

async function loadToday(practitionerId: string, tz: string) {
  const now = new Date();
  const parts = zonedParts(now, tz);
  const dayStart = zonedWallToUtc(parts.year, parts.month0, parts.day, 0, tz);
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);
  return prisma.appointment.findMany({
    where: {
      practitionerId,
      status: "SCHEDULED",
      startAt: { gte: dayStart, lt: dayEnd },
    },
    include: {
      client: { select: { id: true, name: true, email: true } },
      lead: { select: { name: true, email: true } }, // C18 — discovery calls
    },
    orderBy: { startAt: "asc" },
  });
}
