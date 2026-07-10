import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
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

// A3 — The Prep Room. The AI's working formulation, handed over the way a wise
// colleague would: hypotheses with evidence, worded confidence, and a referral
// panel that takes the whole room when raised. Practitioner-only (C5).
export default async function PrepRoom({
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
  const base = `/practitioner/clients/${client.id}`;
  const name = client.name || client.email;

  const preps = await prisma.sessionPrep.findMany({
    where: { clientId: client.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const selected = searchParams.prep ? preps.find((p) => p.id === searchParams.prep) ?? preps[0] : preps[0];
  const output = selected ? (selected.output as unknown as PrepOutput) : null;
  const errorMessage = searchParams.error ? ERRORS[searchParams.error] ?? ERRORS.api : null;
  const saveNotes = selected ? savePrepNotes.bind(null, selected.id) : null;
  const referral = output?.referral.flag ?? false;

  return (
    <div className="flex flex-col gap-8">
      <Link href={`${base}?tab=prep`} className="text-[13px] text-whisper underline-offset-4 hover:text-wine hover:underline">
        ← {name}
      </Link>

      <div className="flex flex-col gap-1">
        <p className="text-eyebrow font-semibold uppercase text-mocha">Preparing for {name}</p>
        <p className="max-w-prose font-headline text-lg italic text-slate">
          A working map — hypotheses to explore, not conclusions.
        </p>
      </div>

      {searchParams.done && <Banner>Preparation ready — it&apos;s below.</Banner>}
      {searchParams.saved && <Banner>Notes saved.</Banner>}
      {errorMessage && <Banner>{errorMessage}</Banner>}

      {client.aiConsentAt ? (
        <div className="flex flex-col gap-2">
          <RunPrepButton clientId={client.id} />
          {client.aiConsentAt && (
            <p className="text-[13px] text-whisper">
              Reads the last 90 days (pseudonymized) plus rollups. Consented {formatDay(client.aiConsentAt)}.
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-card border border-line bg-surface p-6 shadow-soft">
          <p className="max-w-prose text-ink">
            {name} hasn&apos;t agreed to AI-assisted review yet, so session prep is off for them.
            They can turn it on from the privacy choices in their own space.
          </p>
        </div>
      )}

      {selected && output && (
        <article className="flex flex-col gap-8">
          <p className="text-[13px] text-whisper">
            {formatDay(selected.createdAt)} · {formatTime(selected.createdAt)} · {selected.model}
          </p>

          {referral ? (
            // Referral takes the whole room (C5 §7).
            <div className="flex flex-col gap-3 rounded-card border-2 border-rose bg-surface p-7 shadow-card">
              <p className="font-headline text-2xl font-medium text-rose">
                This may need more than coaching.
              </p>
              <p className="leading-relaxed text-ink">
                {output.referral.reason ??
                  "The record holds signals that go beyond coaching. Please review directly and consider a referral before normal session prep."}
              </p>
              <p className="text-sm text-slate">
                A full formulation is withheld while this is raised. Your judgement leads here.
              </p>
            </div>
          ) : (
            <>
              <section className="flex flex-col gap-4">
                <p className="text-eyebrow font-semibold uppercase text-mocha">Worth exploring</p>
                {output.formulation.themes.length === 0 ? (
                  <p className="text-sm text-ink">Nothing surfaced this time.</p>
                ) : (
                  output.formulation.themes.map((t, i) => (
                    <div key={i} className="flex flex-col gap-2 rounded-card border border-line bg-surface p-6 shadow-soft">
                      <p className="font-headline text-xl font-medium text-ink-strong">{t.name}</p>
                      <p className="text-sm leading-relaxed text-ink">{t.evidence}</p>
                      <div className="mt-1 flex items-center gap-3">
                        <span className="flex items-center gap-1" aria-hidden>
                          {[0, 1, 2].map((n) => (
                            <span key={n} className="h-2 w-2 rounded-full border border-mocha" />
                          ))}
                        </span>
                        <span className="text-[13px] text-mocha">{t.trend}</span>
                        <Link
                          href={`${base}?tab=record`}
                          className="ml-auto text-[13px] text-whisper underline-offset-4 hover:text-wine hover:underline"
                        >
                          in the record →
                        </Link>
                      </div>
                    </div>
                  ))
                )}
              </section>

              {output.formulation.shifts.length > 0 && (
                <section className="flex flex-col gap-2">
                  <p className="text-eyebrow font-semibold uppercase text-mocha">Notable shifts</p>
                  <ul className="flex list-disc flex-col gap-1 pl-5 text-ink">
                    {output.formulation.shifts.map((s, i) => (
                      <li key={i} className="leading-relaxed">{s}</li>
                    ))}
                  </ul>
                </section>
              )}

              {output.formulation.beliefToExplore && (
                <section className="flex flex-col gap-2">
                  <p className="text-eyebrow font-semibold uppercase text-mocha">A belief worth exploring</p>
                  <p className="max-w-prose leading-relaxed text-ink">{output.formulation.beliefToExplore}</p>
                </section>
              )}

              {output.formulation.openingQuestion && (
                <section className="flex flex-col items-center gap-2 py-4 text-center">
                  <p className="text-eyebrow font-semibold uppercase text-mocha">A question to open with</p>
                  <p className="max-w-[46ch] font-headline text-2xl italic leading-relaxed text-wine">
                    “{output.formulation.openingQuestion}”
                  </p>
                </section>
              )}

              {output.formulation.notes && (
                <section className="flex flex-col gap-2">
                  <p className="text-eyebrow font-semibold uppercase text-mocha">Notes</p>
                  <p className="max-w-prose leading-relaxed text-ink">{output.formulation.notes}</p>
                </section>
              )}
            </>
          )}

          <section className="rounded-card bg-cream p-5">
            <p className="text-eyebrow font-semibold uppercase text-mocha">How sure is this?</p>
            <p className="mt-1 text-sm leading-relaxed text-ink">{output.uncertainty}</p>
          </section>

          {saveNotes && (
            <form action={saveNotes} className="flex flex-col gap-2">
              <label className="text-eyebrow font-semibold uppercase text-mocha">Your notes</label>
              <textarea
                name="notes"
                rows={4}
                defaultValue={selected.practitionerNotes ?? ""}
                placeholder="What you validated, set aside, or want to bring into session…"
                className="rounded-card border border-line bg-surface px-4 py-3 font-headline text-lg leading-relaxed text-ink outline-none placeholder:text-whisper focus:border-wine"
              />
              <button className="self-start rounded-lg border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush">
                Save &amp; mark reviewed
              </button>
            </form>
          )}
        </article>
      )}

      {preps.length > 1 && (
        <section className="flex flex-col gap-2 border-t border-line pt-6">
          <p className="text-eyebrow font-semibold uppercase text-mocha">Past preparations</p>
          <ul className="flex flex-col gap-1.5">
            {preps.map((p) => (
              <li key={p.id}>
                <Link
                  href={`${base}/prep?prep=${p.id}`}
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
    </div>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">{children}</p>;
}
