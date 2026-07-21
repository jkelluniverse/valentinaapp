import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { formatInZone, getOrCreateConfig, getPractitioner } from "@/lib/schedule";
import { applyHandwrittenNote, dismissHandwrittenNote, retryTranscription } from "../actions";

// C14-REMARKABLE R.3 — the 10-second review: transcript beside the
// handwriting, client + session pre-matched, one wine Apply. Fixing a word is
// inline (the textarea IS the note body).

export const dynamic = "force-dynamic";

export default async function HandwrittenReview({
  params,
  searchParams,
}: {
  params: { draftId: string };
  searchParams: { error?: string };
}) {
  await requirePractitioner();
  const draft = await prisma.handwrittenNote.findUnique({ where: { id: params.draftId } });
  if (!draft || draft.status !== "DRAFT") notFound();

  const practitioner = await getPractitioner();
  const config = practitioner ? await getOrCreateConfig(practitioner.id) : null;
  const [clients, recentSessions] = await Promise.all([
    prisma.user.findMany({
      where: { role: "CLIENT", active: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.appointment.findMany({
      where: {
        kind: "SESSION",
        clientId: { not: null },
        startAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
      },
      orderBy: { startAt: "desc" },
      take: 20,
      include: { client: { select: { id: true, name: true } } },
    }),
  ]);
  const fmtWhen = (d: Date) =>
    config
      ? formatInZone(d, config.timezone, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : d.toISOString();

  return (
    <div className="flex flex-col gap-5">
      <Link href="/practitioner/notes/inbox" className="text-[13px] text-whisper underline-offset-4 hover:text-wine hover:underline">
        ← Margins inbox
      </Link>
      <div>
        <p className="text-eyebrow font-semibold uppercase text-mocha">Handwritten session note</p>
        <p className="mt-1 text-[13px] text-slate">
          {draft.matchConfidence === "AMBIGUOUS"
            ? "Two possibilities that day — pick who this belongs to."
            : draft.matchConfidence === "NONE"
              ? "No confident match — pick the client."
              : "Matched from the calendar and the name on the page — confirm and apply."}
        </p>
      </div>

      {searchParams.error === "client" && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          Pick the client first — a note never lands on the wrong person&apos;s map.
        </p>
      )}
      {searchParams.error === "empty" && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          The note text can&apos;t be empty.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* The original — her handwriting, part of the record. */}
        <div className="overflow-hidden rounded-card border border-line bg-surface shadow-soft">
          <object
            data={`/api/handwritten/${draft.id}/pdf`}
            type="application/pdf"
            className="h-[560px] w-full"
          >
            <p className="p-6 text-sm text-ink">
              <a
                className="font-medium text-wine underline-offset-4 hover:underline"
                href={`/api/handwritten/${draft.id}/pdf`}
                target="_blank"
              >
                Open the original page ↗
              </a>
            </p>
          </object>
        </div>

        {/* The transcript — editable inline. */}
        <form action={applyHandwrittenNote.bind(null, draft.id)} className="flex flex-col gap-3">
          {draft.transcript == null ? (
            <div className="flex flex-col items-start gap-3 rounded-card border border-line bg-surface p-6 shadow-soft">
              <p className="text-sm text-ink">
                The transcription didn&apos;t finish — try it again.
              </p>
              <button
                formAction={retryTranscription.bind(null, draft.id)}
                className="rounded-md border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush"
              >
                Transcribe again
              </button>
            </div>
          ) : (
            <>
              <input
                name="title"
                defaultValue={draft.subject ?? ""}
                placeholder="Title (optional)"
                className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
              />
              <textarea
                name="transcript"
                defaultValue={draft.transcript}
                rows={16}
                className="rounded-md border border-line bg-surface px-3 py-2 font-mono text-[13px] leading-relaxed text-ink"
              />
              <p className="text-[11.5px] text-whisper">
                [?] marks a word the transcription wouldn&apos;t guess — fix it here if you can read
                it. _underlines_, *stars* and → survive from the page.
              </p>
              <div className="flex flex-wrap gap-3">
                <label className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-xs font-medium text-ink-strong">Client — the gate</span>
                  <select
                    name="clientId"
                    required
                    defaultValue={draft.matchedClientId ?? ""}
                    className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="">Pick the client…</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name || c.email}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="text-xs font-medium text-ink-strong">
                    Session <span className="font-normal text-slate">(optional)</span>
                  </span>
                  <select
                    name="appointmentId"
                    defaultValue={draft.matchedAppointmentId ?? ""}
                    className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
                  >
                    <option value="">No session link</option>
                    {recentSessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.client?.name ?? "—"} · {fmtWhen(s.startAt)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="flex items-center gap-4">
                <button className="rounded-md bg-wine px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wine-dark">
                  Apply
                </button>
                <button
                  formAction={dismissHandwrittenNote.bind(null, draft.id)}
                  className="text-sm font-medium text-slate underline-offset-4 hover:text-wine hover:underline"
                >
                  Dismiss
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
