import { prisma } from "@/lib/prisma";
import { getTenant } from "@/lib/tenancy";
import { getBaseUrlSafe } from "@/lib/base-url";
import { hasRecordingConsent } from "@/lib/recording";
import { putObject, newAudioKey, signAudioToken } from "@/lib/storage";
import { getTranscriptionProvider, mapSpeakers } from "@/lib/transcription";
import type { NormalizedTranscript } from "@/lib/transcription";
import { extractFromTranscript } from "@/lib/capture-extract";

// SESSION-PIPELINE — the pipeline service. Door B (upload) in, draft out.
// Consent is a HARD STOP enforced here in code, not in copy (spec §4):
// no transcription ever runs for a client without an active consent record.
// The practitioner stays the author: everything this pipeline produces is
// a DRAFT in the existing review inbox; approval is the only merge path.

const ACCEPTED = new Map<string, string>([
  ["audio/mpeg", "mp3"],
  ["audio/mp3", "mp3"],
  ["audio/mp4", "m4a"],
  ["audio/x-m4a", "m4a"],
  ["audio/m4a", "m4a"],
  ["audio/aac", "aac"],
  ["audio/wav", "wav"],
  ["audio/x-wav", "wav"],
  ["audio/webm", "webm"],
  ["video/mp4", "mp4"],
  ["audio/flac", "flac"],
  ["audio/ogg", "ogg"],
]);
const MAX_BYTES = 500 * 1024 * 1024; // ≈ several hours of audio

export async function startUploadCapture(args: {
  practitionerId: string;
  clientId: string;
  file: File;
}): Promise<{ ok: true; captureId: string } | { ok: false; error: string }> {
  const { practitionerId, clientId, file } = args;
  if (!ACCEPTED.has(file.type)) return { ok: false, error: "format" };
  if (file.size > MAX_BYTES) return { ok: false, error: "toobig" };

  // The consent gate — the pipeline will not move without it (spec §4).
  if (!(await hasRecordingConsent(clientId))) return { ok: false, error: "consent" };

  const tenant = await getTenant();

  // BILLING §4.4 — SUSPENDED/CANCELED soft gate: no NEW session processing.
  // Existing drafts, review, and everything already captured stay readable.
  {
    const { newActivityAllowed } = await import("@/lib/billing/state");
    if (!(await newActivityAllowed(tenant.id))) return { ok: false, error: "billing" };
  }
  const key = newAudioKey(tenant.id, ACCEPTED.get(file.type)!);
  putObject(key, Buffer.from(await file.arrayBuffer()));

  const capture = await prisma.sessionCapture.create({
    data: {
      practitionerId,
      clientId,
      source: "UPLOAD",
      status: "TRANSCRIBING",
      recordedAt: new Date(),
      audioKey: key,
      audioMime: file.type,
      audioBytes: file.size,
    },
  });

  try {
    const base = getBaseUrlSafe();
    const token = signAudioToken(capture.id);
    const { jobId } = await getTranscriptionProvider().submit({
      audioUrl: `${base}/api/captures/audio/${capture.id}?token=${token}`,
      webhookUrl: `${base}/api/webhooks/transcription?capture=${capture.id}&token=${token}`,
      diarization: true,
    });
    await prisma.sessionCapture.update({ where: { id: capture.id }, data: { providerJobId: jobId } });
    return { ok: true, captureId: capture.id };
  } catch (e) {
    await prisma.sessionCapture.update({
      where: { id: capture.id },
      data: { status: "ERROR", errorMessage: e instanceof Error ? e.message : "submit failed" },
    });
    return { ok: false, error: "provider" };
  }
}

// Webhook/backstop continuation: fetch the completed transcript, scrub the
// vendor copy, run extraction, land the draft in the review inbox.
export async function completeCapture(captureId: string): Promise<void> {
  const capture = await prisma.sessionCapture.findFirst({ where: { id: captureId } });
  if (!capture || !capture.providerJobId || capture.status !== "TRANSCRIBING") return; // idempotent

  const provider = getTranscriptionProvider();
  const result = await provider.fetchResult(capture.providerJobId);
  if (result.status === "pending") return;
  if (result.status === "error") {
    await prisma.sessionCapture.update({
      where: { id: capture.id },
      data: { status: "ERROR", errorMessage: result.errorMessage },
    });
    return;
  }

  const t: NormalizedTranscript = result.transcript;
  await provider.deleteRemote(capture.providerJobId); // vendor holds audio for minutes, not months
  await prisma.sessionCapture.update({ where: { id: capture.id }, data: { status: "EXTRACTING" } });

  const mapping = mapSpeakers(t);
  const segments = t.utterances.map((u) => ({
    speaker: mapping[u.rawSpeakerLabel] ?? "UNKNOWN",
    rawSpeakerLabel: u.rawSpeakerLabel,
    text: u.text,
    startMs: u.startMs,
  }));

  let extraction: Awaited<ReturnType<typeof extractFromTranscript>> | null = null;
  try {
    extraction = await extractFromTranscript(segments);
  } catch (e) {
    // Extraction failure never loses the transcript: the draft lands with
    // segments + a flag; extraction can be retried from the draft later.
    console.error(`[capture] extraction failed capture=${capture.id}: ${e instanceof Error ? e.message : "error"}`);
  }

  // The draft — same shape the C19 review inbox already speaks
  // (PulledRecording), plus the extraction block the review UI shows.
  const draft = await prisma.recordingDraft.create({
    data: {
      provider: "capture",
      providerRef: capture.id,
      matchedClientId: capture.clientId,
      matchConfidence: "exact",
      payload: {
        summary: extraction?.session_summary ?? null,
        segments,
        tags: extraction?.themes ?? [],
        language: t.languageCode,
        audioUrl: null, // custody is OURS already; never a provider link
        extraction: extraction ?? { failed: true },
        transcriptMeta: {
          provider: t.provider,
          providerJobId: t.providerJobId,
          durationMs: t.durationMs,
          costEstimateUsd: t.costEstimateUsd,
          speakerMapping: mapping,
        },
      } as unknown as object,
    },
  });
  await prisma.sessionCapture.update({
    where: { id: capture.id },
    data: { status: "REVIEW", draftId: draft.id },
  });
}
