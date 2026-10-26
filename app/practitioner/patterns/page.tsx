import { prisma } from "@/lib/prisma";
import { readPracticeSetting } from "@/lib/practice-settings";
import { requirePractitioner } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { PATTERN_LIBRARY_KEY, K_FLOOR } from "@/lib/pattern-library";
import { KIND_LABEL } from "@/lib/psyche";
import { setLibraryEnabled, runAggregation, saveDefinition } from "./actions";
import { PendingButton } from "@/components/PendingButton";

export const dynamic = "force-dynamic";

// C16.8 — the Pattern Library: the practice's growing vocabulary of archetypes,
// learned across clients as ABSTRACTIONS ONLY (labels, definitions, k-floored
// counts — the tables cannot hold client content or identities). This is
// Valentina's clinical vocabulary, an asset of her proprietary method.
export default async function PatternsPage({
  searchParams,
}: {
  searchParams: { saved?: string; ran?: string; error?: string };
}) {
  await requirePractitioner();

  const [enabled, archetypes, links] = await Promise.all([
    readPracticeSetting(PATTERN_LIBRARY_KEY),
    prisma.patternArchetype.findMany({ orderBy: [{ clientCount: "desc" }, { label: "asc" }] }),
    prisma.patternLink.findMany({ where: { clientCount: { gte: K_FLOOR } }, orderBy: { clientCount: "desc" }, take: 30 }),
  ]);
  const on = enabled?.value === "true";
  const archById = new Map(archetypes.map((a) => [a.id, a.label]));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>Your method</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">The Pattern Library</h1>
        <SignatureRule />
        <p className="max-w-prose text-ink">
          What your practice is learning across clients — as pure abstractions. Archetype names,
          your definitions, and anonymous counts only; never anyone&apos;s words, material, or
          identity. Patterns become usable once at least {K_FLOOR} clients carry them.
        </p>
      </div>

      {searchParams.saved && <Banner>Saved.</Banner>}
      {searchParams.ran && <Banner>Aggregation ran — the vocabulary is fresh.</Banner>}
      {searchParams.error === "disabled" && <Banner>Turn the library on first.</Banner>}

      <section className="flex flex-wrap items-center gap-4 rounded-card border border-line bg-surface p-5 shadow-soft">
        <div className="min-w-64 flex-1">
          <p className="font-medium text-ink-strong">{on ? "The library is on" : "The library is off"}</p>
          <p className="mt-1 max-w-prose text-[13px] text-slate">
            Turning it on lets an aggregation job compile anonymous patterns from across your
            practice. Note: name this plainly in the next consent version before enabling with
            real clients (&ldquo;patterns from your work — never your words or identity — may be
            combined anonymously with others&apos; to improve how this method supports every
            client&rdquo;).
          </p>
        </div>
        <span className="flex items-center gap-3">
          <form action={setLibraryEnabled.bind(null, !on)}>
            <PendingButton className="rounded-lg border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush">
              {on ? "Turn off" : "Turn on"}
            </PendingButton>
          </form>
          {on && (
            <form action={runAggregation}>
              <PendingButton
                pendingLabel="Refreshing…"
                className="rounded-lg bg-wine px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-wine-dark"
              >
                Refresh the vocabulary
              </PendingButton>
            </form>
          )}
        </span>
      </section>

      <section className="flex flex-col gap-3">
        <p className="text-eyebrow font-semibold uppercase text-mocha">
          Archetypes · {archetypes.length}
        </p>
        {archetypes.length === 0 ? (
          <p className="text-[15px] text-slate">
            Nothing yet — it fills as maps grow and you refresh the vocabulary.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface shadow-soft">
            {archetypes.map((a) => (
              <details key={a.id} className="px-5 py-3">
                <summary className="flex cursor-pointer list-none flex-wrap items-baseline gap-3">
                  <span className="font-medium text-ink-strong">{a.label}</span>
                  <span className="text-[12px] uppercase tracking-wide text-whisper">{KIND_LABEL[a.kind]}</span>
                  <span className="ml-auto text-[13px] text-whisper">
                    {a.clientCount >= K_FLOOR ? `in use · ${a.clientCount} clients` : `resting until ${K_FLOOR} (${a.clientCount})`}
                  </span>
                </summary>
                <form action={saveDefinition.bind(null, a.id)} className="mt-3 flex flex-col gap-2">
                  <input
                    name="label"
                    defaultValue={a.label}
                    className="rounded-md border border-line bg-white px-3 py-2 text-ink outline-none focus:border-wine"
                  />
                  <textarea
                    name="definition"
                    defaultValue={a.definition}
                    rows={2}
                    placeholder="Your definition — this is your clinical vocabulary."
                    className="rounded-md border border-line bg-white px-3 py-2 text-ink outline-none focus:border-wine"
                  />
                  <PendingButton className="self-start rounded-md border border-mocha px-3.5 py-1.5 text-sm font-medium text-wine transition-colors hover:bg-blush">
                    Save
                  </PendingButton>
                </form>
              </details>
            ))}
          </div>
        )}
      </section>

      {links.length > 0 && (
        <section className="flex flex-col gap-3">
          <p className="text-eyebrow font-semibold uppercase text-mocha">How patterns travel together</p>
          <ul className="flex flex-col gap-1.5">
            {links.map((l) => (
              <li key={l.id} className="text-[15px] text-ink">
                <span className="font-medium">{archById.get(l.fromId) ?? "—"}</span>{" "}
                <span className="text-slate">{l.relation.toLowerCase().replace(/_/g, " ")}</span>{" "}
                <span className="font-medium">{archById.get(l.toId) ?? "—"}</span>{" "}
                <span className="text-[13px] text-whisper">· {l.clientCount} clients</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">{children}</p>;
}
