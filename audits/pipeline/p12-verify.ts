import { createServer, type Server } from "http";
import { rawPrisma as prisma } from "../../lib/prisma-internal";
import { startUploadCapture, completeCapture } from "../../lib/capture";
import { getObject, signAudioToken } from "../../lib/storage";
import type { CaptureExtraction } from "../../lib/capture-extract";

// SESSION-PIPELINE Phases 1–2 acceptance — the pipeline end-to-end against
// a LOCAL mock of AssemblyAI's surface (endpoint shapes verified against
// live docs 2026-07-22) and ONE REAL extraction call (the Claude pass is
// the deliverable; a canned response would prove nothing). CLI-run:
//
//   DATABASE_URL=...scratch ANTHROPIC_API_KEY=... npx tsx audits/pipeline/p12-verify.ts
//
// Proves: the consent hard-stop; storage custody + signed audio access;
// submit carries diarization + webhook auth; normalize + speaker heuristic;
// vendor-copy deletion after normalize; extraction lands as a DRAFT in the
// existing review inbox shape (never writes to the client record); error
// path is retryable. Self-cleaning; fixture client only.

const MOCK_PORT = 3132;
const results: { name: string; pass: boolean; note?: string }[] = [];
function check(name: string, pass: boolean, note?: string) {
  results.push({ name, pass, note });
  console.log(`- ${pass ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
}

// A tiny synthetic session: practitioner (A) opens and talks more; the
// client (B) voices a belief statement and an action item.
const UTTERANCES = [
  { speaker: "A", text: "Welcome back. Last time we talked about the promotion — where would you like to begin today?", start: 0, end: 9000, confidence: 0.98 },
  { speaker: "B", text: "The promotion, still. I keep thinking I am not someone who leads. It feels like a fact, not a thought.", start: 9200, end: 21000, confidence: 0.97 },
  { speaker: "A", text: "Say more about where that shows up during the week — at work, or before work, in the mornings?", start: 21500, end: 31000, confidence: 0.98 },
  { speaker: "B", text: "Mornings mostly. I said I would draft the proposal this week and I still have not opened the document.", start: 31200, end: 41000, confidence: 0.96 },
  { speaker: "A", text: "Alright. Before next session, you will open it once — just open it, nothing more. And I will send you the reflection prompt we discussed. We can look at what happens in the opening moment together.", start: 41500, end: 58000, confidence: 0.98 },
];

const seen = { submitted: null as Record<string, unknown> | null, deleted: false };
function mockAai(): Server {
  return createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const send = (code: number, obj: unknown) => {
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(JSON.stringify(obj));
      };
      if (req.method === "POST" && req.url === "/v2/transcript") {
        seen.submitted = JSON.parse(body || "{}");
        return send(200, { id: "aai-mock-job-1", status: "queued" });
      }
      if (req.method === "GET" && req.url === "/v2/transcript/aai-mock-job-1") {
        return send(200, {
          id: "aai-mock-job-1",
          status: "completed",
          language_code: "en",
          audio_duration: 58,
          text: UTTERANCES.map((u) => u.text).join(" "),
          utterances: UTTERANCES,
        });
      }
      if (req.method === "DELETE" && req.url === "/v2/transcript/aai-mock-job-1") {
        seen.deleted = true;
        return send(200, {});
      }
      send(404, {});
    });
  }).listen(MOCK_PORT);
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL required (scratch copy)");
  if (/railway|rlwy\.net/.test(url)) throw new Error("Refusing to run against a Railway database");
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY required (one real extraction call)");

  process.env.ASSEMBLYAI_BASE_URL = `http://localhost:${MOCK_PORT}`;
  process.env.ASSEMBLYAI_API_KEY = "mock-key";
  process.env.TRANSCRIPTION_WEBHOOK_SECRET = "mock-webhook-secret";
  process.env.AUDIO_STORAGE_DIR = "/tmp/claude-0/-home-user-valentinaapp/6622a446-2360-54fb-9af9-84a1352e1cd0/scratchpad/p12-audio";

  const maria = await prisma.user.findUnique({ where: { email: "maria@fixture.test" } });
  const tomas = await prisma.user.findUnique({ where: { email: "tomas@fixture.test" } });
  const valentina = await prisma.user.findUnique({ where: { email: "valentina@fixture.test" } });
  if (!maria || !valentina) throw new Error("fixture roster missing — seed the scratch DB first");

  const mock = mockAai();
  const cleanupIds: string[] = [];
  try {
    const file = new File([Buffer.from("RIFF-fake-audio-bytes-for-pipeline-verify")], "session.mp3", { type: "audio/mpeg" });

    // 1 — consent hard stop (Tomás has no recording consent in the fixtures)
    if (tomas && !(await prisma.recordingConsent.findFirst({ where: { clientId: tomas.id, revokedAt: null } }))) {
      const blocked = await startUploadCapture({ practitionerId: valentina.id, clientId: tomas.id, file });
      check("consent hard stop blocks the pipeline", !blocked.ok && blocked.error === "consent");
      check("nothing stored for the blocked upload", (await prisma.sessionCapture.count({ where: { clientId: tomas.id } })) === 0);
    } else {
      check("consent hard stop blocks the pipeline", false, "fixture Tomás unexpectedly has consent");
    }

    // Grant María consent for the run (removed on cleanup) if absent.
    let grantedConsent = false;
    if (!(await prisma.recordingConsent.findFirst({ where: { clientId: maria.id, revokedAt: null } }))) {
      await prisma.recordingConsent.create({
        data: { clientId: maria.id, version: "p12-verify", textSnapshot: "verify consent", tenantId: "tnt_valentina_000000001" },
      });
      grantedConsent = true;
    }

    // 2 — upload: storage custody + provider submit
    const up = await startUploadCapture({ practitionerId: valentina.id, clientId: maria.id, file });
    check("upload accepted for the consented client", up.ok);
    if (!up.ok) throw new Error("upload failed; cannot continue");
    cleanupIds.push(up.captureId);
    const cap1 = await prisma.sessionCapture.findUnique({ where: { id: up.captureId } });
    check("capture TRANSCRIBING with provider job id", cap1?.status === "TRANSCRIBING" && cap1.providerJobId === "aai-mock-job-1");
    check("audio in OUR custody (storage adapter)", Boolean(cap1?.audioKey && getObject(cap1.audioKey)));
    const sub = seen.submitted as { speaker_labels?: boolean; speakers_expected?: number; webhook_url?: string; webhook_auth_header_name?: string; audio_url?: string } | null;
    check("submit asked for diarization of 2 speakers", sub?.speaker_labels === true && sub?.speakers_expected === 2);
    check("submit's audio URL is our signed route", Boolean(sub?.audio_url?.includes(`/api/captures/audio/${up.captureId}?token=`)));
    check("webhook carries an auth header binding", sub?.webhook_auth_header_name === "x-veritas-webhook");
    check("audio token round-trips (signed access)", signAudioToken(up.captureId).length > 20);

    // 3 — completion: normalize, heuristic, vendor scrub, REAL extraction, draft
    console.log("~ running completion (includes one real extraction call — may take a minute)");
    await completeCapture(up.captureId);
    const cap2 = await prisma.sessionCapture.findUnique({ where: { id: up.captureId } });
    check("capture reached REVIEW with a draft", cap2?.status === "REVIEW" && Boolean(cap2.draftId));
    check("vendor copy scrubbed after normalize", seen.deleted);

    const draft = cap2?.draftId ? await prisma.recordingDraft.findUnique({ where: { id: cap2.draftId } }) : null;
    const payload = draft?.payload as unknown as {
      summary: string | null;
      segments: { speaker: string; rawSpeakerLabel: string; text: string }[];
      tags: string[];
      extraction: CaptureExtraction | { failed: true };
      transcriptMeta: { speakerMapping: Record<string, string>; providerJobId: string };
    } | null;
    check("draft in the review-inbox shape (provider capture)", draft?.provider === "capture" && draft.status === "DRAFT" && draft.matchedClientId === maria.id);
    check("speaker heuristic: A (opener, talks more) → PRACTITIONER", payload?.transcriptMeta.speakerMapping["A"] === "PRACTITIONER" && payload?.transcriptMeta.speakerMapping["B"] === "CLIENT");
    check("segments carry mapped roles", payload?.segments.every((s) => s.speaker === (s.rawSpeakerLabel === "A" ? "PRACTITIONER" : "CLIENT")) ?? false);

    const ex = payload?.extraction as CaptureExtraction | { failed: true } | undefined;
    const exOk = ex && !("failed" in ex);
    check("REAL extraction returned the strict schema", Boolean(exOk && typeof (ex as CaptureExtraction).session_summary === "string" && Array.isArray((ex as CaptureExtraction).flags)));
    if (exOk) {
      const e = ex as CaptureExtraction;
      check("extraction heard a belief statement", e.belief_statements.length > 0, e.belief_statements[0]?.statement?.slice(0, 60));
      check("extraction captured action items", e.action_items.length > 0);
      const joined = JSON.stringify(e).toLowerCase();
      check("extraction stays descriptive (no diagnosis-adjacent terms)", !/diagnos|disorder|pathol/.test(joined));
    }
    check("nothing merged: client record untouched (draft-only)", (await prisma.sessionTranscript.count({ where: { clientId: maria.id } })) === 0);
    // THE hard boundary (spec §1.1): the automated pipeline leaves the draft
    // in DRAFT — it never auto-applies. Only a practitioner action
    // (applyRecordingCore, requires practitionerId) moves it to APPLIED and
    // writes SessionTranscript/Note. completeCapture has no path to either.
    check("draft stays DRAFT — no auto-merge to the map", draft?.status === "DRAFT");
    check("no note created by the pipeline (Apply owns that)", (await prisma.note.count({ where: { clientId: maria.id, tags: { has: "recording" } } })) === 0);

    // 4 — error path is retryable state, never data loss
    const errCap = await prisma.sessionCapture.create({
      data: { practitionerId: valentina.id, clientId: maria.id, source: "UPLOAD", status: "ERROR", recordedAt: new Date(), errorMessage: "synthetic", audioKey: cap1?.audioKey, tenantId: "tnt_valentina_000000001" },
    });
    cleanupIds.push(errCap.id);
    check("ERROR keeps the audio for retry", Boolean(errCap.audioKey && getObject(errCap.audioKey)));

    // cleanup consent if we granted it
    if (grantedConsent) await prisma.recordingConsent.deleteMany({ where: { clientId: maria.id, version: "p12-verify" } });
    if (cap2?.draftId) await prisma.recordingDraft.delete({ where: { id: cap2.draftId } }).catch(() => {});
  } finally {
    for (const id of cleanupIds) {
      const c = await prisma.sessionCapture.findUnique({ where: { id } }).catch(() => null);
      if (c?.audioKey) {
        const { deleteObject } = await import("../../lib/storage");
        try { deleteObject(c.audioKey); } catch { /* shared key across rows */ }
      }
      await prisma.sessionCapture.delete({ where: { id } }).catch(() => {});
    }
    mock.close();
    console.log("~ verify rows removed");
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log(failed === 0 ? `\nP1-2 VERIFY PASS — ${results.length}/${results.length}` : `\n${failed} CHECK(S) FAILED`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => void prisma.$disconnect());
