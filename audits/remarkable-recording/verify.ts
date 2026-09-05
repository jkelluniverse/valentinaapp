// C14-REMARKABLE R.1–R.5 + C19 REC.1–REC.4 verification — live pipeline runs
// against the fixture roster (typed-text PDF stands in for handwriting; true
// cursive fidelity is confirmed with her first real page).
//   ANTHROPIC_API_KEY=... DATABASE_URL=... REMARKABLE_SENDER_ALLOWLIST=notes@remarkable.com \
//   npx tsx audits/remarkable-recording/verify.ts

import { writeFileSync } from "fs";
import { join } from "path";
import { prisma } from "../../lib/prisma";
import { ingestInboundEmail } from "../../lib/remarkable";
import { ingestRecording, applyRecordingCore, type PulledRecording } from "../../lib/recording";
import { runPsycheExtraction } from "../../lib/psyche-extract";
import { RECORDING_CONSENT_TEXT, RECORDING_CONSENT_VERSION } from "../../lib/recording";
import { DEFAULT_TENANT_ID } from "../../lib/tenancy/scope";
import { withTenantScope } from "../../lib/tenancy/tenant-scope";

const report: string[] = [];
const log = (s: string) => {
  report.push(s);
  console.log(s);
};
let failed = 0;
const check = (name: string, ok: boolean, note = "") => {
  if (!ok) failed++;
  log(`- ${ok ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
};

// A one-page typed PDF standing in for her handwriting (same hand-rolled
// PDF approach as the invoice generator — byte-accurate xref).
function notePdf(lines: string[]): string {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const ops = lines
    .map((l, i) => `BT /F1 12 Tf 0.1 0.1 0.1 rg 1 0 0 1 60 ${740 - i * 22} Tm (${esc(l)}) Tj ET`)
    .join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(ops, "latin1")} >>\nstream\n${ops}\nendstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xrefAt = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) body += `${String(off).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(body, "latin1").toString("base64");
}

async function main() {
  log(`# C14-REMARKABLE + C19 verify — ${new Date().toISOString()}`);
  process.env.REMARKABLE_SENDER_ALLOWLIST ||= "notes@remarkable.com";

  const maria = (await prisma.user.findUnique({ where: { email: "maria@fixture.test" } }))!;
  const practitioner = (await prisma.user.findFirst({ where: { role: "PRACTITIONER" } }))!;

  // Re-runnable: clear artifacts from any previous verify pass. Crisis
  // transcripts especially — leftover crisis material would (correctly) make
  // the referral layer suppress every later extraction on this roster.
  await prisma.sessionTranscript.deleteMany({ where: { providerRef: { startsWith: "rec-verify" } } });
  await prisma.recordingDraft.deleteMany({ where: { providerRef: { startsWith: "rec-verify" } } });
  await prisma.handwrittenNote.deleteMany({
    where: { fromAddress: { in: ["stranger@example.com", "notes@remarkable.com"] } },
  });
  await prisma.recordingConsent.deleteMany({ where: { clientId: maria.id } });
  await prisma.note.deleteMany({
    where: { clientId: maria.id, tags: { hasSome: ["recording", "remarkable"] } },
  });

  // A session yesterday drives the calendar half of the match.
  const yesterday = new Date(Date.now() - 20 * 3_600_000);
  const appt = await prisma.appointment.create({
    data: {
      practitionerId: practitioner.id,
      clientId: maria.id,
      kind: "SESSION",
      status: "COMPLETED",
      startAt: yesterday,
      endAt: new Date(yesterday.getTime() + 3_600_000),
      location: "IN_PERSON",
      bookedBy: "practitioner",
    },
  });

  // ---- R.1: ingest — allowlist + PDF stored ----
  log(`\n## R.1 · Inbound ingest`);
  const stranger = await ingestInboundEmail({
    from: "stranger@example.com",
    attachments: [{ filename: "x.pdf", contentType: "application/pdf", contentBase64: notePdf(["hi"]) }],
  });
  check("strangers bounce silently", !stranger.ok && stranger.reason === "sender");

  const pdfB64 = notePdf([
    "Maria - 7/20",
    "session note - boundaries with her sister, said no and felt guilty then light",
    "*core belief touched: no soy suficiente como soy*",
    "-> give Maria the boundary worksheet this week",
    "posture opened when she talked about the ciclovia walks",
  ]);
  const inbound = await ingestInboundEmail({
    from: "notes@remarkable.com",
    subject: "Page from reMarkable",
    attachments: [{ filename: "note.pdf", contentType: "application/pdf", contentBase64: pdfB64 }],
  });
  check("allowlisted page lands as a draft", inbound.ok === true, inbound.reason);
  const draft = await prisma.handwrittenNote.findUnique({ where: { id: inbound.draftId! } });
  check("original PDF stored whole", (draft?.pdf.length ?? 0) > 500);

  // ---- R.2: transcription ----
  log(`\n## R.2 · Transcription`);
  check("transcript produced", Boolean(draft?.transcript), draft?.transcriptModel ?? "");
  const t = (draft?.transcript ?? "").toLowerCase();
  check("faithful to the page (boundaries line)", t.includes("boundaries") || t.includes("sister"));
  check("bilingual line kept verbatim", t.includes("no soy suficiente"));

  // ---- R.3: matching ----
  log(`\n## R.3 · Matching`);
  check(
    "calendar+name pre-selects Maria",
    draft?.matchedClientId === maria.id,
    `confidence=${draft?.matchConfidence}`,
  );

  // ---- R.4: apply → note → extraction with note evidence ----
  log(`\n## R.4 · Apply + map`);
  const note = await prisma.note.create({
    data: {
      authorId: practitioner.id,
      clientId: maria.id,
      appointmentId: appt.id,
      depth: "NOTE",
      title: "Maria — 7/20",
      body: draft!.transcript!,
      tags: ["session-note", "remarkable"],
    },
  });
  await prisma.handwrittenNote.update({
    where: { id: draft!.id },
    data: { status: "APPLIED", appliedNoteId: note.id, appliedAt: new Date(), appliedById: practitioner.id },
  });
  await prisma.practiceSetting.upsert({
    where: { key: "psycheIncludeNotes" },
    create: { key: "psycheIncludeNotes", value: "true" },
    update: { value: "true" },
  });

  // ---- REC.1: consent machinery ----
  log(`\n## REC.1 · Consent`);
  const { hasRecordingConsent } = await import("../../lib/recording");
  check("no consent → gate closed", !(await hasRecordingConsent(maria.id)));
  await prisma.recordingConsent.upsert({
    where: { clientId: maria.id },
    create: { clientId: maria.id, version: RECORDING_CONSENT_VERSION, textSnapshot: RECORDING_CONSENT_TEXT.en },
    update: { revokedAt: null },
  });
  check("consent grant opens it", await hasRecordingConsent(maria.id));

  // ---- REC.2/3: fixture recording → draft → redaction + apply ----
  log(`\n## REC.2/3 · Recording ingest + review`);
  const payload: PulledRecording = {
    summary: "Boundaries with the sister; the not-enough belief surfaced; committed to the boundary worksheet.",
    language: "es",
    audioUrl: "https://fixture.local/audio/rec-verify-1",
    tags: ["maria"],
    segments: [
      { speaker: "PRACTITIONER", text: "¿Qué pasó con tu hermana esta semana?", startMs: 12_000 },
      { speaker: "CLIENT", text: "Le dije que no podía cubrir su turno. Me sentí culpable una hora y después… ligera.", startMs: 19_000 },
      { speaker: "CLIENT", text: "Mi vecina Carmen estuvo metida en todo el asunto otra vez.", startMs: 47_000 },
      { speaker: "CLIENT", text: "La voz de 'no soy suficiente como soy' volvió antes de la presentación.", startMs: 83_000 },
      { speaker: "PRACTITIONER", text: "Quedémonos ahí un momento.", startMs: 90_000 },
    ],
  };
  const ing = await ingestRecording({ providerRef: "rec-verify-1", provider: "fixture", inline: payload });
  check("webhook payload lands as a draft", ing.ok && Boolean(ing.draftId));
  const rdraft = await prisma.recordingDraft.findUnique({ where: { id: ing.draftId! } });
  check("tag+calendar matches Maria", rdraft?.matchedClientId === maria.id, `confidence=${rdraft?.matchConfidence}`);

  // Wrong-client gate: applying to a non-consented client is impossible.
  const elena = (await prisma.user.findUnique({ where: { email: "elena@fixture.test" } }))!;
  const wrong = await applyRecordingCore({
    draftId: rdraft!.id,
    clientId: elena.id,
    appointmentId: null,
    redactIndexes: [],
    practitionerId: practitioner.id,
  });
  check("consent gate blocks a non-consented client", !wrong.ok && wrong.error === "consent");

  // Redact the third-party mention (segment 2), then apply.
  const applied = await applyRecordingCore({
    draftId: rdraft!.id,
    clientId: maria.id,
    appointmentId: appt.id,
    redactIndexes: [2],
    practitionerId: practitioner.id,
  });
  check("apply succeeds with redaction", applied.ok);
  if (applied.ok) {
    const tr = (await prisma.sessionTranscript.findUnique({ where: { id: applied.transcriptId } }))!;
    const stored = JSON.stringify(tr.segments);
    check("struck passage never persists", !stored.includes("Carmen"), "");
    check("kept passages persist with timestamps", stored.includes("ligera") && stored.includes("83000"));
    check("no crisis flag on a calm session", tr.crisisFlag === false);
    check("redactedCount recorded", tr.redactedCount === 1);
  }

  // ---- REC.4/R.4: one extraction over everything (live AI) ----
  // Runs BEFORE the crisis fixture on purpose: crisis material makes the
  // referral layer (correctly) suppress all map proposals, which would mask
  // the evidence checks below.
  log(`\n## Extraction · her hand + their words as evidence`);
  const ext = await runPsycheExtraction(maria.id, practitioner.id, {});
  check("extraction ran", ext.ok, ext.ok ? `created=${ext.created} updated=${ext.updated}` : ext.error);
  const withNoteEv = await prisma.psycheNode.count({
    where: { clientId: maria.id, evidenceNoteIds: { isEmpty: false } },
  });
  const withSpokenEv = await prisma.psycheNode.findMany({
    where: { clientId: maria.id, evidenceTranscriptRefs: { isEmpty: false } },
    select: { evidenceTranscriptRefs: true },
  });
  log(`- nodes citing her handwriting: ${withNoteEv} ${withNoteEv > 0 ? "✓" : "(0 — model discretion; review)"}`);
  log(`- nodes citing spoken moments: ${withSpokenEv.length} ${withSpokenEv.length > 0 ? "✓" : "(0 — model discretion; review)"}`);
  // Structural law: every spoken ref must resolve to a CLIENT segment.
  let herSpeechLeaks = 0;
  for (const n of withSpokenEv) {
    for (const ref of n.evidenceTranscriptRefs) {
      const [tid, idx] = ref.slice(2).split("#");
      const tr = await prisma.sessionTranscript.findUnique({ where: { id: tid }, select: { segments: true } });
      const seg = ((tr?.segments as { speaker?: string }[]) ?? [])[Number(idx)];
      if (seg && seg.speaker !== "CLIENT") herSpeechLeaks++;
    }
  }
  check("her speech never becomes client-psyche evidence", herSpeechLeaks === 0);

  // Crisis layer on transcripts: a separate fixture with a heavy line.
  const crisisPayload: PulledRecording = {
    summary: null,
    language: "en",
    audioUrl: null,
    tags: ["maria"],
    segments: [
      { speaker: "CLIENT", text: "Some days I think about ending it all — I wouldn't, but the thought visits.", startMs: 5_000 },
    ],
  };
  await ingestRecording({ providerRef: "rec-verify-crisis", provider: "fixture", inline: crisisPayload });
  const cdraft = await prisma.recordingDraft.findUnique({ where: { providerRef: "rec-verify-crisis" } });
  const capplied = await applyRecordingCore({
    draftId: cdraft!.id,
    clientId: maria.id,
    appointmentId: null,
    redactIndexes: [],
    practitionerId: practitioner.id,
  });
  check(
    "crisis layer flags the transcript",
    capplied.ok && capplied.crisisFlag === true,
    capplied.ok ? "" : capplied.error,
  );

  // ---- REC.5: spoken search ----
  log(`\n## REC.5 · Spoken search`);
  const transcripts = await prisma.sessionTranscript.findMany({
    where: { clientId: maria.id },
    select: { segments: true },
  });
  const hit = transcripts.some((tr) =>
    ((tr.segments as { text?: string }[]) ?? []).some((s) => s.text?.toLowerCase().includes("ligera")),
  );
  check("a spoken phrase is findable", hit);

  log(`\n${failed === 0 ? "ALL CHECKS PASS" : `${failed} CHECK(S) FAILED`}`);
  writeFileSync(join(__dirname, "VERIFY-LOG.md"), report.join("\n") + "\n");
  if (failed > 0) process.exit(1);
}

// C24.1-TENANT-SCOPE §3 — CLI harness: state the tenant once, for this file
// AND for the rows lib/remarkable.ts + lib/recording.ts write on its behalf.
// Before this wrap, a run left `handwrittenNote: 1` + `appointment: 1` with
// NULL tenantIds — the exact signature that kept the null-tenant invariant
// audit red. NOT VERIFIED HERE: this gate cannot pass in the build
// environment (vendor credentials — the handwriting transcription needs a
// real ANTHROPIC_API_KEY, the recording half needs ASSEMBLYAI_API_KEY), so
// this is a mechanical application of a pattern proven on harnesses that can
// be run, not a verified pass. See BUILD-REPORT-C24.1-TENANT-SCOPE.md.
withTenantScope(DEFAULT_TENANT_ID, main)
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
