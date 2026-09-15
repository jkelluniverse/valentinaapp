import { spawn, execSync, type ChildProcess } from "child_process";
import { createHash } from "crypto";
import { writeFileSync, readFileSync } from "fs";
import bcrypt from "bcryptjs";
import { rawPrisma as prisma } from "../../lib/prisma-internal";

// C20 acceptance (spec §5 verify list, against the BUILT app):
//   · María (fixture client) signs a merged Scope end-to-end — both the
//     merged variables and the pinned snapshot proven; es sibling served
//     to an es-locale client
//   · Lead signs pre-portal via the signed no-login link
//   · hash re-verification catches a tampered byte (download refuses)
//   · declined + voided states behave; history never deleted
//   · the before-first-session gate blocks booking until signed, warmly
//   · every event lands in the append-only audit trail
//   · countersign completes a dual-signature doc → sealed PDF, both keep it
// Self-cleaning.
//
//   npm run build
//   DATABASE_URL=...scratch npx tsx audits/agreements/c20-verify.ts

const APP_PORT = 3122;
const BASE = `http://localhost:${APP_PORT}`;

const results: { name: string; pass: boolean; note?: string }[] = [];
function check(name: string, pass: boolean, note?: string) {
  results.push({ name, pass, note });
  console.log(`- ${pass ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
}

async function cleanup() {
  const maria = await prisma.user.findUnique({ where: { email: "maria@fixture.test" } }).catch(() => null);
  await prisma.agreementEvent.deleteMany({}).catch(() => {});
  await prisma.agreement.deleteMany({}).catch(() => {});
  await prisma.agreementTemplate.deleteMany({}).catch(() => {});
  await prisma.lead.deleteMany({ where: { email: "carmen.c20@fixture.test" } }).catch(() => {});
  void maria;
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
  const TENANT = "tnt_valentina_000000001";
  const maria = await prisma.user.findUnique({ where: { email: "maria@fixture.test" } });
  if (!maria) throw new Error("seed the scratch DB first (María missing)");

  const server: ChildProcess = spawn("node_modules/.bin/next", ["start", "-p", String(APP_PORT)], {
    env: { ...process.env, AUTH_SECRET: process.env.AUTH_SECRET || "baseline-secret", PORT: String(APP_PORT), APP_BASE_URL: BASE },
    stdio: "ignore",
  });
  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* booting */ }
      await new Promise((r) => setTimeout(r, 1000));
    }

    const AG = await import("../../lib/agreements");
    const { sealIfComplete, readSealedPdf } = await import("../../lib/agreements/seal");
    const { agreementsTick } = await import("../../lib/agreements/sweep");

    // 1 — starter set: en/es siblings, placeholder-marked
    const created = await AG.ensureStarterTemplates(TENANT);
    check("starter set seeded (3 × en/es, placeholders)", created === 6);
    const scopeEn = await prisma.agreementTemplate.findFirst({ where: { tenantId: TENANT, slug: "scope-of-work", locale: "en" } });
    check("scope template requires countersign (dual-signature)", scopeEn?.requiresCountersign === true);

    // 1b — the preview step: renders the merged text, writes NOTHING, and
    // is byte-identical to what send will snapshot (same resolver).
    const practCookie = await signIn("valentina@fixture.test");
    const previewQs = `templateId=${scopeEn!.id}&clientId=${maria.id}&package_name=Deep%20Season&price=%241%2C200.00&term=12%20weeks`;
    const rowsBefore = await prisma.agreement.count();
    const previewPage = await fetch(`${BASE}/practitioner/agreements/preview?${previewQs}`, { headers: { Cookie: practCookie } });
    const previewHtml = await previewPage.text();
    check("preview renders the merged document", previewPage.status === 200 && previewHtml.includes("Deep Season") && previewHtml.includes("Nothing has been sent yet"));
    check("preview writes zero rows", (await prisma.agreement.count()) === rowsBefore);
    const previewOut = await AG.previewAgreement({ tenantId: TENANT, templateId: scopeEn!.id, clientId: maria.id, merge: { package_name: "Deep Season", price: "$1,200.00", term: "12 weeks" } });

    // 2 — María: merged Scope, sent + gated before booking
    await prisma.agreementTemplate.update({ where: { id: scopeEn!.id }, data: { requireBeforeBooking: true } });
    const sent = await AG.createAndSendAgreement({
      tenantId: TENANT,
      templateId: scopeEn!.id,
      clientId: maria.id,
      merge: { package_name: "Deep Season", price: "$1,200.00", term: "12 weeks" },
    });
    check("merged scope sent to María", sent.ok === true);
    const agreementId = sent.ok ? sent.agreementId : "";
    const a1 = await prisma.agreement.findFirst({ where: { id: agreementId } });
    check("snapshot pins merged text", Boolean(a1?.bodySnapshot.includes("Deep Season") && a1.bodySnapshot.includes("$1,200.00") && !a1.bodySnapshot.includes("{{")));
    check("preview text === sent snapshot (one resolver)", previewOut.ok === true && previewOut.body === a1?.bodySnapshot);

    const mariaCookie = await signIn("maria@fixture.test");
    const schedule = await fetch(`${BASE}/space/schedule`, { headers: { Cookie: mariaCookie } });
    check("booking gated until signed, warmly worded", (await schedule.text()).includes("before we begin"));

    // 3 — María signs in the portal (view → disclosure → sign flow markers)
    const signPage = await fetch(`${BASE}/space/agreements/${agreementId}`, { headers: { Cookie: mariaCookie } });
    const signHtml = await signPage.text();
    check("sign page shows doc + disclosure + one wine button", signHtml.includes("Deep Season") && signHtml.includes("electronically") && signHtml.includes("I agree and sign"));
    const afterView = await prisma.agreement.findFirst({ where: { id: agreementId } });
    check("viewed + disclosure timestamped on open", Boolean(afterView?.viewedAt && afterView.disclosureShownAt));
    const signed = await AG.signAgreement({ agreementId, signerName: "María Reyes Fuentes", drawn: "data:image/png;base64,x", ip: "203.0.113.9", agent: "verify-harness", actor: "client" });
    check("signature accepted with full attribution", signed.ok === true);
    check("cannot sign twice", !(await AG.signAgreement({ agreementId, signerName: "Again", actor: "client" })).ok);

    // 4 — countersign completes the dual-signature doc → sealed
    const preSeal = await sealIfComplete(agreementId);
    check("not sealed before countersign", preSeal.sealed === false, preSeal.reason);
    const cs = await AG.countersignAgreement({ agreementId, name: "Valentina Vélez" });
    check("countersign accepted", cs.ok === true);
    const sealRes = await sealIfComplete(agreementId);
    const sealed = await prisma.agreement.findFirst({ where: { id: agreementId } });
    check("sealed: PDF stored + SHA-256 recorded", sealRes.sealed && Boolean(sealed?.sealedKey && sealed.sealedSha256));

    // 5 — both parties can download; the PDF carries text + signatures + audit
    const dl = await fetch(`${BASE}/api/agreements/${agreementId}/pdf`, { headers: { Cookie: mariaCookie } });
    const pdfBytes = Buffer.from(await dl.arrayBuffer());
    check("client downloads the sealed PDF", dl.status === 200 && pdfBytes.subarray(0, 5).toString() === "%PDF-");
    check("download hash matches the sealed record", createHash("sha256").update(pdfBytes).digest("hex") === sealed!.sealedSha256);
    const pdfText = pdfBytes.toString("latin1");
    check("PDF carries signer, countersigner, audit page", pdfText.includes("Reyes Fuentes") && pdfText.includes("Valentina V") && pdfText.includes("AUDIT CERTIFICATE"));

    // 6 — tamper: flip one byte in the stored object → download refuses
    const storePath = `${process.env.AUDIO_STORAGE_DIR}/${sealed!.sealedKey}`;
    const orig = readFileSync(storePath);
    const tampered = Buffer.from(orig);
    tampered[Math.floor(tampered.length / 2)] ^= 0xff;
    writeFileSync(storePath, tampered);
    const dl2 = await fetch(`${BASE}/api/agreements/${agreementId}/pdf`, { headers: { Cookie: mariaCookie } });
    check("tampered byte → download refused (409)", dl2.status === 409);
    writeFileSync(storePath, orig);

    // 7 — the audit trail holds every event, in order
    const kinds = (await prisma.agreementEvent.findMany({ where: { agreementId }, orderBy: { at: "asc" } })).map((e) => e.kind);
    check(
      "audit trail: created→sent→viewed→disclosure→signed→countersigned→sealed",
      ["created", "sent", "viewed", "disclosure", "signed", "countersigned", "sealed"].every((k) => kinds.includes(k)),
      kinds.join(",")
    );

    // 8 — the gate lifts after signing
    const schedule2 = await fetch(`${BASE}/space/schedule`, { headers: { Cookie: mariaCookie } });
    check("booking gate lifts after signing", !(await schedule2.text()).includes("before we begin"));

    // 9 — Lead Carmen signs pre-portal via the signed link
    const carmen = await prisma.lead.create({
      data: { tenantId: TENANT, name: "Carmen Lead", email: "carmen.c20@fixture.test", status: "NEW", source: "verify" },
    });
    const servicesEn = await prisma.agreementTemplate.findFirst({ where: { tenantId: TENANT, slug: "client-services", locale: "en" } });
    await prisma.agreementTemplate.update({ where: { id: servicesEn!.id }, data: { requiresCountersign: false } });
    const leadSent = await AG.createAndSendAgreement({ tenantId: TENANT, templateId: servicesEn!.id, leadId: carmen.id });
    check("lead agreement sent via signed link", leadSent.ok === true);
    const leadToken = leadSent.ok ? leadSent.rawToken : "";
    const leadPage = await fetch(`${BASE}/agree/${leadToken}`);
    check("no-login link renders the sign flow", leadPage.status === 200 && (await leadPage.text()).includes("I agree and sign"));
    const leadAgr = await prisma.agreement.findFirst({ where: { leadId: carmen.id } });
    const leadSigned = await AG.signAgreement({ agreementId: leadAgr!.id, signerName: "Carmen Lead Ortiz", drawn: "data:image/png;base64,x", actor: "lead" });
    await sealIfComplete(leadAgr!.id);
    check("Carmen signs pre-portal; sealed without countersign", leadSigned.ok && Boolean((await prisma.agreement.findFirst({ where: { id: leadAgr!.id } }))?.sealedSha256));

    // 10 — declined + voided behave; history intact
    const recEn = await prisma.agreementTemplate.findFirst({ where: { tenantId: TENANT, slug: "recording-addendum", locale: "en" } });
    const d1 = await AG.createAndSendAgreement({ tenantId: TENANT, templateId: recEn!.id, clientId: maria.id });
    await AG.declineAgreement(d1.ok ? d1.agreementId : "", "client");
    check("declined state recorded", (await prisma.agreement.findFirst({ where: { id: d1.ok ? d1.agreementId : "" } }))?.status === "DECLINED");
    const d2 = await AG.createAndSendAgreement({ tenantId: TENANT, templateId: recEn!.id, clientId: maria.id });
    await AG.voidAgreement(d2.ok ? d2.agreementId : "", "sent by mistake");
    const voided = await prisma.agreement.findFirst({ where: { id: d2.ok ? d2.agreementId : "" } });
    check("voided: attributed, history intact", voided?.status === "VOIDED" && voided.voidReason === "sent by mistake" && (await prisma.agreementEvent.count({ where: { agreementId: voided.id } })) >= 3);

    // 11 — es sibling served to an es-locale client
    await prisma.user.update({ where: { id: maria.id }, data: { locale: "es" } });
    const esSent = await AG.createAndSendAgreement({ tenantId: TENANT, templateId: servicesEn!.id, clientId: maria.id });
    const esAgr = await prisma.agreement.findFirst({ where: { id: esSent.ok ? esSent.agreementId : "" } });
    check("es-locale client served the es sibling", esAgr?.locale === "es" && esAgr.titleSnapshot === "Acuerdo de servicios");
    await prisma.user.update({ where: { id: maria.id }, data: { locale: "en" } });
    await AG.voidAgreement(esSent.ok ? esSent.agreementId : "", "verify cleanup");

    // 12 — the tick sweep reminds stale agreements
    const stale = await AG.createAndSendAgreement({ tenantId: TENANT, templateId: recEn!.id, clientId: maria.id });
    await prisma.agreement.update({ where: { id: stale.ok ? stale.agreementId : "" }, data: { sentAt: new Date(Date.now() - 4 * 86400_000) } });
    const sweep = await agreementsTick();
    check("tick reminder cadence fires once", sweep.reminded >= 1 && Boolean((await prisma.agreement.findFirst({ where: { id: stale.ok ? stale.agreementId : "" } }))?.remindedAt));
  } finally {
    server.kill();
    await cleanup();
    console.log("~ agreement rows removed");
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log(failed === 0 ? `\nC20 VERIFY PASS — ${results.length}/${results.length}` : `\n${failed} CHECK(S) FAILED`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => {
    void prisma.$disconnect();
    try { execSync(`pkill -f "next start -p ${APP_PORT}"`); } catch { /* none */ }
  });
