// C19 — Session Recording, consent-first. Florida is an all-party consent
// state: no RecordingConsent → the feature is INVISIBLE for that client.
// Pocket is the capture/organization layer; this app remains the meaning
// layer. Everything provider-specific hides behind RecordingProvider so a
// vendor switch is an adapter, not a rebuild (§8 flag 0).

import { prisma } from "@/lib/prisma";

export const RECORDING_CONSENT_VERSION = "2026-07-rec1";

// DRAFT wording — flagged for her voice pass + professional review before any
// real session (charter rule: engineer, not lawyer). Names the vendor cloud.
export const RECORDING_CONSENT_TEXT: Record<"en" | "es", string> = {
  en:
    "I agree that Valentina may record our coaching sessions when I confirm it at the start of a session. " +
    "Audio is captured on a small recorder and processed into text by the recording service's cloud (Pocket). " +
    "Recordings and transcripts are kept as part of my practitioner-only session record, are never visible to anyone else, " +
    "and I can revoke this consent at any time — future sessions won't be recorded, and I may request deletion of past recordings.",
  es:
    "Acepto que Valentina grabe nuestras sesiones cuando yo lo confirme al inicio de una sesión. " +
    "El audio se captura en una pequeña grabadora y se convierte en texto en la nube del servicio de grabación (Pocket). " +
    "Las grabaciones y transcripciones forman parte de mi expediente de sesión (solo para la practicante), nadie más puede verlas, " +
    "y puedo revocar este consentimiento en cualquier momento — las sesiones futuras no se grabarán y puedo pedir la eliminación de las grabaciones pasadas.",
};

export async function hasRecordingConsent(clientId: string): Promise<boolean> {
  const c = await prisma.recordingConsent.findUnique({ where: { clientId } });
  return Boolean(c && !c.revokedAt);
}

// ---------------------------------------------------------------------------
// Provider adapter (§8 flag 0 — the insurance policy).

export type TranscriptSegment = {
  speaker: "CLIENT" | "PRACTITIONER" | "UNKNOWN";
  text: string;
  startMs?: number;
};

export type PulledRecording = {
  summary: string | null;
  segments: TranscriptSegment[];
  tags: string[];
  language: string | null;
  audioUrl: string | null; // provider-side; custody pull happens on apply
};

export interface RecordingProvider {
  name: string;
  fetchRecording(providerRef: string): Promise<PulledRecording | null>;
}

// Pocket's Public API (bearer key). Endpoint shapes verified during REC.2
// setup with her real account — until then failures degrade gracefully and
// nothing blocks the fixture path.
class PocketProvider implements RecordingProvider {
  name = "pocket";
  private base = process.env.POCKET_API_BASE || "https://api.heypocket.com/v1";

  async fetchRecording(providerRef: string): Promise<PulledRecording | null> {
    const key = process.env.POCKET_API_KEY;
    if (!key) return null;
    try {
      const res = await fetch(`${this.base}/recordings/${encodeURIComponent(providerRef)}`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        console.error(`[recording] pocket fetch failed ref=${providerRef} status=${res.status}`);
        return null;
      }
      const data = (await res.json()) as {
        summary?: string;
        language?: string;
        tags?: string[];
        audio_url?: string;
        transcript?: { segments?: { speaker?: string; is_owner?: boolean; text?: string; start_ms?: number }[] };
      };
      const segments: TranscriptSegment[] = (data.transcript?.segments ?? []).map((s) => ({
        // Voice Print: her enrolled voice is the owner — everything else in a
        // 1:1 session is the client. Unknown stays UNKNOWN (review decides).
        speaker: s.is_owner ? "PRACTITIONER" : s.speaker ? "CLIENT" : "UNKNOWN",
        text: s.text ?? "",
        startMs: s.start_ms,
      }));
      return {
        summary: data.summary ?? null,
        segments,
        tags: data.tags ?? [],
        language: data.language ?? null,
        audioUrl: data.audio_url ?? null,
      };
    } catch {
      console.error(`[recording] pocket fetch error ref=${providerRef}`);
      return null;
    }
  }
}

// Fixture provider — staging verification without a device: the webhook body
// carries the payload inline.
class FixtureProvider implements RecordingProvider {
  name = "fixture";
  async fetchRecording(): Promise<PulledRecording | null> {
    return null; // fixture payloads arrive inline on the webhook
  }
}

export function recordingProvider(): RecordingProvider {
  return (process.env.RECORDING_PROVIDER ?? "pocket") === "fixture"
    ? new FixtureProvider()
    : new PocketProvider();
}

// ---------------------------------------------------------------------------
// Apply core (REC.4) — shared by the review action and the verify harness.
// Redactions filter BEFORE persistence: struck passages never exist in a row.

export async function applyRecordingCore(args: {
  draftId: string;
  clientId: string;
  appointmentId: string | null;
  redactIndexes: number[];
  practitionerId: string;
}): Promise<
  | { ok: true; transcriptId: string; noteId: string; crisisFlag: boolean }
  | { ok: false; error: "draft" | "client" | "consent" | "allredacted" }
