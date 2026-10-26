// C38-B — TRANSCRIPTION WEBHOOK ATTRIBUTION (ruling 238).
//
// PROVES, with a positive control for every absence (ruling 110):
//   1. correct payload -> correct tenant: a capture in tenant A completes into
//      tenant A's draft.
//   2. the same route never touches another tenant: tenant B's draft count is
//      unchanged by A's webhook; positive control — B's own capture id creates
//      B's draft.
//   3. unknown captureId -> dropped and logged, not guessed: 200, zero drafts.
//   4. THE HOST IS IGNORED: the identical payload sent with tenant B's Host
//      still lands in tenant A. Before ruling 238 the scoped client would have
//      scoped it to B (lib/prisma.ts:124-125).
//
// SCOPE is printed at the top of every run (ruling 208).
//
//   DATABASE_URL=...scratch npx tsx audits/m2m/transcription-verify.ts
import { spawn, execSync, type ChildProcess } from "child_process";
import { createServer, type Server } from "http";
import { mkdirSync, writeFileSync } from "fs";
import bcrypt from "bcryptjs";
import { rawPrisma } from "../../lib/prisma-internal";
import { signAudioToken } from "../../lib/storage";

const PORT = 3150;
const MOCK_PORT = 3151;
const BASE = `http://127.0.0.1:${PORT}`;
const A = "c38b-tenant-a", B = "c38b-tenant-b";
const HOST_A = "a.m2m.test", HOST_B = "b.m2m.test";

const UTTERANCES = [
  { speaker: "A", text: "Welcome back. Last time we talked about the promotion — where would you like to begin today?", start: 0, end: 9000, confidence: 0.98 },
  { speaker: "B", text: "The promotion, still. I keep thinking I am not someone who leads. It feels like a fact, not a thought.", start: 9200, end: 21000, confidence: 0.97 },
  { speaker: "A", text: "Say more about where that shows up during the week — at work, or before work, in the mornings?", start: 21500, end: 31000, confidence: 0.98 },
  { speaker: "B", text: "Mornings mostly. I said I would draft the proposal this week and I still have not opened the document.", start: 31200, end: 41000, confidence: 0.96 },
  { speaker: "A", text: "Alright. Before next session, you will open it once — just open it, nothing more. And I will send you the reflection prompt we discussed. We can look at what happens in the opening moment together.", start: 41500, end: 58000, confidence: 0.98 },
];

function mockAai(): Server {
  return createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const send = (code: number, obj: unknown) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };
      const mjob = /^\/v2\/transcript\/(job-[a-z])$/.exec(req.url ?? "");
      if (req.method === "GET" && mjob) return send(200, { id: mjob[1], status: "completed", language_code: "en", audio_duration: 58, text: UTTERANCES.map((u) => u.text).join(" "), utterances: UTTERANCES });
      if (req.method === "DELETE" && mjob) return send(200, {});
      send(404, {});
    });
  }).listen(MOCK_PORT);
}

let failed = 0;
const report: string[] = [];
const log = (s: string) => { report.push(s); console.log(s); };
const check = (name: string, ok: boolean, note = "") => { if (!ok) failed++; log(`- ${ok ? "\u2713" : "\u2717"} ${name}${note ? ` \u2014 ${note}` : ""}`); };

async function cleanup(): Promise<void> {
  for (const t of [A, B]) {
    await rawPrisma.recordingDraft.deleteMany({ where: { tenantId: t } });
    await rawPrisma.sessionCapture.deleteMany({ where: { tenantId: t } });
    await rawPrisma.user.deleteMany({ where: { tenantId: t } });
    await rawPrisma.tenantDomain.deleteMany({ where: { host: { in: [HOST_A, HOST_B] } } }).catch(() => undefined);
    await rawPrisma.tenant.deleteMany({ where: { id: t } });
  }
}

