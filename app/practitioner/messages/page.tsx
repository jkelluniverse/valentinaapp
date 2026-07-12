import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { getAwayNote } from "@/lib/messaging";
import { displayName } from "@/lib/name";
import { saveAwayNote } from "./actions";

export const dynamic = "force-dynamic";

function relDay(d: Date): string {
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) {
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(d);
  }
  if (days === 1) return "Yesterday";
  if (days < 7) return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(d);
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
  const line = fromYou ? `You: ${text}` : text;
  return line.length > 72 ? `${line.slice(0, 72).trimEnd()}…` : line;
}

// C15.5 — the inbox, shaped like a familiar messages list: every client a row,
// name in bold, a one-line preview, time at the right, a wine badge when
// something's waiting. Crisis first, always.
export default async function MessagesInbox({ searchParams }: { searchParams: { saved?: string } }) {
  await requirePractitioner();

  const [conversations, clients, crisisMessages, awayNote] = await Promise.all([
    prisma.conversation.findMany({
      orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
      include: {
        client: { select: { id: true, name: true, email: true, active: true } },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        _count: {
          select: {
            messages: { where: { senderRole: "CLIENT", readAt: null, deletedAt: null } },
          },
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
      take: 20,
    }),
    getAwayNote(),
  ]);

  const nameOf = (c: { name: string | null; email: string }) => displayName(c);
  const threads = conversations.filter((c) => c.messages[0]);
  const threadedIds = new Set(threads.map((c) => c.client.id));
  const untouched = clients.filter((c) => !threadedIds.has(c.id));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>Your practice</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">Messages</h1>
        <SignatureRule />
      </div>

      {searchParams.saved && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">Away note saved.</p>
      )}

      {/* Crisis first — a worded priority signal. */}
      {crisisMessages.length > 0 && (
        <section className="flex flex-col gap-3 rounded-card border-2 border-rose bg-white p-6 shadow-card">
          <p className="text-eyebrow font-semibold uppercase text-rose">Reached out in distress</p>
          {crisisMessages.map((m) => (
            <Link
              key={m.id}
              href={`/practitioner/clients/${m.conversation.clientId}?tab=messages`}
              className="text-[15px] text-ink underline-offset-4 hover:text-wine hover:underline"
            >
              {nameOf(m.conversation.client)} reached out with something heavy — they were shown
              crisis resources; please check in.
            </Link>
          ))}
        </section>
      )}

      {/* The inbox — every thread, most recent first. */}
      {threads.length === 0 ? (
        <p className="text-[15px] text-slate">
          No conversations yet — open any client below to start one.
        </p>
      ) : (
        <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card">
          <ul className="flex flex-col divide-y divide-line">
            {threads.map((c) => {
              const last = c.messages[0];
              const unread = c._count.messages;
              return (
                <li key={c.id}>
                  <Link
                    href={`/practitioner/clients/${c.client.id}?tab=messages`}
                    className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-blush/40"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blush text-sm font-semibold text-wine ring-1 ring-line">
                      {initials(nameOf(c.client))}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-baseline gap-3">
                        <span className={`truncate text-[15px] ${unread > 0 ? "font-semibold text-ink-strong" : "font-medium text-ink-strong"}`}>
                          {nameOf(c.client)}
                        </span>
                        {c.status === "PAUSED" && (
                          <span className="text-[11px] text-whisper">paused</span>
                        )}
                        {!c.client.active && (
                          <span className="text-[11px] text-whisper">inactive</span>
                        )}
                        <span className="ml-auto shrink-0 text-[13px] text-whisper">
                          {relDay(last.createdAt)}
                        </span>
                      </span>
                      <span className="flex items-center gap-3">
                        <span className={`truncate text-sm ${unread > 0 ? "text-ink" : "text-slate"}`}>
                          {preview(last.body, last.senderRole === "PRACTITIONER")}
                        </span>
                        {unread > 0 && (
                          <span className="ml-auto inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-pill bg-wine px-1.5 text-[11px] font-semibold text-white">
                            {unread}
                          </span>
                        )}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Everyone else — open a line with any client. */}
      {untouched.length > 0 && (
        <section className="flex flex-col gap-3">
          <p className="text-eyebrow font-semibold uppercase text-mocha">Start a thread</p>
          <div className="flex flex-wrap gap-2">
            {untouched.map((c) => (
              <Link
                key={c.id}
                href={`/practitioner/clients/${c.id}?tab=messages`}
                className="inline-flex items-center gap-2 rounded-pill border border-line bg-surface px-3 py-1.5 text-sm text-ink transition-colors hover:border-mocha hover:bg-blush"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blush text-[11px] font-semibold text-wine">
                  {initials(nameOf(c))}
                </span>
                {nameOf(c)}
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Away note — a soft, honest rhythm. */}
      <section className="rounded-card border border-line bg-white p-6 shadow-soft">
        <h2 className="mb-1 text-xl font-semibold">Your response rhythm</h2>
        <p className="mb-3 max-w-prose text-sm text-slate">
          Clients see &ldquo;Valentina usually replies within a day&rdquo; by default. Set an away
          note when you&apos;re resting or away, so <em>supported</em> never curdles into{" "}
          <em>abandoned</em>.
        </p>
        <form action={saveAwayNote} className="flex flex-wrap items-end gap-3">
          <input
            type="text"
            name="awayNote"
            defaultValue={awayNote ?? ""}
            placeholder="e.g. Away until Monday — I'll reply when I'm back."
            className="min-w-64 flex-1 rounded-md border border-line bg-white px-3 py-2 text-ink outline-none focus:border-wine"
          />
          <button className="rounded-md border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush">
            Save
          </button>
        </form>
      </section>
    </div>
  );
}
