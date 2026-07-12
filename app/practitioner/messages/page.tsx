import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { getAwayNote } from "@/lib/messaging";
import { saveAwayNote } from "./actions";

export const dynamic = "force-dynamic";

function relDay(d: Date): string {
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(d).toLowerCase();
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(d);
}

// C15.5 — the inbox. Threads needing a reply, surfaced by WORDS, crisis-flagged
// first, never a red count.
export default async function MessagesInbox({ searchParams }: { searchParams: { saved?: string } }) {
  await requirePractitioner();

  const [conversations, crisisMessages, awayNote] = await Promise.all([
    prisma.conversation.findMany({
      orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
      include: {
        client: { select: { id: true, name: true, email: true } },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    }),
    prisma.message.findMany({
      where: { safetyFlag: true, safetyCleared: false, deletedAt: null },
      orderBy: { createdAt: "desc" },
      include: { conversation: { select: { clientId: true, client: { select: { name: true, email: true } } } } },
      take: 20,
    }),
    getAwayNote(),
  ]);

  // Awaiting a reply = last message is from the client and unread.
  const awaiting = conversations.filter(
    (c) => c.messages[0] && c.messages[0].senderRole === "CLIENT" && !c.messages[0].readAt,
  );
  const rest = conversations.filter((c) => !awaiting.includes(c) && c.messages[0]);
  const nameOf = (c: { name: string | null; email: string }) => c.name || c.email;

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

      {/* Crisis first — a worded priority signal, never a badge. */}
      {crisisMessages.length > 0 && (
        <section className="flex flex-col gap-3 rounded-card border-2 border-rose bg-white p-6 shadow-card">
          <p className="text-eyebrow font-semibold uppercase text-rose">Reached out in distress</p>
          {crisisMessages.map((m) => (
            <Link
              key={m.id}
              href={`/practitioner/clients/${m.conversation.clientId}?tab=messages`}
              className="text-[15px] text-ink underline-offset-4 hover:text-wine hover:underline"
            >
              {nameOf(m.conversation.client)} reached out {relDay(m.createdAt)} with something heavy —
              they were shown crisis resources; please check in.
            </Link>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-3">
        <p className="text-eyebrow font-semibold uppercase text-mocha">Awaiting your reply</p>
        {awaiting.length === 0 ? (
          <p className="text-[15px] text-slate">All caught up — nothing waiting on you.</p>
        ) : (
          <ul className="flex flex-col">
            {awaiting.map((c) => (
              <li key={c.id} className="border-b border-line py-3">
                <Link
                  href={`/practitioner/clients/${c.client.id}?tab=messages`}
                  className="text-[15px] text-ink underline-offset-4 hover:text-wine hover:underline"
                >
                  <span className="font-medium text-ink-strong">{nameOf(c.client)}</span> wrote{" "}
                  {c.messages[0] ? relDay(c.messages[0].createdAt) : ""}
                  {c.status === "PAUSED" && <span className="text-whisper"> · paused</span>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {rest.length > 0 && (
        <section className="flex flex-col gap-3">
          <p className="text-eyebrow font-semibold uppercase text-mocha">Recent threads</p>
          <ul className="flex flex-col">
            {rest.map((c) => (
              <li key={c.id} className="border-b border-line py-3">
                <Link
                  href={`/practitioner/clients/${c.client.id}?tab=messages`}
                  className="flex flex-wrap items-baseline gap-2 text-[15px] text-ink underline-offset-4 hover:text-wine hover:underline"
                >
                  <span className="font-medium text-ink-strong">{nameOf(c.client)}</span>
                  <span className="text-[13px] text-whisper">
                    {c.messages[0]?.senderRole === "PRACTITIONER" ? "you replied" : "they wrote"}{" "}
                    {c.messages[0] ? relDay(c.messages[0].createdAt) : ""}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
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
