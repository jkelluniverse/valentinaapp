"use server";

// C14-REMARKABLE R.3/R.4 + C19 REC.3/REC.4 — the review actions. The one
// absolute gate: nothing applies without an explicitly confirmed client.

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { readPracticeSetting, writePracticeSetting } from "@/lib/practice-settings";
import { requirePractitioner } from "@/lib/auth-guards";
import { transcribeHandwrittenNote } from "@/lib/remarkable";
import { runPsycheExtraction } from "@/lib/psyche-extract";
import { NOTES_SOURCE_KEY } from "@/lib/psyche-extract";
import { hasRecordingConsent, applyRecordingCore } from "@/lib/recording";

const INBOX = "/practitioner/notes/inbox";

async function ensureNotesSource(practitionerId: string) {
  // §8 flag 4 — notes-as-extraction-source turns on with this feature (her
  // consent line lives in the inbox empty-state copy).
  const row = await readPracticeSetting(NOTES_SOURCE_KEY);
  if (row?.value !== "true") {
    await writePracticeSetting(NOTES_SOURCE_KEY, "true");
    console.log(`[margins-inbox] notes-as-source enabled by=${practitionerId}`);
  }
}

export async function retryTranscription(draftId: string) {
  await requirePractitioner();
  await transcribeHandwrittenNote(draftId);
  revalidatePath(INBOX);
  redirect(`${INBOX}/${draftId}`);
}

export async function applyHandwrittenNote(draftId: string, formData: FormData) {
  const me = await requirePractitioner();
  const draft = await prisma.handwrittenNote.findUnique({ where: { id: draftId } });
  if (!draft || draft.status !== "DRAFT") redirect(INBOX);

  // The wrong-client gate is absolute: the client comes from HER form pick,
  // re-validated here — never from the suggestion alone.
  const clientId = String(formData.get("clientId") ?? "");
  const client = await prisma.user.findFirst({
    where: { id: clientId, role: "CLIENT" },
    select: { id: true },
  });
  if (!client) redirect(`${INBOX}/${draftId}?error=client`);

  const appointmentIdRaw = String(formData.get("appointmentId") ?? "").trim();
  let appointmentId: string | null = null;
  if (appointmentIdRaw) {
    const appt = await prisma.appointment.findFirst({
      where: { id: appointmentIdRaw, clientId: client.id },
      select: { id: true },
    });
    appointmentId = appt?.id ?? null;
  }

  const body = String(formData.get("transcript") ?? "").trim();
  if (!body) redirect(`${INBOX}/${draftId}?error=empty`);
  const title = String(formData.get("title") ?? "").trim() || "Session note (her hand)";

  const note = await prisma.note.create({
    data: {
      authorId: me.id,
      clientId: client.id,
      appointmentId,
      depth: "NOTE",
      title,
      body,
      tags: ["session-note", "remarkable"],
    },
  });
  await prisma.handwrittenNote.update({
    where: { id: draft.id },
    data: { status: "APPLIED", appliedNoteId: note.id, appliedAt: new Date(), appliedById: me.id, matchedClientId: client.id, matchedAppointmentId: appointmentId },
  });
  await ensureNotesSource(me.id);
  console.log(`[margins-inbox] handwritten applied draft=${draft.id} note=${note.id}`);

  // The map deepens on its own: extraction over the new material, evidence
  // marks pointing into this note. Long-running — fired, not awaited.
  void runPsycheExtraction(client.id, me.id, {}).catch(() => undefined);

  revalidatePath(INBOX);
  redirect(`${INBOX}?applied=note`);
}

export async function dismissHandwrittenNote(draftId: string) {
  await requirePractitioner();
  await prisma.handwrittenNote.updateMany({
    where: { id: draftId, status: "DRAFT" },
    data: { status: "DISMISSED" },
  });
  revalidatePath(INBOX);
  redirect(INBOX);
}

// ---- Recording drafts (heavier gate: redaction pass before Apply) ----

export async function applyRecordingDraft(draftId: string, formData: FormData) {
  const me = await requirePractitioner();
  const draft = await prisma.recordingDraft.findUnique({ where: { id: draftId } });
  if (!draft || draft.status !== "DRAFT") redirect(INBOX);

  const clientId = String(formData.get("clientId") ?? "");
  const client = await prisma.user.findFirst({
    where: { id: clientId, role: "CLIENT" },
    select: { id: true },
  });
  if (!client) redirect(`${INBOX}/rec/${draftId}?error=client`);
  // Consent is the feature: applying a recording to a non-consented client is
  // impossible, not discouraged.
  if (!(await hasRecordingConsent(client.id))) redirect(`${INBOX}/rec/${draftId}?error=consent`);

  const appointmentIdRaw = String(formData.get("appointmentId") ?? "").trim();
  let appointmentId: string | null = null;
  if (appointmentIdRaw) {
    const appt = await prisma.appointment.findFirst({
      where: { id: appointmentIdRaw, clientId: client.id },
      select: { id: true },
    });
    appointmentId = appt?.id ?? null;
  }

  // Redaction strike (§4) + persistence live in the shared core — struck
  // passages are filtered before the row exists, not hidden after.
  const redactIndexes = formData
    .getAll("redact")
    .map((v) => Number(v))
    .filter((n) => Number.isInteger(n));
  const res = await applyRecordingCore({
    draftId: draft.id,
    clientId: client.id,
    appointmentId,
    redactIndexes,
    practitionerId: me.id,
  });
  if (!res.ok) redirect(`${INBOX}/rec/${draftId}?error=${res.error}`);
  await ensureNotesSource(me.id);

  // Extraction runs over client-attributed speech only (the extractor reads
  // SessionTranscript directly and never treats her speech as client data).
  void runPsycheExtraction(client.id, me.id, {}).catch(() => undefined);

  revalidatePath(INBOX);
  redirect(`${INBOX}?applied=recording${res.crisisFlag ? "&crisis=1" : ""}`);
}

export async function dismissRecordingDraft(draftId: string) {
  await requirePractitioner();
  await prisma.recordingDraft.updateMany({
    where: { id: draftId, status: "DRAFT" },
    data: { status: "DISMISSED" },
  });
  revalidatePath(INBOX);
  redirect(INBOX);
}

// SESSION-PIPELINE §5 — the one-tap speaker flip: the diarization heuristic
// is provisional; the reviewer corrects it here before anything persists.
export async function flipRecordingSpeakers(draftId: string) {
  await requirePractitioner();
  const draft = await prisma.recordingDraft.findUnique({ where: { id: draftId } });
  if (!draft || draft.status !== "DRAFT") return;
  const payload = draft.payload as unknown as {
    segments: { speaker: string; [k: string]: unknown }[];
    transcriptMeta?: { speakerMapping?: Record<string, string> };
    [k: string]: unknown;
  };
  const flip = (r: string) => (r === "CLIENT" ? "PRACTITIONER" : r === "PRACTITIONER" ? "CLIENT" : r);
  payload.segments = payload.segments.map((s) => ({ ...s, speaker: flip(s.speaker) }));
  if (payload.transcriptMeta?.speakerMapping) {
    for (const k of Object.keys(payload.transcriptMeta.speakerMapping)) {
      payload.transcriptMeta.speakerMapping[k] = flip(payload.transcriptMeta.speakerMapping[k]);
    }
  }
  await prisma.recordingDraft.update({ where: { id: draftId }, data: { payload: payload as unknown as object } });
  revalidatePath(`/practitioner/notes/inbox/rec/${draftId}`);
}
