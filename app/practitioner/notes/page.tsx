import Link from "next/link";
import type { Note } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { NoteRow } from "@/components/NoteRow";
import { JotBox } from "@/components/JotBox";
import { unfiledNotes, notesByTag, searchNotes, allNoteTags } from "@/lib/notes";
import { createJot } from "./actions";

export const dynamic = "force-dynamic";

// C14.3 — The Notebook: the cross-client idea space + tag search. Free-floating
// jots live here; a tag pulls every note under a theme, across all clients.
export default async function Notebook({
  searchParams,
}: {
  searchParams: { tag?: string; q?: string };
}) {
  await requirePractitioner();

  const tag = searchParams.tag?.trim() || undefined;
  const q = searchParams.q?.trim() || undefined;

  const [notes, tags, roster] = await Promise.all([
    q ? searchNotes(q) : tag ? notesByTag(tag) : unfiledNotes(),
    allNoteTags(),
    prisma.user.findMany({
      where: { role: "CLIENT" },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Names for any client-filed notes shown across the notebook.
  const clientIds = [...new Set(notes.map((n) => n.clientId).filter(Boolean))] as string[];
  const clients = clientIds.length
    ? await prisma.user.findMany({ where: { id: { in: clientIds } }, select: { id: true, name: true, email: true } })
    : [];
  const nameOf = new Map(clients.map((c) => [c.id, c.name || c.email]));

  const heading = q
    ? `“${q}”`
    : tag
      ? tag
      : "Unfiled — ideas not yet about a person";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <p className="text-eyebrow font-semibold uppercase text-mocha">The Margins</p>
        <h1 className="font-headline text-[2rem] font-medium text-ink-strong">Your notebook</h1>
        <p className="text-[15px] text-slate">
          Your private thinking — never seen by a client. Jot freely; a tag gathers a theme across
          everyone.
        </p>
      </div>

      <JotBox
        action={createJot.bind(null, null)}
        placeholder="an idea — file it to someone, or keep it loose…"
        clients={roster}
      />

      <form action="/practitioner/notes" className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          name="q"
          defaultValue={q ?? ""}
          placeholder="Search your notes…"
          className="min-w-64 flex-1 rounded-lg border border-line bg-surface px-4 py-2 text-ink outline-none focus:border-wine"
        />
        <button className="rounded-lg border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush">
          Search
        </button>
      </form>

      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            href="/practitioner/notes"
            className={`rounded-pill px-3 py-1 text-xs font-medium transition-colors ${!tag && !q ? "bg-wine text-white" : "border border-line text-ink hover:bg-blush"}`}
          >
            Unfiled
          </Link>
          {tags.map((t) => (
            <Link
              key={t}
              href={`/practitioner/notes?tag=${encodeURIComponent(t)}`}
              className={`rounded-pill px-3 py-1 text-xs font-medium transition-colors ${tag === t ? "bg-wine text-white" : "border border-line text-ink hover:bg-blush"}`}
            >
              {t}
            </Link>
          ))}
        </div>
      )}

      <section className="flex flex-col gap-2">
        <p className="text-eyebrow font-semibold uppercase text-mocha">{heading}</p>
        {notes.length === 0 ? (
          <p className="text-ink">
            {q ? "No notes match." : tag ? "No notes under this theme yet." : "No unfiled notes — jot one above."}
          </p>
        ) : (
          <div className="flex flex-col">
            {notes.map((n: Note) => (
              <NoteRow key={n.id} note={n} clientName={n.clientId ? nameOf.get(n.clientId) : null} showClient />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
