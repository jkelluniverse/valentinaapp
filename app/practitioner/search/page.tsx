import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { formatDay } from "@/components/entries";
import { recordKindLabel, recordKindPill } from "@/lib/record-meta";

export const dynamic = "force-dynamic";

const SNIPPET = 180;

function snippet(text: string | null, term: string) {
  if (!text) return null;
  const at = text.toLowerCase().indexOf(term.toLowerCase());
  if (at < 0) return text.length > SNIPPET ? `${text.slice(0, SNIPPET).trimEnd()}…` : text;
  const start = Math.max(0, at - 60);
  const end = Math.min(text.length, at + term.length + 120);
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

// Cross-client search (C8 spec §5). The most privileged surface in the app:
// practitioner-only, server-side, snippets not full dumps, and search terms
// or content are NEVER logged. MVP is ILIKE over the denormalized RecordItem
// plus client name/email; Postgres full-text is the flagged upgrade path.
export default async function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  await requirePractitioner();

  const q = (searchParams.q ?? "").trim().slice(0, 100);

  const [clients, items] = q
    ? await Promise.all([
        prisma.user.findMany({
          where: {
            role: "CLIENT",
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
            ],
          },
          select: { id: true, name: true, email: true, active: true },
          take: 10,
        }),
        prisma.recordItem.findMany({
          where: {
            OR: [
              { summary: { contains: q, mode: "insensitive" } },
              { title: { contains: q, mode: "insensitive" } },
              { tags: { has: q.toLowerCase() } },
            ],
          },
          orderBy: { occurredAt: "desc" },
          take: 30,
        }),
      ])
    : [[], []];

  // Names for the matched items, fetched separately to keep the query simple.
  const nameOf = new Map(
    (
      await prisma.user.findMany({
        where: { id: { in: [...new Set(items.map((i) => i.clientId))] } },
        select: { id: true, name: true, email: true },
      })
    ).map((c) => [c.id, c.name || c.email]),
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>Across everything</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">Search</h1>
        <SignatureRule />
      </div>

      <form action="/practitioner/search" method="get" className="flex items-stretch gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          autoFocus
          placeholder="A client, a theme, a word they used…"
          className="min-w-0 flex-1 rounded-md border border-line bg-white px-4 py-2.5 text-base text-ink shadow-soft outline-none placeholder:text-slate focus:border-wine focus:ring-2 focus:ring-wine/20"
        />
        <button className="shrink-0 rounded-md bg-wine px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wine-dark">
          Search
        </button>
      </form>

      {q && (
        <>
          {clients.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-xl font-semibold">Clients</h2>
              <ul className="flex flex-col gap-2">
                {clients.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/practitioner/clients/${c.id}`}
                      className="font-medium text-wine underline-offset-4 hover:underline"
                    >
                      {c.name || c.email}
                    </Link>{" "}
                    <span className="text-sm text-slate">{c.email}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold">In their records</h2>
            {items.length === 0 ? (
              <p className="text-ink">
                Nothing matched{clients.length > 0 ? " in record content" : ""} — try a different
                word, a tag, or part of a name.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {items.map((item) => (
                  <Link
                    key={item.id}
                    href={`/practitioner/clients/${item.clientId}/record`}
                    className="flex flex-col gap-1.5 rounded-lg border border-line bg-white px-4 py-3 shadow-soft transition-colors hover:bg-blush"
                  >
                    <div className="flex flex-wrap items-baseline gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${recordKindPill(item.kind)}`}
                      >
                        {recordKindLabel(item.kind)}
                      </span>
                      <span className="text-sm font-medium text-ink-strong">
                        {nameOf.get(item.clientId) ?? "Client"}
                      </span>
                      {item.title && <span className="text-sm text-ink">{item.title}</span>}
                      <span className="ml-auto text-xs text-slate">{formatDay(item.occurredAt)}</span>
                    </div>
                    {item.summary && (
                      <p className="text-sm leading-relaxed text-ink">{snippet(item.summary, q)}</p>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
