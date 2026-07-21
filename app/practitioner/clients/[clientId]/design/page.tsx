import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { HdChartView } from "@/components/HdChartView";
import { GeneKeysView, SpiralView } from "@/components/LensViews";
import { ensureChart } from "@/lib/human-design";
import { getMethodText } from "@/lib/integrative";
import { READING_HOLD_KEY, assembleCharts, chartInputHash } from "@/lib/integrative-reading";
import { artifactStaleness, type InputsFingerprint } from "@/lib/staleness";
import { ReadingProse } from "@/components/ReadingProse";
import { PendingButton } from "@/components/PendingButton";
import { STAGES, stageLabel, type SpiralScore } from "@/lib/spiral";
import type { SpherePosition } from "@/lib/gene-keys";
import type { IntegrativeOutput } from "@/ai/integrativePrompt";
import {
  saveMethodText,
  reviewSpiralLens,
  draftSynthesis,
  regenerateReading,
  saveReadingEdit,
  approveReading,
  setReadingHold,
} from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  consent: "This client doesn't have consent on file, so no draft can run.",
  config: "The AI drafting isn't configured (ANTHROPIC_API_KEY).",
  method: "Add your integration method first — the draft works through your method, never its own.",
  lenses: "The birth-data lenses aren't in yet — the chart generates from their profile.",
  api: "The draft couldn't be completed just now — try again in a moment.",
  incomplete: "The reading needs the birth-data lenses — it generates once their birth details are in.",
  "no-charts": "No chart yet — it generates once their birth details are in.",
  empty: "The reading can't be saved empty.",
};

