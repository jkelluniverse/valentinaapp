// C12X — the intelligence surfaces on the Portrait: the Integration Guide
// (§3), the three quiet ledgers (§7), and Ask the Record (§8). Server
// components; every action is a plain form into intelligence-actions.

import { prisma } from "@/lib/prisma";
import { CONFIDENCE_MEANING, isConfidenceLevel } from "@/lib/confidence";
import { latestMarks } from "@/lib/resonance";
import { artifactStaleness, type InputsFingerprint } from "@/lib/staleness";
import { SUGGESTED_QUERIES } from "@/ai/askRecordPrompt";
import { STATEMENT_CRITERIA, type StatementLint } from "@/lib/belief-statements";
import type { GuideOutput } from "@/ai/integrationGuidePrompt";
import type { AskOutput } from "@/ai/askRecordPrompt";
import {
  refreshGuide,
  markGuideClaim,
  addGoal,
  setGoalStatus,
  addBelief,
  generateBeliefOptions,
  approveBeliefStatement,
  updateBeliefOutcome,
  saveInterventionOutcome,
  askTheRecord,
} from "./intelligence-actions";

const fmtDay = (d: Date) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(d);

// §6 — source + level render together, always. One pill, everywhere.
export function ConfidencePill({ level }: { level: string }) {
  const l = level.toUpperCase();
  const tone =
    l === "CONFIRMED"
      ? "bg-blush-deep text-wine"
      : l === "CONTRADICTED"
        ? "border border-line text-whisper line-through"
        : l === "SPECULATIVE"
          ? "border border-dashed border-mocha text-mocha"
          : l === "RESOLVED"
            ? "border border-mocha text-mocha"
            : "border border-line text-slate";
  return (
    <span
      title={isConfidenceLevel(l) ? CONFIDENCE_MEANING[l] : ""}
      className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${tone}`}
    >
      {l.toLowerCase()}
    </span>
  );
}

function EvidenceList({
  ids,
  itemMap,
}: {
  ids: string[];
  itemMap: Map<string, { id: string; title: string | null; kind: string; summary: string | null; occurredAt: Date }>;
}) {
  const items = ids.map((id) => itemMap.get(id)).filter((i): i is NonNullable<typeof i> => !!i);
  if (items.length === 0) return null;
  return (
    <div className="mt-1.5 flex flex-col gap-1">
      {items.map((ev) => (
        <details key={ev.id} className="rounded-md border border-line/70 bg-cream/40 px-3 py-1.5">
          <summary className="cursor-pointer list-none text-[12.5px] text-ink">
            {ev.title || ev.kind.toLowerCase().replace(/_/g, " ")}{" "}
            <span className="text-whisper">· {fmtDay(ev.occurredAt)}</span>
          </summary>
          <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-relaxed text-slate">
            {ev.summary}
          </p>
        </details>
      ))}
    </div>
  );
}

async function evidenceMapFor(clientId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  const items = unique.length
    ? await prisma.recordItem.findMany({
        where: { id: { in: unique }, clientId },
        select: { id: true, title: true, kind: true, summary: true, occurredAt: true },
      })
    : [];
  return new Map(items.map((i) => [i.id, i]));
}

// ---------------------------------------------------------------------------
// The Integration Guide (§3)

export async function GuideTab({
  clientId,
  banner,
}: {
  clientId: string;
  banner?: string;
}) {
  const guide = await prisma.integrationGuide.findUnique({ where: { clientId } });
  const output = guide ? (guide.output as unknown as GuideOutput) : null;
  const marks = await latestMarks(clientId, "GUIDE_CLAIM");

  // PATCH-01 §2 — staleness, not schedules: the quiet chip, her tap.
  const staleness = guide
    ? await artifactStaleness(
        clientId,
        (guide.fingerprint as unknown as InputsFingerprint | null) ?? null,
        guide.generatedAt,
        { watchRecord: true, watchMethod: true },
      )
    : null;
  const priorVersions = await prisma.artifactVersion.findMany({
    where: { clientId, artifactType: "GUIDE" },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  // PATCH-01 §1 — the values lens is absent until scored AND approved.
  const spiralLens = await prisma.lensResult.findFirst({
    where: { userId: clientId, lens: "SPIRAL" },
    select: { practitionerReviewed: true },
  });
  const valuesJoined = Boolean(spiralLens?.practitionerReviewed);

  const allIds = output
    ? output.components.flatMap((c) => [
        ...c.crossRefs.flatMap((r) => r.evidenceIds),
        ...c.beliefs.flatMap((b) => b.evidenceIds),
      ])
    : [];
  const itemMap = await evidenceMapFor(clientId, allIds);

  const BANNERS: Record<string, string> = {
    fresh: "Guide refreshed against the current record.",
    consent: "This client doesn't have consent on file, so the Guide can't run.",
    config: "The AI service isn't configured yet (ANTHROPIC_API_KEY).",
    "no-charts": "No chart yet — the Guide reads the chart against the record.",
    empty: "Nothing in the record yet to cross-reference.",
    api: "The Guide couldn't be drawn just now — nothing was stored; try again.",
  };

  return (
    <div className="flex flex-col gap-5">
      {banner && BANNERS[banner] && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">{BANNERS[banner]}</p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <p className="text-eyebrow font-semibold uppercase text-mocha">Integration Guide</p>
          <p className="mt-1 max-w-prose text-[13px] text-slate">
            Their chart read against the full record — consistent and complicating evidence both,
            every claim labeled. Yours only; the client never sees this.
          </p>
        </div>
        <form action={refreshGuide.bind(null, clientId)}>
          <button className="rounded-md border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush">
            {guide ? "Refresh against the record" : "Draw the Guide"}
          </button>
        </form>
      </div>
      {guide && (
        <p className="text-[12px] text-whisper">
          Last drawn {fmtDay(guide.generatedAt)} · {guide.model}
        </p>
      )}

      {!valuesJoined && (
        <p className="rounded-md bg-cream px-4 py-2.5 text-[13px] text-ink">
          The values lens will join this picture once the assessment is taken — the guide below
          works from the chart lenses and the record.
        </p>
      )}

      {staleness?.stale && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-mocha/60 bg-blush/40 px-4 py-2.5">
          <p className="text-[13px] text-wine">
            New since this was written — {staleness.reasons.join("; ")}.
          </p>
          <form action={refreshGuide.bind(null, clientId)}>
            <button className="text-[13px] font-semibold text-wine underline-offset-4 hover:underline">
              Refresh?
            </button>
          </form>
        </div>
      )}

      {output?.referral.flag && (
        <div className="rounded-card border-2 border-rose bg-white p-5 shadow-card">
          <p className="max-w-prose text-sm text-ink">
            The Guide met something heavy and stopped instead of analyzing — please review their
            recent material directly and consider involving a licensed professional.
            {output.referral.reason ? ` (${output.referral.reason})` : ""}
          </p>
        </div>
      )}

      {output && !output.referral.flag && (
        <>
          <p className="max-w-prose text-[15px] leading-relaxed text-ink">{output.overview}</p>
          {output.components.map((c) => {
            const mark = marks.get(c.key);
            return (
              <div key={c.key} className="rounded-card border border-line bg-surface p-5 shadow-soft">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-headline text-[16px] font-semibold text-ink-strong">{c.title}</p>
                  <ConfidencePill level={c.confidence} />
                  <span className="text-[10.5px] uppercase tracking-wide text-whisper">
                    AI-generated
                  </span>
                </div>
                <p className="mt-2 max-w-prose text-[14px] leading-relaxed text-ink">{c.traditional}</p>

                {c.crossRefs.length > 0 && (
                  <div className="mt-3 flex flex-col gap-2.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-mocha">
                      Record cross-reference
                    </p>
                    {c.crossRefs.map((r, i) => (
                      <div key={i} className="rounded-md border border-line/70 px-3.5 py-2.5">
                        <p className="text-[13.5px] text-ink">
                          <span
                            className={`mr-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                              r.direction === "CONSISTENT"
                                ? "bg-blush-deep text-wine"
                                : "border border-mocha text-mocha"
                            }`}
                          >
                            {r.direction === "CONSISTENT" ? "consistent" : "complicates"}
                          </span>
                          <span className="font-medium text-ink-strong">{r.theme}</span> → {r.connection}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          <ConfidencePill level={r.confidence} />
                          <p className="text-[12.5px] italic text-slate">“{r.validationQuestion}”</p>
                        </div>
                        {r.evidenceIds.length > 0 ? (
                          <EvidenceList ids={r.evidenceIds} itemMap={itemMap} />
                        ) : (
                          <p className="mt-1 text-[12px] text-whisper">
                            The record doesn&apos;t establish this yet.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {c.beliefs.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-mocha">
                      Beliefs the record shows
                    </p>
                    {c.beliefs.map((b, i) => (
                      <div key={i} className="mt-1.5">
                        <p className="text-[13.5px] text-ink">“{b.wording}”</p>
                        <EvidenceList ids={b.evidenceIds} itemMap={itemMap} />
                      </div>
                    ))}
                  </div>
                )}

                {c.statementOptions.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-mocha">
                      Statement options{" "}
                      <span className="normal-case text-whisper">
                        — options only; the client approves wording in session
                      </span>
                    </p>
                    <ul className="mt-1 flex list-disc flex-col gap-0.5 pl-5 text-[13.5px] text-ink">
                      {c.statementOptions.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {c.homeworkIdeas.length > 0 && (
                  <p className="mt-3 text-[13px] text-slate">
                    <span className="font-medium text-ink-strong">To try between sessions:</span>{" "}
                    {c.homeworkIdeas.join(" · ")}
                  </p>
                )}

                {c.cautions.length > 0 && (
                  <p className="mt-3 rounded-md bg-cream px-3 py-2 text-[12.5px] text-mocha">
                    Cautions: {c.cautions.join(" · ")}
                  </p>
                )}

                {/* §5 — her resonance on this component. */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="mr-1 text-[10.5px] uppercase tracking-wide text-whisper">
                    Resonance
                  </span>
                  {(["FEELS_TRUE", "PARTLY", "DOESNT_FIT", "NOT_YET", "NO_LONGER"] as const).map((v) => (
                    <form key={v} action={markGuideClaim.bind(null, clientId, c.key)}>
                      <input type="hidden" name="value" value={v} />
                      <button
                        className={`rounded-full px-2.5 py-1 text-[11.5px] transition-colors ${
                          mark === v
                            ? "bg-wine font-semibold text-cream"
                            : "border border-line text-slate hover:border-mocha hover:text-ink"
                        }`}
                      >
                        {
                          {
                            FEELS_TRUE: "Feels true",
                            PARTLY: "Partly",
                            DOESNT_FIT: "Doesn't fit",
                            NOT_YET: "Not yet",
                            NO_LONGER: "No longer relevant",
                          }[v]
                        }
                      </button>
                    </form>
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}

      {!output && (
        <p className="max-w-prose text-ink">
          No Guide yet — draw it once the record has some life in it. It cross-references every
          chart theme with what they&apos;ve actually written.
        </p>
      )}

      {/* PATCH-01 §2 — history, not amnesia. */}
      {priorVersions.length > 0 && (
        <details className="rounded-md border border-line/70 px-4 py-3">
          <summary className="cursor-pointer text-[13px] font-medium text-slate">
            Prior versions · {priorVersions.length}
          </summary>
          <div className="mt-2 flex flex-col gap-2">
            {priorVersions.map((v) => {
              const old = v.content as unknown as GuideOutput;
              return (
                <details key={v.id} className="rounded-md border border-line/60 px-3 py-2">
                  <summary className="cursor-pointer text-[12.5px] text-ink">
                    {fmtDay(v.generatedAt)} · {v.model}
                  </summary>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate">
                    {old?.overview ?? "—"}
                  </p>
                </details>
              );
            })}
          </div>
        </details>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Goals (§7 domain B) — original wording sacred.

export async function GoalsTab({ clientId, banner }: { clientId: string; banner?: string }) {
  const goals = await prisma.clientGoal.findMany({
    where: { clientId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  return (
    <div className="flex flex-col gap-5">
      {banner === "added" && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          Goal kept — in their words, exactly.
        </p>
      )}
      <div>
        <p className="text-eyebrow font-semibold uppercase text-mocha">Goals</p>
        <p className="mt-1 max-w-prose text-[13px] text-slate">
          The client&apos;s goals in their ORIGINAL wording — sacred, never paraphrased away. Date,
          why it matters, what stands in the way.
        </p>
      </div>

      {goals.map((g) => (
        <div key={g.id} className="rounded-card border border-line bg-surface p-5 shadow-soft">
          <p className="font-headline text-[16px] leading-relaxed text-ink-strong">“{g.statement}”</p>
          <p className="mt-1 text-[12px] text-whisper">
            {fmtDay(g.createdAt)} · {g.status.toLowerCase()}
          </p>
          {g.whyItMatters && (
            <p className="mt-2 text-[13.5px] text-ink">
              <span className="font-medium">Why it matters:</span> {g.whyItMatters}
            </p>
          )}
          {g.obstacles && (
            <p className="mt-1 text-[13.5px] text-ink">
              <span className="font-medium">In the way:</span> {g.obstacles}
            </p>
          )}
          <form
            action={setGoalStatus.bind(null, clientId, g.id)}
            className="mt-3 flex items-center gap-2"
          >
            <select
              name="status"
              defaultValue={g.status}
              className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink"
            >
              <option value="ACTIVE">Active</option>
              <option value="PROGRESSING">Progressing</option>
              <option value="ACHIEVED">Achieved</option>
              <option value="RETIRED">Retired</option>
            </select>
            <button className="text-[13px] font-medium text-wine underline-offset-4 hover:underline">
              Update
            </button>
          </form>
        </div>
      ))}

      <div className="rounded-card border border-line bg-surface p-5 shadow-soft">
        <p className="text-sm font-medium text-ink-strong">Add a goal — their words, verbatim</p>
        <form action={addGoal.bind(null, clientId)} className="mt-3 flex flex-col gap-3">
          <textarea
            name="statement"
            required
            rows={2}
            placeholder="Exactly as they said it"
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
          />
          <input
            name="whyItMatters"
            placeholder="Why it matters (optional)"
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
          />
          <input
            name="obstacles"
            placeholder="What stands in the way (optional)"
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
          />
          <button className="self-start rounded-md bg-wine px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-wine-dark">
            Keep it
          </button>
          <p className="text-[12px] text-whisper">
            The wording can never be edited afterwards — that&apos;s the point.
          </p>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Belief Work (§7 domain K) — the seven-step wizard, approval gate enforced.

type StoredOption = { text: string; lint: StatementLint };

export async function BeliefsTab({ clientId, banner }: { clientId: string; banner?: string }) {
  const [beliefs, coreBeliefNodes] = await Promise.all([
    prisma.beliefWork.findMany({ where: { clientId }, orderBy: { createdAt: "desc" } }),
    prisma.psycheNode.findMany({
      where: { clientId, kind: "CORE_BELIEF", state: { notIn: ["ARCHIVED"] } },
      select: { id: true, label: true },
    }),
  ]);

  const BANNERS: Record<string, string> = {
    added: "Belief added — generate statement options when you're ready.",
    options: "Options drafted — the client chooses and adapts the wording in session.",
    approved: "Approved wording recorded — it can now appear in prep.",
    unattested: "The approval needs the client's yes in session — tick the attestation.",
    lint: "That wording trips the criteria (negation, future tense, absolutes…) — adjust it.",
    nostatement: "Pick or write the approved wording first.",
    config: "The AI service isn't configured yet (ANTHROPIC_API_KEY).",
    api: "Options couldn't be drafted just now — try again.",
    updated: "Updated.",
  };

  return (
    <div className="flex flex-col gap-5">
      {banner && BANNERS[banner] && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">{BANNERS[banner]}</p>
      )}
      <div>
        <p className="text-eyebrow font-semibold uppercase text-mocha">Belief work</p>
        <p className="mt-1 max-w-prose text-[13px] text-slate">
          Each limiting belief with its evidence, generated statement OPTIONS, and the
          client-approved final wording. No statement is usable until the client approves it — the
          eighth criterion is a gate, not a suggestion.
        </p>
      </div>

      {beliefs.map((b) => {
        const options = (b.statementOptions as unknown as StoredOption[] | null) ?? [];
        return (
          <div key={b.id} className="rounded-card border border-line bg-surface p-5 shadow-soft">
            <p className="font-headline text-[16px] text-ink-strong">“{b.belief}”</p>
            <p className="mt-1 text-[12px] text-whisper">
              {fmtDay(b.createdAt)} · {b.status.toLowerCase()}
              {b.nodeId ? " · linked to the map" : ""}
            </p>

            {b.approvedStatement ? (
              <div className="mt-3 rounded-md bg-blush/50 px-4 py-3">
                <p className="text-[13.5px] font-medium text-wine">“{b.approvedStatement}”</p>
                <p className="mt-0.5 text-[11.5px] text-slate">
                  Client-approved {b.approvedAt ? fmtDay(b.approvedAt) : ""}
                  {b.balanceUsed ? ` · ${b.balanceUsed}` : ""}
                </p>
              </div>
            ) : (
              <>
                {options.length === 0 ? (
                  <form action={generateBeliefOptions.bind(null, clientId, b.id)} className="mt-3">
                    <button className="rounded-md border border-mocha px-3.5 py-1.5 text-[13px] font-medium text-wine transition-colors hover:bg-blush">
                      Draft statement options
                    </button>
                  </form>
                ) : (
                  <div className="mt-3 flex flex-col gap-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-mocha">
                      Options — the client chooses and adapts in session
                    </p>
                    {options.map((o, i) => (
                      <div key={i} className="rounded-md border border-line/70 px-3.5 py-2.5">
                        <p className="text-[13.5px] text-ink">“{o.text}”</p>
                        <p className="mt-1 text-[11px] text-whisper">
                          {o.lint?.checks
                            ?.filter((c) => c.ok === false)
                            .map((c) => `⚠ ${c.note}`)
                            .join(" · ") || "passes the mechanical criteria"}
                        </p>
                      </div>
                    ))}
                    <details className="rounded-md border border-line/70 px-4 py-3">
                      <summary className="cursor-pointer text-sm font-medium text-wine">
                        Record the client-approved wording
                      </summary>
                      <form
                        action={approveBeliefStatement.bind(null, clientId, b.id)}
                        className="mt-3 flex flex-col gap-2.5"
                      >
                        <input
                          name="statement"
                          required
                          placeholder="The final wording — theirs"
                          className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
                        />
                        <input
                          name="balanceUsed"
                          placeholder="Balance / process used (optional)"
                          className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
                        />
                        <label className="flex items-start gap-2 text-[13px] text-ink">
                          <input type="checkbox" name="clientApproved" className="mt-0.5" />
                          <span>
                            The client approved this exact wording in session (criterion 8 — nothing
                            is usable without it).
                          </span>
                        </label>
                        <button className="self-start rounded-md bg-wine px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-wine-dark">
                          Record approval
                        </button>
                      </form>
                      <p className="mt-2 text-[11.5px] text-whisper">
                        Criteria: {STATEMENT_CRITERIA.map((c) => c.label).join(" · ")}
                      </p>
                    </details>
                  </div>
                )}
              </>
            )}

            <details className="mt-3 rounded-md border border-line/70 px-4 py-2.5">
              <summary className="cursor-pointer text-[13px] font-medium text-slate">
                Follow-up & status
              </summary>
              <form
                action={updateBeliefOutcome.bind(null, clientId, b.id)}
                className="mt-2.5 flex flex-col gap-2.5"
              >
                <input
                  name="subjectiveResponse"
                  defaultValue={b.subjectiveResponse ?? ""}
                  placeholder="How it felt, in their words"
                  className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
                />
                <input
                  name="balanceUsed"
                  defaultValue={b.balanceUsed ?? ""}
                  placeholder="Balance / process used"
                  className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
                />
                <div className="flex items-center gap-2">
                  <select
                    name="status"
                    defaultValue={b.status}
                    className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="REVISED">Revised</option>
                    <option value="RETIRED">Retired</option>
                  </select>
                  <button className="text-[13px] font-medium text-wine underline-offset-4 hover:underline">
                    Save
                  </button>
                </div>
              </form>
            </details>
          </div>
        );
      })}

      <div className="rounded-card border border-line bg-surface p-5 shadow-soft">
        <p className="text-sm font-medium text-ink-strong">Add a limiting belief — their wording</p>
        <form action={addBelief.bind(null, clientId)} className="mt-3 flex flex-col gap-3">
          <input
            name="belief"
            required
            placeholder="e.g. “No soy suficiente como soy”"
            className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
          />
          {coreBeliefNodes.length > 0 && (
            <select
              name="nodeId"
              className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
            >
              <option value="">Not linked to the map</option>
              {coreBeliefNodes.map((n) => (
                <option key={n.id} value={n.id}>
                  Link to: {n.label}
                </option>
              ))}
            </select>
          )}
          <button className="self-start rounded-md bg-wine px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-wine-dark">
            Add belief
          </button>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Intervention outcomes (§7 domain L)

export async function OutcomesTab({ clientId, banner }: { clientId: string; banner?: string }) {
  const [assignments, worksheets, outcomes] = await Promise.all([
    prisma.assignment.findMany({
      where: { clientId, status: "COMPLETED" },
      include: { prompt: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.worksheetAssignment.findMany({
      where: { clientId, status: "COMPLETED" },
      include: { worksheet: { select: { title: true } } },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
    prisma.interventionOutcome.findMany({ where: { clientId } }),
  ]);
  const byAssignment = new Map(outcomes.filter((o) => o.assignmentId).map((o) => [o.assignmentId!, o]));
  const byWorksheet = new Map(
    outcomes.filter((o) => o.worksheetAssignmentId).map((o) => [o.worksheetAssignmentId!, o]),
  );

  const rows: {
    key: string;
    title: string;
    when: Date;
    assignmentId?: string;
    worksheetAssignmentId?: string;
    outcome: (typeof outcomes)[number] | undefined;
  }[] = [
    ...assignments.map((a) => ({
      key: `a:${a.id}`,
      title: a.prompt.title,
      when: a.createdAt,
      assignmentId: a.id,
      outcome: byAssignment.get(a.id),
    })),
    ...worksheets.map((w) => ({
      key: `w:${w.id}`,
      title: w.worksheet.title,
      when: w.createdAt,
      worksheetAssignmentId: w.id,
      outcome: byWorksheet.get(w.id),
    })),
  ].sort((a, b) => b.when.getTime() - a.when.getTime());

  return (
    <div className="flex flex-col gap-5">
      {banner === "saved" && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">Outcome recorded.</p>
      )}
      <div>
        <p className="text-eyebrow font-semibold uppercase text-mocha">Intervention outcomes</p>
        <p className="mt-1 max-w-prose text-[13px] text-slate">
          What each completed assignment was FOR and what it actually produced — this is what lets
          &ldquo;Ask the Record&rdquo; answer <em>which interventions helped</em>.
        </p>
      </div>

      {rows.length === 0 && (
        <p className="text-ink">No completed assignments yet — outcomes attach as they finish.</p>
      )}

      {rows.map((r) => (
        <div key={r.key} className="rounded-card border border-line bg-surface p-5 shadow-soft">
          <p className="font-medium text-ink-strong">{r.title}</p>
          <p className="mt-0.5 text-[12px] text-whisper">completed · assigned {fmtDay(r.when)}</p>
          {r.outcome ? (
            <div className="mt-2 flex flex-col gap-1 text-[13.5px] text-ink">
              {r.outcome.purpose && (
                <p>
                  <span className="font-medium">Purpose:</span> {r.outcome.purpose}
                </p>
              )}
              {r.outcome.clientResponse && (
                <p>
                  <span className="font-medium">Their response:</span> {r.outcome.clientResponse}
                </p>
              )}
              {r.outcome.insights && (
                <p>
                  <span className="font-medium">Insights:</span> {r.outcome.insights}
                </p>
              )}
              {r.outcome.difficulties && (
                <p>
                  <span className="font-medium">Difficulties:</span> {r.outcome.difficulties}
                </p>
              )}
              {r.outcome.decision && (
                <p className="text-[12.5px] font-semibold uppercase tracking-wide text-mocha">
                  {r.outcome.decision.toLowerCase()}
                </p>
              )}
            </div>
          ) : null}
          <details className="mt-2.5 rounded-md border border-line/70 px-4 py-2.5">
            <summary className="cursor-pointer text-[13px] font-medium text-wine">
              {r.outcome ? "Edit outcome" : "Record outcome"}
            </summary>
            <form
              action={saveInterventionOutcome.bind(null, clientId)}
              className="mt-2.5 flex flex-col gap-2.5"
            >
              {r.assignmentId && <input type="hidden" name="assignmentId" value={r.assignmentId} />}
              {r.worksheetAssignmentId && (
                <input type="hidden" name="worksheetAssignmentId" value={r.worksheetAssignmentId} />
              )}
              <input
                name="purpose"
                defaultValue={r.outcome?.purpose ?? ""}
                placeholder="What was this for? (the theme it addressed)"
                className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
              />
              <input
                name="clientResponse"
                defaultValue={r.outcome?.clientResponse ?? ""}
                placeholder="How did they experience it?"
                className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
              />
              <input
                name="insights"
                defaultValue={r.outcome?.insights ?? ""}
                placeholder="Insights that emerged"
                className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
              />
              <input
                name="difficulties"
                defaultValue={r.outcome?.difficulties ?? ""}
                placeholder="Difficulties"
                className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
              />
              <div className="flex items-center gap-2">
                <select
                  name="decision"
                  defaultValue={r.outcome?.decision ?? ""}
                  className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] text-ink"
                >
                  <option value="">Decision…</option>
                  <option value="REPEAT">Repeat</option>
                  <option value="ADAPT">Adapt</option>
                  <option value="DISCONTINUE">Discontinue</option>
                </select>
                <button className="rounded-md bg-wine px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-wine-dark">
                  Save
                </button>
              </div>
            </form>
          </details>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ask the Record (§8) — cite or decline.

export async function AskTab({
  clientId,
  banner,
  spokenQuery,
}: {
  clientId: string;
  banner?: string;
  spokenQuery?: string;
}) {
  // C19 REC.5 — search the spoken record (practitioner-only). Plain text
  // match over stored transcripts; the provider's semantic search can plug in
  // through the adapter later.
  const spokenHits: { when: Date; speaker: string; text: string; startMs?: number }[] = [];
  if (spokenQuery && spokenQuery.trim().length >= 2) {
    const q = spokenQuery.trim().toLowerCase();
    const transcripts = await prisma.sessionTranscript.findMany({
      where: { clientId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { createdAt: true, segments: true },
    });
    for (const t of transcripts) {
      for (const s of (t.segments as { speaker?: string; text?: string; startMs?: number }[]) ?? []) {
        if (s.text?.toLowerCase().includes(q)) {
          spokenHits.push({ when: t.createdAt, speaker: s.speaker ?? "?", text: s.text, startMs: s.startMs });
          if (spokenHits.length >= 20) break;
        }
      }
      if (spokenHits.length >= 20) break;
    }
  }
  const answers = await prisma.askRecordAnswer.findMany({
    where: { clientId },
    orderBy: { createdAt: "desc" },
    take: 5,
  });
  const allIds = answers.flatMap((a) =>
    ((a.output as unknown as AskOutput).findings ?? []).flatMap((f) => f.evidenceIds),
  );
  const itemMap = await evidenceMapFor(clientId, allIds);

  const BANNERS: Record<string, string> = {
    consent: "This client doesn't have consent on file, so the record can't be queried.",
    config: "The AI service isn't configured yet (ANTHROPIC_API_KEY).",
    empty: "Nothing in the record yet to ask about.",
    api: "The question couldn't be answered just now — try again.",
  };

  return (
    <div className="flex flex-col gap-5">
      {banner && BANNERS[banner] && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">{BANNERS[banner]}</p>
      )}
      <div>
        <p className="text-eyebrow font-semibold uppercase text-mocha">Ask the record</p>
        <p className="mt-1 max-w-prose text-[13px] text-slate">
          Longitudinal questions, answered with citations — or declined honestly. A research tool
          over their record, never an oracle.
        </p>
      </div>

      <form action={askTheRecord.bind(null, clientId)} className="flex flex-col gap-2.5">
        <div className="flex flex-wrap gap-2">
          <input
            name="question"
            required
            maxLength={500}
            placeholder="e.g. When did she first mention her father?"
            className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
          />
          <button className="rounded-md bg-wine px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-wine-dark">
            Ask
          </button>
        </div>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTED_QUERIES.map((q) => (
          <form key={q.en} action={askTheRecord.bind(null, clientId)}>
            <input type="hidden" name="question" value={q.en} />
            <button className="rounded-full border border-line px-3 py-1.5 text-[12.5px] text-slate transition-colors hover:border-mocha hover:text-ink">
              {q.en}
            </button>
          </form>
        ))}
      </div>

      {/* C19 REC.5 — the spoken record. */}
      <div className="rounded-card border border-line bg-surface p-5 shadow-soft">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-mocha">
          Search the spoken record
        </p>
        <form method="get" className="mt-2 flex flex-wrap gap-2">
          <input type="hidden" name="tab" value="ask" />
          <input
            name="st"
            defaultValue={spokenQuery ?? ""}
            placeholder="a word or phrase they said in session"
            className="min-w-0 flex-1 rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
          />
          <button className="rounded-md border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush">
            Search
          </button>
        </form>
        {spokenQuery && (
          <div className="mt-3 flex flex-col gap-1.5">
            {spokenHits.length === 0 ? (
              <p className="text-[13px] text-slate">Nothing in the spoken record matches.</p>
            ) : (
              spokenHits.map((h, i) => (
                <p key={i} className="text-[13px] leading-relaxed text-ink">
                  <span className="mr-1.5 text-[11px] font-semibold uppercase text-whisper">
                    {fmtDay(h.when)}
                    {h.startMs != null
                      ? ` · ${Math.floor(h.startMs / 60000)}:${String(Math.floor((h.startMs % 60000) / 1000)).padStart(2, "0")}`
                      : ""}{" "}
                    · {h.speaker === "CLIENT" ? "client" : "V"}
                  </span>
                  {h.text}
                </p>
              ))
            )}
          </div>
        )}
      </div>

      {answers.map((a) => {
        const out = a.output as unknown as AskOutput;
        return (
          <div key={a.id} className="rounded-card border border-line bg-surface p-5 shadow-soft">
            <p className="font-medium text-ink-strong">“{a.question}”</p>
            <p className="mt-0.5 text-[11.5px] text-whisper">{fmtDay(a.createdAt)}</p>
            <div className="mt-2.5 flex flex-col gap-2.5">
              {out.findings.map((f, i) => (
                <div key={i}>
                  <p className="text-[14px] text-ink">
                    {f.statement} <ConfidencePill level={f.confidence} />
                  </p>
                  <EvidenceList ids={f.evidenceIds} itemMap={itemMap} />
                </div>
              ))}
              {out.notEstablished.length > 0 && (
                <div className="rounded-md bg-cream px-3.5 py-2.5">
                  <p className="text-[12.5px] font-medium text-mocha">
                    The record doesn&apos;t establish:
                  </p>
                  <ul className="mt-0.5 flex list-disc flex-col gap-0.5 pl-5 text-[12.5px] text-slate">
                    {out.notEstablished.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              )}
              {out.findings.length === 0 && out.notEstablished.length === 0 && (
                <p className="text-[13px] text-slate">Nothing found either way.</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