// Returns status AND the body's `note`: the route answers 200 to a dropped
// unknown id too (so the provider stops retrying), so a 200 alone cannot tell
// "attributed" from "dropped". A first draft of this gate asserted only the
// status and called a drop "accepted".
async function post(captureId: string, host: string): Promise<{ status: number; note: string | null }> {
  const r = await fetch(`${BASE}/api/webhooks/transcription?capture=${encodeURIComponent(captureId)}&token=${signAudioToken(captureId)}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-veritas-webhook": "mock-webhook-secret", "x-forwarded-host": host, host },
    body: JSON.stringify({ transcript_id: "x", status: "completed" }),
  });
  let note: string | null = null;
  try { note = ((await r.json()) as { note?: string }).note ?? null; } catch { /* */ }
  return { status: r.status, note };
}

async function main(): Promise<void> {
  log(`# C38-B transcription attribution \u2014 ${new Date().toISOString()}`);
  log(`SCOPE: hosts ${HOST_A}, ${HOST_B} · HTTP only, no browser viewport · local build on :${PORT} + mock AssemblyAI on :${MOCK_PORT}. NOT covered: production, the real provider, any route but /api/webhooks/transcription (ruling 208).`);
  await cleanup();
  const pract: Record<string, string> = {};
  for (const [id, slug, host] of [[A, "c38ba", HOST_A], [B, "c38bb", HOST_B]] as const) {
    await rawPrisma.tenant.create({ data: { id, slug, displayName: `C38B ${slug}`, status: "ACTIVE", layoutKey: "dashboard-v1", skinKey: "clinical-light", branding: {}, featureFlags: {} } });
    await rawPrisma.tenantDomain.create({ data: { host, tenantId: id } }).catch(() => undefined);
    const u = await rawPrisma.user.create({ data: { email: `p@${slug}.fixture.test`, name: "P", role: "PRACTITIONER", active: true, tenantId: id, passwordHash: bcrypt.hashSync("x", 4) } });
    pract[id] = u.id;
  }
  const capA = await rawPrisma.sessionCapture.create({ data: { tenantId: A, practitionerId: pract[A], status: "TRANSCRIBING", providerJobId: "job-a", source: "UPLOAD", recordedAt: new Date() } });
  const capB = await rawPrisma.sessionCapture.create({ data: { tenantId: B, practitionerId: pract[B], status: "TRANSCRIBING", providerJobId: "job-b", source: "UPLOAD", recordedAt: new Date() } });

  try { execSync(`fuser -k ${PORT}/tcp ${MOCK_PORT}/tcp 2>/dev/null || true`, { stdio: "ignore" }); } catch { /* */ }
  const mock = mockAai();
  // SET IN THIS PROCESS FIRST, then inherited by the server: signAudioToken()
  // runs here and verifyAudioToken() runs there, and both derive from
  // AUTH_SECRET (lib/storage.ts:51). A first draft set the server's only, and
  // every valid token came back 403 — the instrument, not the route.
  process.env.AUTH_SECRET ||= "gate-secret";
  process.env.ASSEMBLYAI_BASE_URL = `http://localhost:${MOCK_PORT}`;
  process.env.ASSEMBLYAI_API_KEY = "mock-key";
  process.env.TRANSCRIPTION_WEBHOOK_SECRET = "mock-webhook-secret";
  process.env.AUDIO_STORAGE_DIR = "/tmp/claude-0/-home-user-valentinaapp/6622a446-2360-54fb-9af9-84a1352e1cd0/scratchpad/c38b-audio";
  process.env.ANTHROPIC_API_KEY = ""; // extraction fails closed and the draft still lands (extraction: { failed: true })
  const env = { ...process.env, PORT: String(PORT), PLATFORM_DOMAIN: "m2m.test" };
  // The server's log is EVIDENCE: the route logs why a completion failed or
  // why an id was dropped, and a gate that discards it can only say "no".
  const serverLog: string[] = [];
  const server: ChildProcess = spawn("node_modules/.bin/next", ["start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout?.on("data", (d) => serverLog.push(String(d)));
  server.stderr?.on("data", (d) => serverLog.push(String(d)));
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* */ } await new Promise((r) => setTimeout(r, 1000)); }

    log(`\n## the host is IGNORED (the check ruling 238 exists for)`);
    const s4r = await post(capA.id, HOST_B); const s4 = s4r.status;
    const a4 = await rawPrisma.sessionCapture.findUnique({ where: { id: capA.id } });
    const draftsA = await rawPrisma.recordingDraft.count({ where: { tenantId: A } });
    const draftsB = await rawPrisma.recordingDraft.count({ where: { tenantId: B } });
    check("A's capture id sent with B's Host header is accepted AND attributed (200, not a drop)", s4 === 200 && s4r.note === null, `HTTP ${s4}${s4r.note ? ` note=${s4r.note}` : ""}`);
    check("\u2026and completes into TENANT A (status REVIEW, draft in A)", a4?.status === "REVIEW" && draftsA === 1, `status=${a4?.status} draftsA=${draftsA}`);
    check("\u2026and tenant B received NOTHING from it", draftsB === 0, `draftsB=${draftsB}`);

    log(`\n## positive control \u2014 the route DOES write, for the right tenant`);
    const s2r = await post(capB.id, HOST_A); const s2 = s2r.status;
    const draftsB2 = await rawPrisma.recordingDraft.count({ where: { tenantId: B } });
    const draftsA2 = await rawPrisma.recordingDraft.count({ where: { tenantId: A } });
    check("B's capture id (sent with A's Host) completes into tenant B", s2 === 200 && s2r.note === null && draftsB2 === 1, `HTTP ${s2} draftsB=${draftsB2}${s2r.note ? ` note=${s2r.note}` : ""}`);
    check("\u2026and A's count is unchanged", draftsA2 === 1, `draftsA=${draftsA2}`);

    log(`\n## unknown captureId \u2014 dropped, not guessed`);
    const s3r = await post("c38b-no-such-capture", HOST_A); const s3 = s3r.status;
    const total = await rawPrisma.recordingDraft.count({ where: { tenantId: { in: [A, B] } } });
    check("an unknown capture id is acknowledged (200) AND says so, so the provider stops retrying", s3 === 200 && /unknown/.test(s3r.note ?? ""), `HTTP ${s3} note=${s3r.note}`);
    check("\u2026and created no draft anywhere", total === 2, `${total} drafts across A+B`);

    log(`\n## the caller checks still hold`);
    const bad = await fetch(`${BASE}/api/webhooks/transcription?capture=${capA.id}&token=nope`, { method: "POST", headers: { "x-veritas-webhook": "mock-webhook-secret", "x-forwarded-host": HOST_A } });
    check("a bad capture token is refused (403)", bad.status === 403, `HTTP ${bad.status}`);
  } finally {
    try { server.kill(); } catch { /* */ }
    try { mock.close(); } catch { /* */ }
    try { execSync(`fuser -k ${PORT}/tcp ${MOCK_PORT}/tcp 2>/dev/null || true`, { stdio: "ignore" }); } catch { /* */ }
  }
  await cleanup();
  if (failed > 0) { log(`\n## server log (the route's own account of what happened)`); for (const l of serverLog.join("").split("\n").filter((l) => /\[capture\]|error|Error/i.test(l)).slice(0, 12)) log(`    ${l}`); }
  log(`\n${failed === 0 ? "ALL CHECKS PASS" : `${failed} CHECK(S) FAILED`}`);
  mkdirSync("audits/m2m", { recursive: true });
  writeFileSync("audits/m2m/TRANSCRIPTION-LOG.md", report.join("\n") + "\n");
  await rawPrisma.$disconnect();
  if (failed > 0) process.exit(1);
}
main().catch(async (e) => { console.error(e); await cleanup().catch(() => undefined); await rawPrisma.$disconnect(); process.exit(1); });
