import { spawn, execSync, type ChildProcess } from "child_process";
import { deflateSync } from "zlib";
import bcrypt from "bcryptjs";
import { rawPrisma as prisma } from "../../lib/prisma-internal";

// C20 v3.1 acceptance (install spec §5):
//   1. counsel's master installs VERBATIM as DRAFT, v3.0 markers intact;
//      preview resolves live merge vars (highlighted) and shows unresolved
//      SOW-only vars plainly; send paths refuse while DRAFT
//   2. all 9 initials + Exhibit B checkbox captured + attributed; the
//      sealed PDF carries them and the frozen Key Terms table
//   3. booking gate blocks the unsigned required doc, releases on completion
//   4. Addendum P election REALLY changes Pattern-Library inclusion
//      (opt one client out → the k-count drops below floor); Addendum R
//      value flows to the client-facing schedule note; under-18 intake blocks
// Self-cleaning.
//
//   npm run build
//   DATABASE_URL=...scratch npx tsx audits/agreements/v31-verify.ts

const APP_PORT = 3123;
const BASE = `http://localhost:${APP_PORT}`;
const TENANT = "tnt_valentina_000000001";
const PROBE_LABEL = "V31 Probe Pattern";

const results: { name: string; pass: boolean; note?: string }[] = [];
function check(name: string, pass: boolean, note?: string) {
  results.push({ name, pass, note });
  console.log(`- ${pass ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
}

// A real (tiny) RGBA PNG, the same shape the DrawPad canvas emits — a wine
// squiggle on transparency — so the embed path is proven on actual bytes.
function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const head = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  head.copy(out, 4);
  out.writeUInt32BE(crc32(head), 8 + data.length);
  return out;
}
function makeSigPng(w = 40, h = 12): string {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    const row = y * (w * 4 + 1);
    for (let x = 0; x < w; x++) {
      const p = row + 1 + x * 4;
      const on = Math.abs(y - (h / 2 + 3 * Math.sin(x / 3))) < 1.5;
      raw[p] = 0x58;
      raw[p + 1] = 0x11;
      raw[p + 2] = 0x22;
      raw[p + 3] = on ? 255 : 0;
    }
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

async function cleanup() {
  await prisma.agreementEvent.deleteMany({}).catch(() => {});
  await prisma.agreement.deleteMany({}).catch(() => {});
  await prisma.agreementTemplate.deleteMany({ where: { slug: { in: ["client-services-agreement", "v31-fill-probe"] } } }).catch(() => {});
  await prisma.patternElection.deleteMany({}).catch(() => {});
  await prisma.patternLink.deleteMany({}).catch(() => {});
  await prisma.patternArchetype.deleteMany({ where: { label: PROBE_LABEL } }).catch(() => {});
  const probes = await prisma.user.findMany({ where: { email: { startsWith: "v31-probe" } } }).catch(() => []);
  for (const p of probes) {
    await prisma.psycheNode.deleteMany({ where: { clientId: p.id } }).catch(() => {});
    await prisma.intakeAnswer.deleteMany({ where: { flow: { clientId: p.id } } }).catch(() => {});
    await prisma.intakeFlow.deleteMany({ where: { clientId: p.id } }).catch(() => {});
    await prisma.activityEvent.deleteMany({ where: { clientId: p.id } }).catch(() => {});
    await prisma.consentGrant.deleteMany({ where: { userId: p.id } }).catch(() => {});
    await prisma.clientProfile.deleteMany({ where: { userId: p.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: p.id } }).catch(() => {});
  }
}

async function signIn(email: string): Promise<string> {
  const jar = new Map<string, string>();
  const absorb = (sc: string[]) => {
    for (const c of sc) {
      const [pair] = c.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  };
  const cookie = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  absorb(csrfRes.headers.getSetCookie?.() ?? []);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookie() },
    body: new URLSearchParams({ csrfToken, email, password: "fixture-pass-1" }),
    redirect: "manual",
  });
  absorb(res.headers.getSetCookie?.() ?? []);
  return cookie();
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL required (scratch copy)");
  if (/railway|rlwy\.net/.test(url)) throw new Error("Refusing to run against a Railway database");
  process.env.AUDIO_STORAGE_DIR = process.env.AUDIO_STORAGE_DIR || "/tmp/claude-0/c20-store";
  await cleanup();

  const maria = await prisma.user.findUnique({ where: { email: "maria@fixture.test" } });
  if (!maria) throw new Error("seed the scratch DB first");
  const priorLibSetting = await prisma.practiceSetting.findFirst({ where: { key: "patternLibraryEnabled" } });

  const server: ChildProcess = spawn("node_modules/.bin/next", ["start", "-p", String(APP_PORT)], {
    env: { ...process.env, AUTH_SECRET: process.env.AUTH_SECRET || "baseline-secret", PORT: String(APP_PORT) },
    stdio: "ignore",
  });
  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* booting */ }
      await new Promise((r) => setTimeout(r, 1000));
    }

    const { installMasterV31, V31_INITIAL_ITEMS } = await import("../../lib/agreements/install-v31");
    const AG = await import("../../lib/agreements");
    const { sealIfComplete } = await import("../../lib/agreements/seal");

    // ---- 1. Install: verbatim, DRAFT, markers intact ----
    const { readFileSync } = await import("fs");
    const fileBody = readFileSync("content/agreements/client-services-agreement.v3.1.txt", "utf8");
    const inst = await installMasterV31(TENANT);
    const tpl = await prisma.agreementTemplate.findFirst({ where: { id: inst.templateId } });
    check("installed as DRAFT v3.1 with countersign + booking gate", tpl?.status === "DRAFT" && tpl.versionLabel === "3.1" && tpl.requiresCountersign && tpl.requireBeforeBooking);
    check("body is counsel's text VERBATIM (byte-equal to the repo file)", tpl?.body === fileBody);
    check("v3.0 continuation markers intact (never reconstructed)", Boolean(tpl?.body.includes("[Sections 9-13 continue unchanged from original...]") && tpl.body.includes("[Addenda R and P continue unchanged from original]")));
    check("idempotent re-install", (await installMasterV31(TENANT)).installed === false);

    // ---- 2. DRAFT: preview resolves live vars; send refuses ----
    const preview = await AG.previewAgreement({ tenantId: TENANT, templateId: tpl!.id, clientId: maria.id, mark: true, merge: { package_name: "Deep Season", price: "$1,200.00", session_count: "12" } });
    check("preview resolves live policy vars (boundary + fee from config)", preview.ok === true && preview.body.includes("⟦24⟧") && /⟦\$\d+\.\d\d⟧ fee/.test(preview.body));
    check("SOW-only vars stay visibly unresolved (no data source)", preview.ok === true && preview.body.includes("{{late_cancellation_credit_treatment}}"));
    check("preview is marked DRAFT with key terms", preview.ok === true && preview.draft === true && preview.keyTerms.some(([l, v]) => l === "Package" && v === "Deep Season"));
    const refuse = await AG.createAndSendAgreement({ tenantId: TENANT, templateId: tpl!.id, clientId: maria.id });
    check("send REFUSED while DRAFT", !refuse.ok && !refuse.ok && refuse.error.includes("not sendable"));

    const practCookie = await signIn("valentina@fixture.test");
    const previewPage = await fetch(`${BASE}/practitioner/agreements/preview?templateId=${tpl!.id}&clientId=${maria.id}&package_name=Deep%20Season`, { headers: { Cookie: practCookie } });
    const previewHtml = await previewPage.text();
    check(
      "preview page: DRAFT banner + highlighted merges",
      previewHtml.includes("Sending is refused until this template is released") && previewHtml.includes("<mark")
    );
    check("preview page: no send button from a draft", !previewHtml.includes("Send it"));

    // ---- 3. Released: initials + checkbox + key terms + booking gate ----
    await prisma.agreementTemplate.update({ where: { id: tpl!.id }, data: { status: "ACTIVE" } }); // Jacob's flip, simulated
    const sent = await AG.createAndSendAgreement({
      tenantId: TENANT,
      templateId: tpl!.id,
      clientId: maria.id,
      merge: { package_name: "Deep Season", price: "$1,200.00", session_count: "12", late_cancellation_credit_treatment: "credit consumed", single_session_rate: "$150.00", personalized_deliverables_and_value: "reading portfolio — $200", credit_expiration: "12 months", payer_name_or_self: "Self" },
    });
    check("released master sends", sent.ok === true);
    const agreementId = sent.ok ? sent.agreementId : "";

    const mariaCookie = await signIn("maria@fixture.test");
    const gate1 = await fetch(`${BASE}/space/schedule`, { headers: { Cookie: mariaCookie } });
    check("booking gate blocks while unsigned", (await gate1.text()).includes("before we begin"));

    const signPage = await fetch(`${BASE}/space/agreements/${agreementId}`, { headers: { Cookie: mariaCookie } });
    const signHtml = await signPage.text();
    check("sign page renders all 10 acknowledgment items", (signHtml.match(/name="ack:/g) ?? []).length === 10 && signHtml.includes("Required acknowledgments"));

    const missing = await AG.signAgreement({ agreementId, signerName: "María Reyes Fuentes", actor: "client", initials: { "non-clinical": "MR" } });
    check("signature refused when required initials are missing", !missing.ok);
    const allInitials = Object.fromEntries(V31_INITIAL_ITEMS.map((i) => [i.id, i.kind === "checkbox" ? "checked" : "MRF"]));
    const signed = await AG.signAgreement({ agreementId, signerName: "María Reyes Fuentes", drawn: makeSigPng(), ip: "203.0.113.9", agent: "v31-harness", actor: "client", initials: allInitials });
    check("signature accepted with all 10 acknowledgments", signed.ok === true);
    const row = await prisma.agreement.findFirst({ where: { id: agreementId } });
    check("acknowledgments stored with timestamps", Array.isArray(row?.initialsCaptured) && (row!.initialsCaptured as unknown[]).length === 10);

    await AG.countersignAgreement({ agreementId, name: "Valentina Vélez" });
    await sealIfComplete(agreementId);
    const sealed = await prisma.agreement.findFirst({ where: { id: agreementId } });
    check("dual-signature doc sealed", Boolean(sealed?.sealedSha256));
    const pdfRes = await fetch(`${BASE}/api/agreements/${agreementId}/pdf`, { headers: { Cookie: mariaCookie } });
    const pdfText = Buffer.from(await pdfRes.arrayBuffer()).toString("latin1");
    check("sealed PDF: KEY TERMS frozen + INITIALED ACKNOWLEDGMENTS + initials", pdfText.includes("KEY TERMS") && pdfText.includes("Deep Season") && pdfText.includes("INITIALED ACKNOWLEDGMENTS") && pdfText.includes("[MRF]"));
    check(
      "drawn signature mark EMBEDDED as a real image (not just a note)",
      pdfText.includes("/Subtype /Image") && pdfText.includes("/Sig1 Do") && !pdfText.includes("stored with this record")
    );
    const auditStream = pdfText.split("endstream").find((s) => s.includes("(AUDIT CERTIFICATE)"));
    check(
      "audit certificate starts on its own final page",
      Boolean(auditStream && !auditStream.includes("(SIGNATURES)") && !auditStream.includes("ELECTRONIC RECORDS DISCLOSURE"))
    );

    const gate2 = await fetch(`${BASE}/space/schedule`, { headers: { Cookie: mariaCookie } });
    check("booking gate releases on completed signatures", !(await gate2.text()).includes("before we begin"));

    // retention note on the client's settings (she now has an agreement)
    const settings = await fetch(`${BASE}/space/settings`, { headers: { Cookie: mariaCookie } });
    check("Addendum R schedule note flows from the ONE config source", (await settings.text()).includes("retained for 3 years"));

    // ---- 3b. Fillable fields: inline {{fill:*}} inputs, capture,
    //          substitution into the sealed document ----
    const fillTpl = await prisma.agreementTemplate.create({
      data: {
        tenantId: TENANT,
        slug: "v31-fill-probe",
        version: 1,
        locale: "en",
        title: "Fill Probe Agreement",
        body: "Emergency contact: {{fill:emergency_contact}}.\n\nThe client agrees to the terms above.",
        status: "ACTIVE",
        requiresCountersign: false,
        placeholder: false,
        initialItems: [
          { id: "emergency_contact", text: "Emergency contact name & phone", kind: "text", required: true },
          { id: "notes", text: "Anything your practitioner should know", kind: "text", required: true, multiline: true },
          { id: "fill-ack", text: "I confirm the information I entered is accurate.", kind: "initials", required: true },
        ],
      },
    });
    const fillSent = await AG.createAndSendAgreement({ tenantId: TENANT, templateId: fillTpl.id, clientId: maria.id });
    const fillId = fillSent.ok ? fillSent.agreementId : "";
    check("fillable-template sends", fillSent.ok === true);
    const fillPage = await fetch(`${BASE}/space/agreements/${fillId}`, { headers: { Cookie: mariaCookie } });
    const fillHtml = await fillPage.text();
    check(
      "sign page: inline field rendered IN the document + standalone multiline field",
      fillHtml.includes(`name="fill:emergency_contact"`) && fillHtml.includes(`form="agreement-sign-form"`) && /<textarea[^>]*name="fill:notes"/.test(fillHtml)
    );
    const fillMissing = await AG.signAgreement({ agreementId: fillId, signerName: "María Reyes Fuentes", actor: "client", initials: { "fill-ack": "MRF", notes: "Prefers mornings." } });
    check("signature refused when a required fillable field is empty", !fillMissing.ok);
    const fillSigned = await AG.signAgreement({
      agreementId: fillId,
      signerName: "María Reyes Fuentes",
      drawn: makeSigPng(),
      actor: "client",
      initials: { emergency_contact: "Rosa Fuentes — 407-555-0188", notes: "Prefers mornings.", "fill-ack": "MRF" },
    });
    check("signature accepted with completed fields", fillSigned.ok === true);
    await sealIfComplete(fillId);
    const fillPdfRes = await fetch(`${BASE}/api/agreements/${fillId}/pdf`, { headers: { Cookie: mariaCookie } });
    const fillPdfText = Buffer.from(await fillPdfRes.arrayBuffer()).toString("latin1");
    check(
      "filled values substituted into the sealed document + attributed section",
      fillPdfText.includes("Rosa Fuentes - 407-555-0188") && !fillPdfText.includes("{{fill:emergency_contact}}") && fillPdfText.includes("CLIENT-COMPLETED FIELDS") && fillPdfText.includes("Prefers mornings.")
    );

    // ---- 4. Addendum P: the election really changes the aggregation ----
    const { aggregatePatterns, setPatternElection, K_FLOOR } = await import("../../lib/pattern-library");
    await prisma.practiceSetting.upsert({
      where: { tenantId_key: { tenantId: TENANT, key: "patternLibraryEnabled" } },
      create: { tenantId: TENANT, key: "patternLibraryEnabled", value: "true" },
      update: { value: "true" },
    });
    const probeClients: string[] = [];
    for (let i = 0; i < K_FLOOR; i++) {
      const u = await prisma.user.create({
        data: { email: `v31-probe-${i}@fixture.test`, name: `Probe ${i}`, role: "CLIENT", active: true, tenantId: TENANT, passwordHash: bcrypt.hashSync("fixture-pass-1", 10) },
      });
      probeClients.push(u.id);
      await prisma.psycheNode.create({
        data: { tenantId: TENANT, clientId: u.id, kind: "PATTERN", label: PROBE_LABEL, source: "PRACTITIONER", state: "ACTIVE", evidenceRecordItemIds: [] },
      });
    }
    await aggregatePatterns();
    const before = await prisma.patternArchetype.findFirst({ where: { label: PROBE_LABEL } });
    check(`probe archetype clears the k-floor with ${K_FLOOR} participants`, before?.clientCount === K_FLOOR);
    await setPatternElection(probeClients[0], false, TENANT);
    await aggregatePatterns();
    const after = await prisma.patternArchetype.findFirst({ where: { label: PROBE_LABEL } });
    check("opting ONE client out drops the count below the floor", after?.clientCount === K_FLOOR - 1 && (after?.clientCount ?? 99) < K_FLOOR);

    // ---- 5. Addendum M: under-18 intake blocks, notifies, loses nothing ----
    const minor = await prisma.user.create({
      data: { email: "v31-probe-minor@fixture.test", name: "Minor Probe", role: "CLIENT", active: true, tenantId: TENANT, passwordHash: bcrypt.hashSync("fixture-pass-1", 10) },
    });
    await prisma.consentGrant.create({ data: { tenantId: TENANT, userId: minor.id, version: "2026-07" } });
    const { startFlow, saveAnswer } = await import("../../lib/intake/engine");
    const flow = await startFlow(minor.id);
    const minorDob = `${new Date().getFullYear() - 15}-05-15`;
    await saveAnswer({ flowId: flow.id, fieldKey: "birth.date", value: minorDob, questionText: "Date of birth" });
    const { completeIntake } = await import("../../lib/intake/complete");
    const blocked = await completeIntake(flow.id);
    check("under-18 completion returns the guardian block", blocked !== null && "blocked" in blocked && blocked.blocked === "minor");
    const flowAfter = await prisma.intakeFlow.findFirst({ where: { id: flow.id } });
    check("flow stays IN_PROGRESS (nothing lost)", flowAfter?.status === "IN_PROGRESS");
    check("practitioner notified via event", (await prisma.activityEvent.count({ where: { clientId: minor.id, eventKey: "intake.minor_blocked" } })) === 1);
  } finally {
    server.kill();
    // restore the practice-level switch exactly as found
    if (priorLibSetting) {
      await prisma.practiceSetting.upsert({
        where: { tenantId_key: { tenantId: TENANT, key: "patternLibraryEnabled" } },
        create: { tenantId: TENANT, key: "patternLibraryEnabled", value: priorLibSetting.value },
        update: { value: priorLibSetting.value },
      }).catch(() => {});
    } else {
      await prisma.practiceSetting.deleteMany({ where: { key: "patternLibraryEnabled" } }).catch(() => {});
    }
    await cleanup();
    console.log("~ probe rows removed, settings restored");
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log(failed === 0 ? `\nV3.1 VERIFY PASS — ${results.length}/${results.length}` : `\n${failed} CHECK(S) FAILED`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => {
    void prisma.$disconnect();
    try { execSync(`pkill -f "next start -p ${APP_PORT}"`); } catch { /* none */ }
  });
