import Link from "next/link";
import { notFound } from "next/navigation";
import type { RecordItem } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { formatDay, formatTime } from "@/components/entries";
import { noteSnippet } from "@/lib/notes";
import { getOrCreateConfig, getPractitioner, formatInZone } from "@/lib/schedule";
import type { NoteScanOutput } from "@/ai/noteScanPrompt";
import { NoteEditor } from "./NoteEditor";
import {
  saveNoteFields,
  expandNote,
  elaborateNote,
  scanNote,
  linkNoteSession,
  fileNoteToClient,
  archiveNote,
  appendToNote,
  draftPromptFromNote,
  draftWorksheetFromNote,
  assignPromptFromNote,
  assignWorksheetFromNote,
} from "../actions";

export const dynamic = "force-dynamic";

const SCAN_ERRORS: Record<string, string> = {
  unfiled: "File this note to a client first — a scan reads against their record.",
  consent: "This client hasn't consented to AI-assisted review, so a scan can't run.",
  config: "The AI service isn't configured (ANTHROPIC_API_KEY).",
  empty: "There's nothing recent in their record to scan against yet.",
  api: "The scan couldn't be completed just now — try again in a moment.",
  needsclient: "File this note to a client before turning it into an assignment.",
};

export default async function NotePage({
  params,
  searchParams,
}: {
  params: { noteId: string };
  searchParams: { scanned?: string; assigned?: string; error?: string; drafted?: string; itemId?: string };
}) {
  await requirePractitioner();

  const note = await prisma.note.findUnique({
    where: { id: params.noteId },
    include: { scans: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!note) notFound();

  const [client, parent, clients] = await Promise.all([
    note.clientId
      ? prisma.user.findFirst({ where: { id: note.clientId }, select: { id: true, name: true, email: true } })
      : Promise.resolve(null),
    note.parentNoteId
      ? prisma.note.findUnique({ where: { id: note.parentNoteId }, select: { id: true, title: true, body: true } })
      : Promise.resolve(null),
    note.clientId
      ? Promise.resolve([])
      : prisma.user.findMany({ where: { role: "CLIENT" }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
  ]);
  const clientName = client?.name || client?.email || null;

  // Sessions for the optional link (this client's appointments).
  const practitioner = await getPractitioner();
  const config = practitioner ? await getOrCreateConfig(practitioner.id) : null;
  const appointments = note.clientId
    ? await prisma.appointment.findMany({
        where: { clientId: note.clientId },
        orderBy: { startAt: "desc" },
        take: 12,
      })
    : [];
  const linkedSession = appointments.find((a) => a.id === note.appointmentId) ?? null;

  const latestScan = note.scans[0];
  const scanOut = latestScan ? (latestScan.connections as unknown as NoteScanOutput) : null;

  // Fetch the record items the scan cites, for tappable evidence snippets.
  const evidenceIds = scanOut && !scanOut.referral.flag
    ? [...new Set(scanOut.connections.flatMap((c) => c.evidenceRecordItemIds))]
    : [];
  const evidenceItems = evidenceIds.length
    ? await prisma.recordItem.findMany({ where: { id: { in: evidenceIds }, clientId: note.clientId ?? undefined } })
    : [];
  const evidenceById = new Map(evidenceItems.map((i) => [i.id, i]));

  // Turn-into review card (a freshly drafted prompt/worksheet awaiting assign).
  const draftedPrompt =
    searchParams.drafted === "prompt" && searchParams.itemId
      ? await prisma.prompt.findUnique({ where: { id: searchParams.itemId } })
      : null;
  const draftedWorksheet =
    searchParams.drafted === "worksheet" && searchParams.itemId
      ? await prisma.worksheet.findUnique({ where: { id: searchParams.itemId }, select: { id: true, title: true, intro: true } })
      : null;

  const substantial = note.body.trim().length > 80;
  const back = client ? `/practitioner/clients/${client.id}?tab=margins` : "/practitioner/notes";

  return (
    <div className="flex flex-col gap-8">
      <Link href={back} className="text-[13px] text-whisper underline-offset-4 hover:text-wine hover:underline">
        ← {client ? clientName : "notebook"}
      </Link>

      {/* Thread breadcrumb */}
      {parent && (
        <Link
          href={`/practitioner/notes/${parent.id}`}
          className="rounded-card border border-line bg-surface px-4 py-2.5 text-sm text-slate shadow-soft hover:text-wine"
        >
          ↑ elaborated from: {noteSnippet({ title: parent.title, body: parent.body })}
        </Link>
      )}

      {/* Banners */}
      {searchParams.scanned && <Banner>Scan ready — it&apos;s below.</Banner>}
      {searchParams.assigned && <Banner>Assigned — it&apos;s waiting in their space, linked to this note.</Banner>}
      {searchParams.error && SCAN_ERRORS[searchParams.error] && <Banner>{SCAN_ERRORS[searchParams.error]}</Banner>}

      <div className="flex flex-wrap items-center gap-2 text-[13px] text-whisper">
        <span>{note.depth === "JOT" ? "Jot" : "Note"}</span>
        <span>· {formatDay(note.createdAt)} {formatTime(note.createdAt)}</span>
        {client ? <span className="text-mocha">· {clientName}</span> : <span>· unfiled</span>}
        {note.status === "ELABORATED" && <span>· became an assignment</span>}
      </div>

      <NoteEditor
        action={saveNoteFields.bind(null, note.id)}
        title={note.title ?? ""}
        body={note.body}
        tags={note.tags.join(", ")}
      />

      {/* Session link */}
      {note.clientId && appointments.length > 0 && (
        <form action={linkNoteSession.bind(null, note.id)} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-eyebrow font-semibold uppercase text-mocha">Link a session</span>
            <select name="appointmentId" defaultValue={note.appointmentId ?? ""} className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink">
              <option value="">— none —</option>
              {appointments.map((a) => (
                <option key={a.id} value={a.id}>
                  {config ? formatInZone(a.startAt, config.timezone, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : a.startAt.toISOString().slice(0, 10)}
                </option>
              ))}
            </select>
          </label>
          <button className="rounded-md border border-mocha px-3 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush">
            {linkedSession ? "Update link" : "Link"}
          </button>
        </form>
      )}

      {/* File an unfiled note to a client */}
      {!note.clientId && clients.length > 0 && (
        <form action={fileNoteToClient.bind(null, note.id)} className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-eyebrow font-semibold uppercase text-mocha">File to a client</span>
            <select name="clientId" className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink">
              <option value="">— keep unfiled —</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.email}
                </option>
              ))}
            </select>
          </label>
          <button className="rounded-md border border-mocha px-3 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush">
            File
          </button>
        </form>
      )}

      {/* Quiet actions */}
      <div className="flex flex-wrap items-center gap-4 border-t border-line pt-4 text-sm">
        {note.depth === "JOT" && (
          <form action={expandNote.bind(null, note.id)}>
            <button className="font-medium text-wine underline-offset-4 hover:underline">Expand into a note</button>
          </form>
        )}
        <form action={elaborateNote.bind(null, note.id)}>
          <button className="font-medium text-wine underline-offset-4 hover:underline">Elaborate →</button>
        </form>
        {note.clientId && (
          <>
            <NoteTurnInto noteId={note.id} />
          </>
        )}
        <form action={archiveNote.bind(null, note.id)} className="ml-auto">
          <button className="text-slate underline-offset-4 hover:text-wine hover:underline">Archive</button>
        </form>
      </div>

      {/* The one quiet nudge + the scan action */}
      {note.clientId && (
        <div className="flex flex-col gap-1">
          <form action={scanNote.bind(null, note.id)}>
            <button className="rounded-lg bg-wine px-5 py-2.5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-wine-dark">
              {latestScan ? "Scan again" : "Find connections"}
            </button>
          </form>
          {!latestScan && substantial && (
            <p className="text-[13px] text-whisper">
              Scan this against {clientName}&apos;s record for connections worth exploring — offered
              once, easy to ignore.
            </p>
          )}
        </div>
      )}

      {/* Turn-into review card */}
      {(draftedPrompt || draftedWorksheet) && (
        <section className="flex flex-col gap-3 rounded-card border border-line bg-surface p-6 shadow-card">
          <p className="text-eyebrow font-semibold uppercase text-mocha">Review before assigning</p>
          {draftedPrompt && (
            <>
              <p className="font-headline text-xl font-medium text-ink-strong">{draftedPrompt.title}</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{draftedPrompt.body}</p>
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <form action={assignPromptFromNote.bind(null, note.id, draftedPrompt.id)}>
                  <button className="rounded-lg border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush">
                    Assign to {clientName}
                  </button>
                </form>
                <Link href={`/practitioner/library/${draftedPrompt.id}`} className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline">
                  Edit in library first
                </Link>
              </div>
            </>
          )}
          {draftedWorksheet && (
            <>
              <p className="font-headline text-xl font-medium text-ink-strong">{draftedWorksheet.title}</p>
              {draftedWorksheet.intro && <p className="text-sm leading-relaxed text-ink">{draftedWorksheet.intro}</p>}
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <form action={assignWorksheetFromNote.bind(null, note.id, draftedWorksheet.id)}>
                  <button className="rounded-lg border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush">
                    Assign to {clientName}
                  </button>
                </form>
                <Link href={`/practitioner/worksheets/${draftedWorksheet.id}`} className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline">
                  Refine in the studio first
                </Link>
              </div>
            </>
          )}
        </section>
      )}

      {/* Scan results */}
      {scanOut && (
        <section className="flex flex-col gap-4">
          <p className="text-[13px] text-whisper">
            Scanned {formatDay(latestScan.createdAt)} · {latestScan.model} · hypotheses, not findings
          </p>
          {scanOut.referral.flag ? (
            <div className="flex flex-col gap-3 rounded-card border-2 border-rose bg-surface p-7 shadow-card">
              <p className="font-headline text-2xl font-medium text-rose">This may need more than coaching.</p>
              <p className="leading-relaxed text-ink">
                {scanOut.referral.reason ??
                  "The note and record hold signals that go beyond coaching. Please review directly and consider a referral."}
              </p>
              <p className="text-sm text-slate">Connections are withheld while this is raised. Your judgement leads.</p>
            </div>
          ) : scanOut.connections.length === 0 ? (
            <p className="text-ink">The record didn&apos;t echo this note — nothing to surface.</p>
          ) : (
            scanOut.connections.map((c, i) => (
              <div key={i} className="flex flex-col gap-2 rounded-card border border-line bg-surface p-6 shadow-soft">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-headline text-lg font-medium text-ink-strong">{c.area}</p>
                  <span className="ml-auto text-[13px] text-mocha">confidence: {c.confidence}</span>
                </div>
                <p className="text-sm leading-relaxed text-ink">{c.link}</p>
                {c.evidenceRecordItemIds.length > 0 && (
                  <div className="flex flex-col gap-1.5 rounded-md bg-cream p-3">
                    <p className="text-[13px] text-whisper">seen in:</p>
                    {c.evidenceRecordItemIds.map((id) => {
                      const item = evidenceById.get(id);
                      if (!item) return null;
                      return (
                        <Link
                          key={id}
                          href={`/practitioner/clients/${note.clientId}?tab=record`}
                          className="text-sm text-ink underline-offset-4 hover:text-wine hover:underline"
                        >
                          ○ {item.title ?? noteSnippet({ title: null, body: item.summary ?? "" })}
                          <span className="text-whisper"> · {formatDay(item.occurredAt)}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <p className="flex-1 text-sm italic leading-relaxed text-slate">{c.suggestion}</p>
                  <form action={appendToNote.bind(null, note.id)}>
                    <input type="hidden" name="text" value={c.suggestion} />
                    <button className="text-[13px] font-medium text-wine underline-offset-4 hover:underline">
                      Pull into note
                    </button>
                  </form>
                </div>
              </div>
            ))
          )}
        </section>
      )}
    </div>
  );
}

function Banner({ children }: { children: React.ReactNode }) {
  return <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">{children}</p>;
}

// "Turn into…" — a quiet menu that drafts a prompt or worksheet from the note.
function NoteTurnInto({ noteId }: { noteId: string }) {
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none font-medium text-wine underline-offset-4 hover:underline">
        Turn into…
      </summary>
      <div className="absolute left-0 top-7 z-10 flex w-56 flex-col gap-1 rounded-card border border-line bg-surface p-2 shadow-card">
        <form action={draftPromptFromNote.bind(null, noteId)}>
          <button className="w-full rounded-md px-3 py-2 text-left text-sm text-ink hover:bg-blush hover:text-wine">
            A prompt
          </button>
        </form>
        <form action={draftWorksheetFromNote.bind(null, noteId)}>
          <button className="w-full rounded-md px-3 py-2 text-left text-sm text-ink hover:bg-blush hover:text-wine">
            A worksheet
          </button>
        </form>
      </div>
    </details>
  );
}
