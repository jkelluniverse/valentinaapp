import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { formatDay, formatTime } from "@/components/entries";
import type { PrepOutput } from "@/ai/sessionPrepPrompt";
import { RunPrepButton } from "./RunPrepButton";
import { savePrepNotes } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  consent: "This client hasn't consented to AI-assisted review, so prep can't run.",
  config: "The AI service isn't configured yet — add ANTHROPIC_API_KEY to the app service.",
  empty: "There's nothing in the last 90 days to prepare from yet.",
  api: "The preparation service had a problem. Nothing was stored — try again in a moment.",
};

// Practitioner-only session prep (C5). Clients have no route to any of this.
export default async function PrepPage({
  params,
  searchParams,
}: {
  params: { clientId: string };
  searchParams: { done?: string; error?: string; prep?: string; saved?: string };
}) {
  await requirePractitioner();

  const client = await prisma.user.findFirst({
    where: { id: params.clientId, role: "CLIENT" },
    select: { id: true, name: true, email: true, aiConsentAt: true },
  });
  if (!client) notFound();

  const preps = await prisma.sessionPrep.findMany({
    where: { clientId: client.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const selected = searchParams.prep
    ? preps.find((p) => p.id === searchParams.prep) ?? preps[0]
    : preps[0];
  const output = selected ? (selected.output as unknown as PrepOutput) : null;
  const errorMessage = searchParams.error ? ERRORS[searchParams.error] ?? ERRORS.api : null;
  const saveNotes = selected ? savePrepNotes.bind(null, selected.id) : null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>Session prep</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">{client.name || client.email}</h1>
        <p className="max-w-prose text-sm text-slate">
          A working map — hypotheses to explore, not a diagnosis. Prepared for you; you own the
          interpretation. Clients never see this.
        </p>
        <SignatureRule />
      </div>

      {searchParams.done && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          Preparation ready — review it below.
        </p>
      )}
      {searchParams.saved && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">Notes saved.</p>
      )}
      {errorMessage && <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">{errorMessage}</p>}

      {client.aiConsentAt ? (
        <div className="flex flex-col gap-2">
          <RunPrepButton clientId={client.id} />
          <p className="text-xs text-slate">
            Reads the last 90 days of their record (pseudonymized) plus rollups. Consented{" "}
            {formatDay(client.aiConsentAt)}.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-line bg-white p-6 shadow-soft">
          <h2 className="text-xl font-semibold">Waiting on consent</h2>
          <p className="mt-2 max-w-prose text-ink">
            {client.name || "This client"} hasn&apos;t agreed to AI-assisted review yet, so
            session prep is off for them. They can turn it on from the privacy choices in their
            own space — you could mention it next time you talk.
          </p>
        </div>
      )}

      {selected && output && (
        <article className="flex flex-col gap-6">
          <div className="flex flex-wrap items-baseline gap-3">
            <h2 className="text-xl font-semibold">
              {formatDay(selected.createdAt)} · {formatTime(selected.createdAt)}
            </h2>
            <span className="text-xs text-slate">{selected.model}</span>
          </div>

          {output.referral.flag ? (
            <div className="flex flex-col gap-3 rounded-lg border-2 border-rose bg-white p-6 shadow-soft">
              <h3 className="font-headline text-xl font-semibold text-rose">
                This may need a licensed professional
              </h3>
              <p className="leading-relaxed text-ink">
                {output.referral.reason ??
                  "The record contains signals that go beyond coaching. Please review directly and consider a referral before proceeding with normal session prep."}
              </p>
              <p className="text-sm text-slate">
                A full formulation is withheld when this flag is raised. Your judgement leads here.
              </p>
            </div>
          ) : (
            <>
              <section className="flex flex-col gap-3">
                <h3 className="text-lg font-semibold">Recurring themes</h3>
                {output.formulation.themes.length === 0 ? (
                  <p className="text-sm text-ink">None surfaced.</p>
                ) : (
                  output.formulation.themes.map((t, i) => (
                    <div key={i} className="flex flex-col gap-1 rounded-lg border border-line bg-white p-4 shadow-soft">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-ink-strong">{t.name}</p>
                        <span className="text-xs text-mocha">{t.trend}</span>
                      </div>
                      <p className="text-sm leading-relaxed text-ink">{t.evidence}</p>
                    </div>
                  ))
                )}
              </section>

              {output.formulation.shifts.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h3 className="text-lg font-semibold">Notable shifts</h3>
                  <ul className="flex list-disc flex-col gap-1 pl-5 text-ink">
                    {output.formulation.shifts.map((s, i) => (
                      <li key={i} className="leading-relaxed">{s}</li>
                    ))}
                  </ul>
                </section>
              )}

              <section className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-line bg-white p-4 shadow-soft">
                  <p className="text-label font-semibold uppercase tracking-wide text-mocha">
                    A belief worth exploring
                  </p>
                  <p className="mt-1 leading-relaxed text-ink">{output.formulation.beliefToExplore}</p>
                </div>
                <div className="rounded-lg border border-line bg-white p-4 shadow-soft">
                  <p className="text-label font-semibold uppercase tracking-wide text-mocha">
                    A possible opening
                  </p>
                  <p className="mt-1 leading-relaxed text-ink">{output.formulation.openingQuestion}</p>
                </div>
              </section>

              {output.formulation.notes && (
                <section className="flex flex-col gap-2">
                  <h3 className="text-lg font-semibold">Notes</h3>
                  <p className="max-w-prose leading-relaxed text-ink">{output.formulation.notes}</p>
                </section>
              )}
            </>
          )}

          <section className="rounded-md bg-cream p-4">
            <p className="text-label font-semibold uppercase tracking-wide text-mocha">
              How sure is this?
            </p>
            <p className="mt-1 text-sm leading-relaxed text-ink">{output.uncertainty}</p>
          </section>

          {saveNotes && (
            <form action={saveNotes} className="flex flex-col gap-2">
              <label className="text-label font-semibold uppercase tracking-wide text-mocha">
                Your annotations
              </label>
              <textarea
                name="notes"
                rows={3}
                defaultValue={selected.practitionerNotes ?? ""}
                placeholder="What you validated, discarded, or want to bring into session…"
                className="rounded-md border border-line bg-white px-3 py-2.5 text-base leading-relaxed text-ink outline-none placeholder:text-slate focus:border-wine focus:ring-2 focus:ring-wine/20"
              />
              <button className="self-start rounded-md border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush">
                Save annotations
              </button>
            </form>
          )}
        </article>
      )}

      {preps.length > 1 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">Past preparations</h2>
          <ul className="flex flex-col gap-1.5">
            {preps.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/practitioner/clients/${client.id}/prep?prep=${p.id}`}
                  className={`text-sm underline-offset-4 hover:underline ${
                    selected?.id === p.id ? "font-semibold text-wine" : "text-ink"
                  }`}
                >
                  {formatDay(p.createdAt)} · {formatTime(p.createdAt)}
                  {p.referralFlag && <span className="ml-2 text-rose">referral flagged</span>}
                  {p.practitionerNotes && <span className="ml-2 text-slate">annotated</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link
        href={`/practitioner/clients/${client.id}`}
        className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
      >
        Back to the client page
      </Link>
    </div>
  );
}
