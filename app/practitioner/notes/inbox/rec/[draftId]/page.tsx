import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { formatInZone, getOrCreateConfig, getPractitioner } from "@/lib/schedule";
import { hasRecordingConsent, type PulledRecording } from "@/lib/recording";
import { applyRecordingDraft, dismissRecordingDraft, flipRecordingSpeakers } from "../../actions";
import type { CaptureExtraction } from "@/lib/capture-extract";
import { PendingButton } from "@/components/PendingButton";

// C19 REC.3 — recording review: her-template summary on top, the
// speaker-labeled transcript, redaction strike per passage, the matched
// client/session, one Apply. Heavier gate than handwriting — deliberately.

export const dynamic = "force-dynamic";

export default async function RecordingReview({
  params,
  searchParams,
}: {
  params: { draftId: string };
  searchParams: { error?: string };
}) {
  await requirePractitioner();
  const draft = await prisma.recordingDraft.findUnique({ where: { id: params.draftId } });
  if (!draft || draft.status !== "DRAFT") notFound();
  const payload = draft.payload as unknown as PulledRecording & {
    extraction?: (Partial<CaptureExtraction> & { failed?: boolean }) | null;
  };
  const ex = payload.extraction && !payload.extraction.failed ? payload.extraction : null;

  const practitioner = await getPractitioner();
  const config = practitioner ? await getOrCreateConfig(practitioner.id) : null;
  const clients = await prisma.user.findMany({
    where: { role: "CLIENT", active: true },
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  // Consent is the feature: only consented clients are even offered.
  const consented: typeof clients = [];
  for (const c of clients) if (await hasRecordingConsent(c.id)) consented.push(c);

  const recentSessions = await prisma.appointment.findMany({
    where: {
      kind: "SESSION",
      clientId: { not: null },
      startAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
    },
    orderBy: { startAt: "desc" },
    take: 20,
    include: { client: { select: { id: true, name: true } } },
  });
  const fmtWhen = (d: Date) =>
    config
      ? formatInZone(d, config.timezone, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : d.toISOString();
  const mmss = (ms?: number) =>
    ms == null ? "" : `${Math.floor(ms / 60000)}:${String(Math.floor((ms % 60000) / 1000)).padStart(2, "0")}`;

  return (
    <div className="flex flex-col gap-5">
      <Link href="/practitioner/notes/inbox" className="text-[13px] text-whisper underline-offset-4 hover:text-wine hover:underline">
        ← Margins inbox
      </Link>
      <div>
        <p className="text-eyebrow font-semibold uppercase text-mocha">Session recording</p>
        <p className="mt-1 max-w-prose text-[13px] text-slate">
          Strike anything that shouldn&apos;t persist — third parties named, or moments asked off
          the record. Struck passages are never stored. Then confirm the client and apply.
        </p>
      </div>

      {searchParams.error === "client" && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          Pick the client first — the wrong-client gate is absolute.
        </p>
      )}
      {searchParams.error === "consent" && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          That client hasn&apos;t consented to recording — this can&apos;t be applied to them.
        </p>
      )}
      {searchParams.error === "allredacted" && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          Everything is struck — dismiss the draft instead.
        </p>
      )}

      <form action={applyRecordingDraft.bind(null, draft.id)} className="flex flex-col gap-4">
        {payload.summary && (
          <div className="rounded-card border border-line bg-surface p-5 shadow-soft">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-mocha">Summary</p>
            <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-relaxed text-ink">
              {payload.summary}
            </p>
          </div>
        )}

        {/* SESSION-PIPELINE §6 — the extraction, drafted for review. Flags
            lead: safety never buried. Renders only for pipeline captures. */}
        {ex && (ex.flags?.length ?? 0) > 0 && (
          <div className="rounded-card border border-mocha bg-blush p-5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-wine">Review carefully</p>
            <ul className="mt-1.5 flex flex-col gap-1 text-[14px] leading-relaxed text-wine">
              {ex.flags!.map((f, i) => (
                <li key={i}>{f}</li>
              ))}
            </ul>
          </div>
        )}
        {ex && (
          <div className="grid gap-4 md:grid-cols-2">
            {(ex.belief_statements?.length ?? 0) > 0 && (
              <div className="rounded-card border border-line bg-surface p-5 shadow-soft">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-mocha">Belief statements heard</p>
                <ul className="mt-1.5 flex flex-col gap-2 text-[13.5px] leading-relaxed text-ink">
                  {ex.belief_statements!.map((b, i) => (
                    <li key={i}>
                      “{b.statement}”{b.context && <span className="block text-[12px] text-whisper">{b.context}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(ex.action_items?.length ?? 0) > 0 && (
              <div className="rounded-card border border-line bg-surface p-5 shadow-soft">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-mocha">Action items</p>
                <ul className="mt-1.5 flex flex-col gap-1 text-[13.5px] leading-relaxed text-ink">
                  {ex.action_items!.map((a, i) => (
                    <li key={i}>
                      <span className="text-whisper">{a.owner}:</span> {a.item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(ex.follow_up_questions?.length ?? 0) > 0 && (
              <div className="rounded-card border border-line bg-surface p-5 shadow-soft">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-mocha">Worth revisiting</p>
                <ul className="mt-1.5 flex flex-col gap-1 text-[13.5px] leading-relaxed text-ink">
                  {ex.follow_up_questions!.map((q, i) => (
                    <li key={i}>{q}</li>
                  ))}
                </ul>
              </div>
            )}
            {(ex.notable_quotes?.length ?? 0) > 0 && (
              <div className="rounded-card border border-line bg-surface p-5 shadow-soft">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-mocha">In their words</p>
                <ul className="mt-1.5 flex flex-col gap-2 text-[13.5px] leading-relaxed text-ink">
                  {ex.notable_quotes!.map((q, i) => (
                    <li key={i}>
                      “{q.quote}” <span className="text-[12px] text-whisper">— {q.speaker}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <div className="rounded-card border border-line bg-surface shadow-soft">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-mocha">
              Transcript · check a line to strike it
            </p>
            <PendingButton
              formAction={flipRecordingSpeakers.bind(null, draft.id)}
              formNoValidate
              className="text-[12px] font-medium text-wine underline-offset-4 hover:underline"
            >
              Swap speakers
            </PendingButton>
          </div>
          <div className="flex max-h-[480px] flex-col overflow-y-auto">
            {payload.segments.map((s, i) => (
              <label
                key={i}
                className="flex items-start gap-3 border-b border-line/60 px-5 py-2.5 last:border-b-0 hover:bg-blush/30"
              >
                <input type="checkbox" name="redact" value={i} className="mt-1" />
                <span
                  className={`w-16 flex-none text-[11px] font-semibold uppercase ${
                    s.speaker === "CLIENT" ? "text-wine" : "text-whisper"
                  }`}
                >
                  {s.speaker === "CLIENT" ? "client" : s.speaker === "PRACTITIONER" ? "V" : "?"}
                  {s.startMs != null && <span className="block font-normal">{mmss(s.startMs)}</span>}
                </span>
                <span className="text-[13.5px] leading-relaxed text-ink">{s.text}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-xs font-medium text-ink-strong">
              Client — consented only, the gate
            </span>
            <select
              name="clientId"
              required
              defaultValue={draft.matchedClientId ?? ""}
              className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink"
            >
              <option value="">Pick the client…</option>
              {consented.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name || c.email}
                </option>
              ))}
            </select>
            {consented.length === 0 && (
              <span className="text-[11.5px] text-whisper">
                No client has recording consent yet — it lives in their Settings.
              </span>
            )}
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
          <PendingButton
            formAction={applyRecordingDraft.bind(null, draft.id)}
            pendingLabel="Applying…"
            className="rounded-md bg-wine px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wine-dark"
          >
            Apply
          </PendingButton>
          <PendingButton
            formAction={dismissRecordingDraft.bind(null, draft.id)}
            className="text-sm font-medium text-slate underline-offset-4 hover:text-wine hover:underline"
          >
            Dismiss
          </PendingButton>
        </div>
      </form>
    </div>
  );
}
