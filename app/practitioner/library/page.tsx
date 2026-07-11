import Link from "next/link";
import type { Prompt, PromptKind } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { parseFields, answerableFields } from "@/lib/worksheet-meta";
import { PromptForm } from "./PromptForm";
import { ArchiveToggle } from "./ArchiveToggle";
import { SendToClient } from "./SendToClient";
import { ConfirmDelete } from "@/components/ConfirmDelete";
import {
  createPrompt,
  sendPromptToClient,
  sendWorksheetToClient,
  setWorksheetActiveInLibrary,
  setIntakeWorksheet,
  createSpiralAssessment,
  deletePrompt,
  deleteWorksheetEverywhere,
} from "./actions";

export const dynamic = "force-dynamic";

const SNIP = 150;
const snip = (s: string | null) =>
  !s ? "" : s.length > SNIP ? `${s.slice(0, SNIP).trimEnd()}…` : s;

// One boxed group per category (UI-PRACTITIONER-DESIGN: hairline rows inside a
// single container, not a wall of cards), with quick-jump chips up top and one
// clear "bring something new in" area where the AI studio leads.
export default async function LibraryPage({
  searchParams,
}: {
  searchParams: { saved?: string; sent?: string; deleted?: string; error?: string };
}) {
  await requirePractitioner();

  const [prompts, worksheets, clients] = await Promise.all([
    prisma.prompt.findMany({ orderBy: [{ active: "desc" }, { createdAt: "desc" }] }),
    prisma.worksheet.findMany({
      orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
      include: { _count: { select: { assignments: true } } },
    }),
    prisma.user.findMany({
      where: { role: "CLIENT", active: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const active = prompts.filter((p) => p.active);
  const archived = prompts.filter((p) => !p.active);
  const activeWorksheets = worksheets.filter((w) => w.active);
  const archivedWorksheets = worksheets.filter((w) => !w.active);
  const byKind = (kind: PromptKind) => active.filter((p) => p.kind === kind);
  const archivedCount = archived.length + archivedWorksheets.length;

  const sections = [
    { id: "worksheets", label: "Worksheets", count: activeWorksheets.length },
    { id: "prompts", label: "Prompts", count: byKind("PROMPT").length },
    { id: "exercises", label: "Exercises", count: byKind("EXERCISE").length },
    { id: "checkins", label: "Check-ins", count: byKind("CHECK_IN").length },
    ...(archivedCount > 0 ? [{ id: "archived", label: "Archived", count: archivedCount }] : []),
  ];

  const promptRow = (p: Prompt) => (
    <div key={p.id} className="flex flex-col gap-1.5 px-5 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="font-medium text-ink-strong">{p.title}</p>
        <span className="ml-auto flex items-center gap-4">
          <SendToClient action={sendPromptToClient.bind(null, p.id)} clients={clients} />
          <Link
            href={`/practitioner/library/${p.id}`}
            className="text-sm font-medium text-wine underline-offset-4 hover:underline"
          >
            Edit
          </Link>
          <ArchiveToggle promptId={p.id} active={p.active} />
          <ConfirmDelete action={deletePrompt.bind(null, p.id)} what="this item" />
        </span>
      </div>
      <p className="text-sm leading-relaxed text-slate">{snip(p.body)}</p>
    </div>
  );

  const promptBox = (id: string, title: string, kind: PromptKind, emptyLine: string) => {
    const items = byKind(kind);
    return (
      <section id={id} className="scroll-mt-24">
        <div className="rounded-card border border-line bg-white shadow-soft">
          <div className="flex flex-wrap items-baseline gap-3 border-b border-line px-5 py-4">
            <h2 className="text-xl font-semibold">{title}</h2>
            <span className="text-[13px] text-whisper">
              {items.length === 0 ? "none yet" : `${items.length} in the library`}
            </span>
          </div>
          {items.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate">{emptyLine}</p>
          ) : (
            <div className="divide-y divide-line">{items.map(promptRow)}</div>
          )}
        </div>
      </section>
    );
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>Between sessions</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">Your library</h1>
        <SignatureRule />
        <p className="max-w-prose text-ink">
          Everything you can send a client, in one organized home.
        </p>
      </div>

      {/* Quick jumps */}
      <div className="flex flex-wrap items-center gap-1.5">
        {sections.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="rounded-pill border border-line bg-white px-3.5 py-1.5 text-sm font-medium text-ink transition-colors hover:bg-blush hover:text-wine"
          >
            {s.label} <span className="text-whisper">· {s.count}</span>
          </a>
        ))}
      </div>

      {searchParams.saved && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">Saved to library.</p>
      )}
      {searchParams.sent && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          Sent — it&apos;s waiting in their space.
        </p>
      )}
      {searchParams.error === "send" && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          That couldn&apos;t be sent — check the item and client and try again.
        </p>
      )}
      {searchParams.deleted && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          Deleted — along with anything it left on client records.
        </p>
      )}

      {/* Bring something new in — the AI studio leads; writing by hand folds away. */}
      <section className="rounded-card border border-line bg-white p-6 shadow-soft">
        <div className="flex flex-wrap items-center gap-4">
          <div className="min-w-64 flex-1">
            <h2 className="text-xl font-semibold">Bring something new in</h2>
            <p className="mt-1 max-w-prose text-sm text-slate">
              Describe an idea — or drop in inspiration you found (a PDF, a screenshot, a link) —
              and the studio drafts it in your voice, ready to reshape and send.
            </p>
          </div>
          <span className="flex flex-wrap items-center gap-3">
            <Link
              href="/practitioner/library/new"
              className="rounded-lg bg-wine px-5 py-2.5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-wine-dark"
            >
              ✦ Draft with AI
            </Link>
            <Link
              href="/practitioner/worksheets/new"
              className="rounded-lg border border-mocha px-4 py-2.5 text-sm font-medium text-wine transition-colors hover:bg-blush"
            >
              New worksheet
            </Link>
          </span>
        </div>
        <details className="mt-4 border-t border-line pt-4" open={searchParams.error === "missing"}>
          <summary className="cursor-pointer list-none text-sm font-medium text-slate underline-offset-4 hover:text-wine hover:underline">
            Prefer to write one by hand? ▾
          </summary>
          <div className="mt-4">
            <PromptForm
              action={createPrompt}
              clients={clients}
              showAiLink
              error={searchParams.error === "missing" ? "A title and the text are both needed." : null}
            />
          </div>
        </details>
      </section>

      {/* Worksheets */}
      <section id="worksheets" className="scroll-mt-24">
        <div className="rounded-card border border-line bg-white shadow-soft">
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
            <h2 className="text-xl font-semibold">Worksheets</h2>
            <span className="text-[13px] text-whisper">
              {activeWorksheets.length === 0 ? "none yet" : `${activeWorksheets.length} in the library`}
            </span>
            {!worksheets.some((w) => w.isSpiral) && (
              <form action={createSpiralAssessment} className="ml-auto">
                <button
                  className="rounded-md border border-mocha px-3.5 py-1.5 text-sm font-medium text-wine transition-colors hover:bg-blush"
                  title="Creates your original values-spiral questionnaire — reword anything in the studio; answers score into the integrative map."
                >
                  Create values assessment
                </button>
              </form>
            )}
          </div>
          {activeWorksheets.length === 0 ? (
            <p className="px-5 py-4 text-sm text-slate">
              No worksheets yet — draft one in the studio and it&apos;ll live here.
            </p>
          ) : (
            <div className="divide-y divide-line">
              {activeWorksheets.map((w) => (
                <div key={w.id} className="flex flex-col gap-1.5 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="font-medium text-ink-strong">{w.title}</p>
                    {w.isIntake && (
                      <span className="inline-flex items-center rounded-pill bg-wine px-2.5 py-0.5 text-xs font-medium text-cream">
                        Intake
                      </span>
                    )}
                    {w.isSpiral && (
                      <span className="inline-flex items-center rounded-pill bg-wine px-2.5 py-0.5 text-xs font-medium text-cream">
                        Values assessment
                      </span>
                    )}
                    <span className="ml-auto flex items-center gap-4">
                      <SendToClient action={sendWorksheetToClient.bind(null, w.id)} clients={clients} />
                      <Link
                        href={`/practitioner/worksheets/${w.id}`}
                        className="text-sm font-medium text-wine underline-offset-4 hover:underline"
                      >
                        Edit
                      </Link>
                      <form action={setIntakeWorksheet.bind(null, w.id, !w.isIntake)}>
                        <button
                          className="text-sm font-medium text-slate underline-offset-4 hover:text-wine hover:underline"
                          title="The intake is auto-assigned to every new client when they accept their invite."
                        >
                          {w.isIntake ? "Unset intake" : "Set as intake"}
                        </button>
                      </form>
                      <form action={setWorksheetActiveInLibrary.bind(null, w.id, false)}>
                        <button className="text-sm font-medium text-slate underline-offset-4 hover:text-wine hover:underline">
                          Archive
                        </button>
                      </form>
                      <ConfirmDelete action={deleteWorksheetEverywhere.bind(null, w.id)} what="this worksheet" />
                    </span>
                  </div>
                  <p className="text-sm text-slate">
                    {answerableFields(parseFields(w.schema)).length} questions · sent {w._count.assignments}{" "}
                    {w._count.assignments === 1 ? "time" : "times"}
                    {w.intro ? ` — ${snip(w.intro)}` : ""}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {promptBox(
        "prompts",
        "Prompts",
        "PROMPT",
        "A prompt is a question to sit with — draft one above and it'll gather here.",
      )}
      {promptBox(
        "exercises",
        "Exercises",
        "EXERCISE",
        "An exercise is something to do — draft one above and it'll gather here.",
      )}
      {promptBox(
        "checkins",
        "Check-ins",
        "CHECK_IN",
        "A check-in is a quick pulse — draft one above and it'll gather here.",
      )}

      {/* Archived, folded away */}
      {archivedCount > 0 && (
        <section id="archived" className="scroll-mt-24">
          <details className="rounded-card border border-line bg-white/60">
            <summary className="cursor-pointer list-none px-5 py-4 text-xl font-semibold text-slate hover:text-wine">
              Archived <span className="text-[13px] font-normal text-whisper">· {archivedCount} resting</span>
            </summary>
            <div className="divide-y divide-line border-t border-line">
              {archivedWorksheets.map((w) => (
                <div key={`ws-${w.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <span className="inline-flex items-center rounded-pill bg-line/50 px-2.5 py-0.5 text-xs font-medium text-slate">
                    Worksheet
                  </span>
                  <p className="text-sm text-slate">{w.title}</p>
                  <span className="ml-auto flex items-center gap-4">
                    <form action={setWorksheetActiveInLibrary.bind(null, w.id, true)}>
                      <button className="text-sm font-medium text-slate underline-offset-4 hover:text-wine hover:underline">
                        Restore
                      </button>
                    </form>
                    <ConfirmDelete action={deleteWorksheetEverywhere.bind(null, w.id)} what="this worksheet" />
                  </span>
                </div>
              ))}
              {archived.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  <span className="inline-flex items-center rounded-pill bg-line/50 px-2.5 py-0.5 text-xs font-medium text-slate">
                    {p.kind === "PROMPT" ? "Prompt" : p.kind === "EXERCISE" ? "Exercise" : "Check-in"}
                  </span>
                  <p className="text-sm text-slate">{p.title}</p>
                  <span className="ml-auto flex items-center gap-4">
                    <ArchiveToggle promptId={p.id} active={p.active} />
                    <ConfirmDelete action={deletePrompt.bind(null, p.id)} what="this item" />
                  </span>
                </div>
              ))}
            </div>
          </details>
        </section>
      )}
    </div>
  );
}