// The client's full integrative map (C11 profile + chart, C12 lenses and
// synthesis), as session context. Practitioner-only; the AI narrative is
// practitioner-facing by design.
export default async function ClientDesignPage({
  params,
  searchParams,
}: {
  params: { clientId: string };
  searchParams: { saved?: string; error?: string };
}) {
  await requirePractitioner();

  // Self-heal pre-C12 charts: backfill the Gene Keys spheres if missing
  // (idempotent; a cheap no-op once the core exists).
  const preProfile = await prisma.clientProfile.findUnique({
    where: { userId: params.clientId },
  });
  if (preProfile) await ensureChart(preProfile);

  const client = await prisma.user.findFirst({
    where: { id: params.clientId, role: "CLIENT" },
    select: {
      id: true,
      name: true,
      email: true,
      profile: true,
      humanDesign: true,
      lensResults: true,
      integrativeProfile: true,
    },
  });
  if (!client) notFound();

  const p = client.profile;
  const gkLens = client.lensResults.find((l) => l.lens === "GENE_KEYS");
  const spiralLens = client.lensResults.find((l) => l.lens === "SPIRAL");
  const spheres = ((gkLens?.result as { spheres?: SpherePosition[] } | null)?.spheres ?? []) as SpherePosition[];
  const spiralScore = spiralLens?.result as (SpiralScore & { practitionerCenter?: string }) | null;
  const methodText = await getMethodText();
  const synthesis = client.integrativeProfile?.synthesis as IntegrativeOutput | null;

  // C12r — the client-facing reading and its controls.
  const [reading, holdRow, readerRow] = await Promise.all([
    prisma.integrativeReading.findUnique({ where: { userId: client.id } }),
    prisma.practiceSetting.findUnique({ where: { key: READING_HOLD_KEY } }),
    prisma.user.findUnique({ where: { id: client.id }, select: { locale: true } }),
  ]);
  const holdForReview = holdRow?.value === "1";

  // PATCH-01 §2 — staleness chips: reading by input hash, formulation by
  // fingerprint. Quiet chips, her tap; nothing regenerates on its own here.
  const assembledNow = await assembleCharts(client.id);
  const readingStale = Boolean(
    reading &&
      assembledNow &&
      reading.inputHash !==
        chartInputHash(assembledNow.payload, readerRow?.locale === "es" ? "es" : "en"),
  );
  const formulationStaleness = client.integrativeProfile
    ? await artifactStaleness(
        client.id,
        (client.integrativeProfile.fingerprint as unknown as InputsFingerprint | null) ?? null,
        client.integrativeProfile.generatedAt,
        { watchRecord: true, watchMethod: true },
      )
    : null;
  const formulationVersions = await prisma.artifactVersion.findMany({
    where: { clientId: client.id, artifactType: "FORMULATION" },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  // The three quiet states below the spiral: absent · sent-awaiting · pending
  // approval (the last renders as the un-reviewed blend with her sign-off form).
  const spiralSent = spiralScore
    ? null
    : await prisma.worksheetAssignment.findFirst({
        where: { clientId: client.id, status: "PENDING", worksheet: { isSpiral: true } },
        select: { createdAt: true },
      });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>Profile &amp; design</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">{client.name || client.email}</h1>
        <SignatureRule />
      </div>

      <section className="rounded-lg border border-line bg-white p-6 shadow-soft">
        <h2 className="mb-4 text-xl font-semibold">Profile</h2>
        {p ? (
          <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            {p.preferredName && <Row label="Preferred name" value={p.preferredName} />}
            {p.pronouns && <Row label="Pronouns" value={p.pronouns} />}
            {p.phone && <Row label="Phone" value={p.phone} />}
            {p.birthDate && (
              <Row
                label="Born"
                value={`${p.birthDate.toISOString().slice(0, 10)}${
                  p.birthTimeUnknown ? " · time unknown" : p.birthTime ? ` · ${p.birthTime}` : ""
                }${p.birthPlace ? ` · ${p.birthPlace}` : ""}`}
              />
            )}
            <Row
              label="Intake"
              value={
                p.intakeCompletedAt
                  ? `completed ${p.intakeCompletedAt.toISOString().slice(0, 10)}`
                  : "not yet completed"
              }
            />
          </dl>
        ) : (
          <p className="text-sm text-slate">
            Nothing here yet — they haven&apos;t filled in their profile.
          </p>
        )}
      </section>

      {searchParams.saved && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          {searchParams.saved === "synthesis" ? "Draft ready below." : "Saved."}
        </p>
      )}
      {searchParams.error && ERRORS[searchParams.error] && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          {ERRORS[searchParams.error]}
        </p>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Human Design</h2>
        {client.humanDesign ? (
          <HdChartView chart={client.humanDesign} />
        ) : (
          <p className="rounded-lg border border-line bg-white p-6 text-ink shadow-soft">
            No chart yet — it generates automatically once they add their birth date, time, and
            place in their profile.
          </p>
        )}
      </section>

      {spheres.length > 0 && (
        <section className="flex flex-col gap-4">
          <h2 className="text-xl font-semibold">Gene Keys — sphere positions</h2>
          <GeneKeysView spheres={spheres} />
        </section>
      )}

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Values spiral</h2>
        {spiralScore ? (
          <div className="rounded-lg border border-line bg-white p-6 shadow-soft">
            <SpiralView score={spiralScore} practitionerCenter={spiralScore.practitionerCenter} />
            <form
              action={reviewSpiralLens.bind(null, client.id)}
              className="mt-5 flex flex-wrap items-end gap-3 border-t border-line pt-4"
            >
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink-strong">
                  Center of gravity {spiralLens?.practitionerReviewed ? "(reviewed ✓)" : "— your read"}
                </span>
                <select
                  name="centerOverride"
                  defaultValue={spiralScore.practitionerCenter ?? spiralScore.centerOfGravity}
                  className="rounded-md border border-line px-3 py-2 text-ink"
                >
                  {STAGES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                      {s.key === spiralScore.centerOfGravity ? " (scored)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <PendingButton className="rounded-md border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush">
                {spiralLens?.practitionerReviewed ? "Update review" : "Approve for the synthesis"}
              </PendingButton>
              <p className="w-full text-xs text-slate">
                Stage-typing is interpretive — your sign-off is what lets it enter the synthesis.
              </p>
            </form>
          </div>
        ) : spiralSent ? (
          <p className="rounded-lg border border-line bg-white p-6 text-ink shadow-soft">
            Sent {spiralSent.createdAt.toISOString().slice(0, 10)} — awaiting their answers. The
            blend appears here for your review once they finish.
          </p>
        ) : (
          <p className="rounded-lg border border-line bg-white p-6 text-ink shadow-soft">
            Not taken yet — send the values assessment from the library, and their answers score
            into a blend here for your review.
          </p>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">Integrative synthesis</h2>
        <div className="rounded-lg border border-line bg-white p-6 shadow-soft">
          <form action={saveMethodText.bind(null, client.id)} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-strong">
                How you integrate these lenses (your method — practice-wide)
              </span>
              <textarea
                name="method"
                rows={6}
                defaultValue={methodText ?? ""}
                placeholder="In your own words: how do you weave type and authority, the key spectrums, and the values blend into one picture? Include a worked example if it helps. The AI draft below follows THIS — where you haven't said, it won't invent."
                className="rounded-md border border-line px-3 py-2 text-sm leading-relaxed text-ink"
              />
            </label>
            <PendingButton
              className="self-start rounded-md border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush"
              pendingLabel="Saving…"
            >
              Save method
            </PendingButton>
          </form>

          <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-line pt-4">
            <form action={draftSynthesis.bind(null, client.id)}>
              <PendingButton
                className="rounded-md bg-wine px-5 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-wine/90"
                pendingLabel="Drafting — a minute or two…"
              >
                Draft the cross-lens formulation
              </PendingButton>
            </form>
            <p className="text-xs text-slate">
              Practitioner-facing hypotheses through your method · needs the client&apos;s consent
              on file · the spiral joins once you&apos;ve approved it.
            </p>
          </div>
        </div>

        {synthesis && !spiralLens?.practitionerReviewed && (
          <p className="rounded-md bg-cream px-4 py-2.5 text-[13px] text-ink">
            The values lens will join this picture once the assessment is taken — the formulation
            below works from the chart lenses and the record.
          </p>
        )}

        {formulationStaleness?.stale && (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-mocha/60 bg-blush/40 px-4 py-2.5">
            <p className="text-[13px] text-wine">
              New since this was written — {formulationStaleness.reasons.join("; ")}.
            </p>
            <form action={draftSynthesis.bind(null, client.id)}>
              <PendingButton
                className="text-[13px] font-semibold text-wine underline-offset-4 hover:underline"
                pendingLabel="Refreshing…"
              >
                Refresh?
              </PendingButton>
            </form>
          </div>
        )}

        {synthesis && (
          <div className="flex flex-col gap-4 rounded-lg border border-line bg-white p-6 shadow-soft">
            <p className="text-xs text-slate">
              Working hypotheses — {client.integrativeProfile?.version} ·{" "}
              {client.integrativeProfile?.generatedAt.toISOString().slice(0, 10)} · for you, not
              shown to the client
            </p>
            {synthesis.throughlines?.length > 0 && (
              <div className="flex flex-col gap-3">
                <h3 className="font-semibold text-ink-strong">Throughlines</h3>
                {synthesis.throughlines.map((t, i) => (
                  <div key={i} className="rounded-md bg-cream p-4">
                    <p className="font-medium text-wine">{t.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-ink">{t.hypothesis}</p>
                    <p className="mt-1.5 text-xs text-slate">Basis: {t.basis}</p>
                  </div>
                ))}
              </div>
            )}
            {synthesis.tensions?.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="font-semibold text-ink-strong">Tensions to hold</h3>
                {synthesis.tensions.map((t, i) => (
                  <p key={i} className="text-sm leading-relaxed text-ink">
                    <span className="font-medium">{t.between}:</span> {t.hypothesis}
                  </p>
                ))}
              </div>
            )}
            {synthesis.sessionStarters?.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <h3 className="font-semibold text-ink-strong">Session starters</h3>
                {synthesis.sessionStarters.map((s, i) => (
                  <p key={i} className="text-sm leading-relaxed text-ink">
                    · {s}
                  </p>
                ))}
              </div>
            )}
            {synthesis.beliefCandidates?.length > 0 && (
              <div className="flex flex-col gap-2">
                <h3 className="font-semibold text-ink-strong">
                  Belief candidates — to explore and seal in person
                </h3>
                {synthesis.beliefCandidates.map((b, i) => (
                  <p key={i} className="text-sm leading-relaxed text-ink">
                    <span className="font-medium">&ldquo;{b.belief}&rdquo;</span>{" "}
                    <span className="text-slate">— {b.rationale}</span>
                  </p>
                ))}
                <Link
                  href={`/practitioner/clients/${client.id}/book`}
                  className="mt-1 self-start rounded-md border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush"
                >
                  Book the session to work it in person
                </Link>
              </div>
            )}
            {synthesis.methodGaps && synthesis.methodGaps.length > 0 && (
              <div className="flex flex-col gap-1.5 border-t border-line pt-3">
                <h3 className="text-sm font-semibold text-slate">
                  Where your method didn&apos;t say — worth adding above
                </h3>
                {synthesis.methodGaps.map((g, i) => (
                  <p key={i} className="text-sm text-slate">
                    · {g}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
        {/* PATCH-01 §2 — history, not amnesia. */}
        {formulationVersions.length > 0 && (
          <details className="rounded-md border border-line/70 px-4 py-3">
            <summary className="cursor-pointer text-[13px] font-medium text-slate">
              Prior formulations · {formulationVersions.length}
            </summary>
            <div className="mt-2 flex flex-col gap-2">
              {formulationVersions.map((v) => {
                const old = v.content as { narrative?: string | null };
                return (
                  <details key={v.id} className="rounded-md border border-line/60 px-3 py-2">
                    <summary className="cursor-pointer text-[12.5px] text-ink">
                      {v.generatedAt.toISOString().slice(0, 10)} · {v.model}
                    </summary>
                    <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-slate">
                      {old?.narrative ?? "—"}
                    </p>
                  </details>
                );
              })}
            </div>
          </details>
        )}
      </section>

      {/* C12r — the client-facing reading (chart-only; the one AI output they see). */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold">Their reading — &ldquo;What it all means to you&rdquo;</h2>
          <form action={setReadingHold.bind(null, client.id, !holdForReview)} className="ml-auto">
            <PendingButton className="text-sm font-medium text-slate underline-offset-4 hover:text-wine hover:underline">
              {holdForReview ? "Hold-for-review: on" : "Hold-for-review: off"}
            </PendingButton>
          </form>
        </div>
        <p className="max-w-prose text-sm text-slate">
          Woven from their three charts only — never their private record. It appears on their own
          design page {holdForReview ? "once you approve it." : "automatically."}
        </p>

        {readingStale && (
          <div className="flex flex-wrap items-center gap-3 rounded-md border border-mocha/60 bg-blush/40 px-4 py-2.5">
            <p className="text-[13px] text-wine">
              New since this was written — their chart inputs changed. It refreshes on their next
              visit, or now:
            </p>
            <form action={regenerateReading.bind(null, client.id)}>
              <PendingButton
                className="text-[13px] font-semibold text-wine underline-offset-4 hover:underline"
                pendingLabel="Regenerating…"
              >
                Regenerate?
              </PendingButton>
            </form>
          </div>
        )}

        <div className="rounded-lg border border-line bg-white p-6 shadow-soft">
          {reading ? (
            <div className="flex flex-col gap-4">
              <p className="text-xs text-slate">
                {reading.status === "PENDING_REVIEW" ? "Awaiting your approval" : "Live for the client"} ·{" "}
                {reading.model} · {reading.generatedAt.toISOString().slice(0, 10)}
                {reading.editedByPractitioner ? " · edited by you" : ""}
              </p>

              <Link
                href={`/practitioner/clients/${client.id}/design/reading`}
                className="self-start rounded-md border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush"
              >
                Read it full page · send to client · PDF →
              </Link>

              {/* One form, several actions via formAction — nested forms are
                  invalid HTML and quietly misfire (the inner buttons submit
                  the outer action). */}
              <form action={saveReadingEdit.bind(null, client.id)} className="flex flex-col gap-2">
                <label className="text-label font-semibold uppercase tracking-wide text-mocha">
                  Lightly edit (in your voice) — saving publishes it
                </label>
                <textarea
                  name="content"
                  rows={8}
                  defaultValue={reading.content}
                  className="rounded-md border border-line bg-white px-3 py-2.5 font-headline text-sm leading-relaxed text-ink outline-none focus:border-wine focus:ring-2 focus:ring-wine/20"
                />
                <div className="flex flex-wrap items-center gap-4">
                  <PendingButton
                    className="rounded-md border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush"
                    pendingLabel="Publishing…"
                  >
                    Save edits &amp; publish
                  </PendingButton>
                  {reading.status === "PENDING_REVIEW" && (
                    <PendingButton
                      formAction={approveReading.bind(null, client.id)}
                      className="rounded-md bg-wine px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-wine-dark"
                    >
                      Approve as-is
                    </PendingButton>
                  )}
                  <PendingButton
                    formAction={regenerateReading.bind(null, client.id)}
                    className="text-sm font-medium text-slate underline-offset-4 hover:text-wine hover:underline"
                    pendingLabel="Regenerating — a minute or two…"
                  >
                    Regenerate
                  </PendingButton>
                </div>
              </form>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-ink">
                No reading yet — it generates from their three charts (all must be present: birth
                data + values assessment).
              </p>
              <form action={regenerateReading.bind(null, client.id)}>
                <PendingButton
                  className="self-start rounded-md border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush"
                  pendingLabel="Generating — a minute or two…"
                >
                  Generate now
                </PendingButton>
              </form>
            </div>
          )}
        </div>
      </section>

      <Link
        href={`/practitioner/clients/${client.id}`}
        className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
      >
        Back to the client record
      </Link>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-label font-semibold uppercase tracking-wide text-mocha">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}
