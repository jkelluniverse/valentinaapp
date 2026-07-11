import Link from "next/link";
import { requirePractitioner } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { searchEverything } from "@/lib/search";

export const dynamic = "force-dynamic";

// Site-wide search: any word, every location — clients, their full-text words,
// her margins, the library, worksheets, courses, preps, sessions, billing,
// invites. Practitioner-only; terms and content never logged (C8 §5).
export default async function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  await requirePractitioner();

  const q = (searchParams.q ?? "").trim().slice(0, 100);
  const groups = q ? await searchEverything(q) : [];
  const total = groups.reduce((n, g) => n + g.hits.length, 0);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>Across everything</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">Search</h1>
        <SignatureRule />
        <p className="max-w-prose text-sm text-slate">
          One word searches everywhere it could live — their reflections and responses, your
          notes, the library, worksheets, courses, preps, sessions, and billing.
        </p>
      </div>

      <form action="/practitioner/search" method="get" className="flex items-stretch gap-2">
        <input
          type="search"
          name="q"
          defaultValue={q}
          autoFocus
          placeholder="A client, a theme, a word anyone used…"
          className="min-w-0 flex-1 rounded-md border border-line bg-white px-4 py-2.5 text-base text-ink shadow-soft outline-none placeholder:text-slate focus:border-wine focus:ring-2 focus:ring-wine/20"
        />
        <button className="shrink-0 rounded-md bg-wine px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wine-dark">
          Search
        </button>
      </form>

      {q && total === 0 && (
        <p className="text-ink">
          Nothing matched <span className="font-medium">“{q}”</span> anywhere — not in their
          words, your notes, the library, worksheets, courses, preps, sessions, or billing. Try a
          shorter word or part of a name.
        </p>
      )}

      {q && total > 0 && (
        <p className="text-[13px] text-whisper">
          {total} {total === 1 ? "place" : "places"} mention it, across {groups.length}{" "}
          {groups.length === 1 ? "area" : "areas"}.
        </p>
      )}

      {groups.map((group) => (
        <section key={group.title} className="flex flex-col gap-3">
          <h2 className="text-eyebrow font-semibold uppercase text-mocha">{group.title}</h2>
          <div className="flex flex-col">
            {group.hits.map((hit, i) => (
              <Link
                key={`${hit.href}-${i}`}
                href={hit.href}
                className="flex flex-col gap-1 border-b border-line py-3 transition-colors hover:text-wine"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  {hit.kind && (
                    <span className="inline-flex items-center rounded-pill border border-mocha px-2 py-0.5 text-xs font-medium text-mocha">
                      {hit.kind}
                    </span>
                  )}
                  <span className="text-[15px] font-medium text-ink-strong">{hit.label}</span>
                  {hit.meta && <span className="ml-auto text-[13px] text-whisper">{hit.meta}</span>}
                </div>
                {hit.snippet && (
                  <p className="text-sm leading-relaxed text-ink">{hit.snippet}</p>
                )}
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
