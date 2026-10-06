import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { PageHeader } from "@/components/PageHeader";
import { getAwayNote } from "@/lib/messaging";
import { displayName } from "@/lib/name";
import { InboxSettings } from "./InboxSettings";

export const dynamic = "force-dynamic";

function relTime(d: Date): string {
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(d);
  }
  if (days === 1) return "Yesterday";
  if (days < 7) return new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(d);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "·";
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function preview(body: string, fromYou: boolean): string {
  const text = body.trim().replace(/\s+/g, " ") || "Shared something";
  return fromYou ? `You: ${text}` : text;
}

// AMENDMENT-04 §2a — the inbox: a compact header row, then full-bleed hairline
// conversation rows (never cards). Response rhythm lives behind ⋯. Crisis leads.
export default async function MessagesInbox() {
  await requirePractitioner();

  const [conversations, clients, crisisMessages, awayNote] = await Promise.all([
    prisma.conversation.findMany({
      orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
      include: {
        client: { select: { id: true, name: true, email: true, active: true } },
        messages: { where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 1 },
        _count: {
          select: { messages: { where: { senderRole: "CLIENT", readAt: null, deletedAt: null } } },
        },
      },
    }),
    prisma.user.findMany({
      where: { role: "CLIENT", active: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.message.findMany({
      where: { safetyFlag: true, safetyCleared: false, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: { conversation: { select: { clientId: true, client: { select: { name: true, email: true } } } } },
      take: 10,
    }),
    getAwayNote(),
  ]);

  const threads = conversations.filter((c) => c.messages[0]);
  const threadedIds = new Set(threads.map((c) => c.client.id));
  const untouched = clients.filter((c) => !threadedIds.has(c.id));

  // One alert per client — a distressed client often sends several messages in a
  // row; collapse to the most-recent flagged one (query is desc by createdAt) so
  // the signal reads as one worried voice, not a stack of identical rows.
  const crisisByClient = new Map<string, (typeof crisisMessages)[number]>();
  for (const m of crisisMessages) {
    if (!crisisByClient.has(m.conversation.clientId)) crisisByClient.set(m.conversation.clientId, m);
  }
  const crisisRows = [...crisisByClient.values()];

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <PageHeader
        title="Messages"
        eyebrow="Your practice"
        action={<InboxSettings awayNote={awayNote} />}
      />

      {/* Crisis first — one worded hairline row per client, with the flagged
          words and when, so the practitioner has context before opening. */}
      {crisisRows.length > 0 && (
        <div className="flex flex-col divide-y divide-rose/30 rounded-lg border-2 border-rose bg-white">
          {crisisRows.map((m) => (
            <Link
              key={m.id}
              href={`/practitioner/messages/${m.conversation.clientId}`}
              className="px-4 py-3 text-[14px] text-ink hover:text-wine"
            >
              <span className="font-semibold text-rose">{displayName(m.conversation.client)}</span>
              <span className="text-whisper"> · {relTime(m.createdAt)}</span> reached out in distress
              — <span className="italic text-slate">“{m.body.trim().replace(/\s+/g, " ").slice(0, 64)}
              {m.body.trim().length > 64 ? "…" : ""}”</span> — shown crisis resources; please check in.
            </Link>
          ))}
        </div>
      )}

      {/* The inbox — full-bleed hairline rows. */}
      {threads.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate">
          No conversations yet — open any client below to start one.
        </p>
      ) : (
        <ul className="-mx-4 flex flex-col divide-y divide-line md:mx-0">
          {threads.map((c) => {
            const last = c.messages[0];
            const unread = c._count.messages;
            const name = displayName(c.client);
            return (
              <li key={c.id}>
                <Link
                  href={`/practitioner/messages/${c.client.id}`}
                  className="flex min-h-[52px] items-center gap-3 px-4 py-2 transition-colors hover:bg-blush/30 md:px-2"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blush text-[13px] font-semibold text-wine ring-1 ring-line">
                    {initials(name)}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="flex items-baseline gap-2">
                      <span className={`truncate text-[15px] text-ink-strong ${unread > 0 ? "font-semibold" : "font-medium"}`}>
                        {name}
                      </span>
                      {c.status === "PAUSED" && <span className="text-[11px] text-whisper">paused</span>}
                      <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[12px] text-whisper">
                        {unread > 0 && <span className="h-2 w-2 rounded-full bg-wine" aria-label="unread" />}
                        {relTime(last.createdAt)}
                      </span>
                    </span>
                    <span className={`truncate text-[13px] ${unread > 0 ? "text-ink" : "text-whisper"}`}>
                      {preview(last.body, last.senderRole === "PRACTITIONER")}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* Everyone else — open a line with any client. */}
      {untouched.length > 0 && (
        <section className="flex flex-col gap-2 border-t border-line pt-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-mocha">Start a thread</p>
          <div className="flex flex-wrap gap-1.5">
            {untouched.map((c) => (
              <Link
                key={c.id}
                href={`/practitioner/messages/${c.id}`}
                className="inline-flex min-h-[36px] items-center gap-2 rounded-pill border border-line bg-surface px-3 text-sm text-ink transition-colors hover:border-mocha hover:bg-blush"
              >
                {displayName(c)}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