> {
  const { isCrisisSignal } = await import("@/lib/message-safety");
  const draft = await prisma.recordingDraft.findUnique({ where: { id: args.draftId } });
  if (!draft || draft.status !== "DRAFT") return { ok: false, error: "draft" };
  const client = await prisma.user.findFirst({
    where: { id: args.clientId, role: "CLIENT" },
    select: { id: true },
  });
  if (!client) return { ok: false, error: "client" };
  if (!(await hasRecordingConsent(client.id))) return { ok: false, error: "consent" };

  const payload = draft.payload as unknown as PulledRecording;
  const struck = new Set(args.redactIndexes);
  const kept = payload.segments.filter((_, i) => !struck.has(i));
  if (kept.length === 0) return { ok: false, error: "allredacted" };

  const clientSpeech = kept.filter((s) => s.speaker === "CLIENT").map((s) => s.text).join("\n");
  const crisisFlag = isCrisisSignal(clientSpeech);

  const transcript = await prisma.sessionTranscript.create({
    data: {
      clientId: client.id,
      appointmentId: args.appointmentId,
      provider: draft.provider,
      providerRef: draft.providerRef,
      // §5 custody: pulling audio into our own storage awaits object storage
      // (R2) — the provider URL is the pointer until then (flagged).
      audioRef: payload.audioUrl,
      summary: payload.summary,
      segments: kept as unknown as object,
      redactedCount: struck.size,
      language: payload.language,
      crisisFlag,
    },
  });
  const note = await prisma.note.create({
    data: {
      authorId: args.practitionerId,
      clientId: client.id,
      appointmentId: args.appointmentId,
      depth: "NOTE",
      title: "Session record (recorded)",
      body:
        payload.summary ||
        kept.slice(0, 6).map((s) => `${s.speaker === "CLIENT" ? "Client" : "V"}: ${s.text}`).join("\n"),
      tags: ["session-note", "recording"],
    },
  });
  await prisma.sessionTranscript.update({ where: { id: transcript.id }, data: { noteId: note.id } });
  await prisma.recordingDraft.update({
    where: { id: draft.id },
    data: {
      status: "APPLIED",
      appliedTranscriptId: transcript.id,
      matchedClientId: client.id,
      matchedAppointmentId: args.appointmentId,
    },
  });
  console.log(
    `[recording] applied draft=${draft.id} transcript=${transcript.id} redacted=${struck.size} crisis=${crisisFlag}`,
  );
  return { ok: true, transcriptId: transcript.id, noteId: note.id, crisisFlag };
}

// ---------------------------------------------------------------------------
// Ingest: webhook → pull → draft → match. Same §3 law as handwriting: the
// match is a SUGGESTION; Apply requires her explicit confirm.

const DAY = 86_400_000;

export async function ingestRecording(args: {
  providerRef: string;
  provider: string;
  inline?: PulledRecording | null; // fixture path
}): Promise<{ ok: boolean; draftId?: string }> {
  const existing = await prisma.recordingDraft.findUnique({
    where: { providerRef: args.providerRef },
  });
  if (existing) return { ok: true, draftId: existing.id }; // webhook replays are no-ops

  const pulled = args.inline ?? (await recordingProvider().fetchRecording(args.providerRef));
  if (!pulled || pulled.segments.length === 0) {
    console.error(`[recording] nothing pulled ref=${args.providerRef}`);
    return { ok: false };
  }

  const draft = await prisma.recordingDraft.create({
    data: {
      provider: args.provider,
      providerRef: args.providerRef,
      payload: pulled as unknown as object,
    },
  });

  // Match: tag (her first-name tag on the recording) + that day's calendar.
  const sessions = await prisma.appointment.findMany({
    where: {
      kind: "SESSION",
      clientId: { not: null },
      startAt: { gte: new Date(Date.now() - 1.5 * DAY), lte: new Date() },
      status: { in: ["SCHEDULED", "COMPLETED"] },
    },
    orderBy: { startAt: "desc" },
    take: 10,
    include: { client: { select: { id: true, name: true } } },
  });
  const { foldName } = await import("@/lib/remarkable");
  const tagNames = pulled.tags.map((t) => foldName(t)).filter(Boolean);
  const firstNameOf = (full: string | null) => foldName((full ?? "").split(/\s+/)[0] ?? "");

  let clientId: string | null = null;
  let appointmentId: string | null = null;
  let confidence: "CONFIDENT" | "AMBIGUOUS" | "NONE" = "NONE";
  const byTag = sessions.filter((s) => s.client && tagNames.includes(firstNameOf(s.client.name)));
  if (byTag.length >= 1) {
    clientId = byTag[0].clientId;
    appointmentId = byTag[0].id;
    confidence = "CONFIDENT";
  } else if (sessions.length === 1) {
    clientId = sessions[0].clientId;
    appointmentId = sessions[0].id;
    confidence = "CONFIDENT";
  } else if (sessions.length > 1) {
    clientId = sessions[0].clientId;
    appointmentId = sessions[0].id;
    confidence = "AMBIGUOUS";
  }

  // The consent gate applies at the DRAFT level too: a recording matched to a
  // client without active consent is a setup error — surface it as unmatched
  // so she notices, rather than quietly attaching.
  if (clientId && !(await hasRecordingConsent(clientId))) {
    console.warn(`[recording] matched client lacks recording consent — leaving unmatched`);
    clientId = null;
    appointmentId = null;
    confidence = "NONE";
  }

  await prisma.recordingDraft.update({
    where: { id: draft.id },
    data: { matchedClientId: clientId, matchedAppointmentId: appointmentId, matchConfidence: confidence },
  });
  console.log(`[recording] draft id=${draft.id} provider=${args.provider} confidence=${confidence}`);
  return { ok: true, draftId: draft.id };
}
