import { spawn, execSync, type ChildProcess } from "child_process";
import { createHash } from "crypto";
import { readFileSync } from "fs";
import { deflateSync } from "zlib";
import { rawPrisma as prisma } from "../../lib/prisma-internal";

// C21-DOCSIGN acceptance:
//   1. dispute packet installs (2 fillable TEXT + 2 branded-PDF FILES
//      templates), verbatim files by hash, idempotent
//   2. one-off sends to ANY email — no enrollment; the /agree token page
//      renders inline fillable fields + attached documents; signing with
//      fills + drawn mark seals; the sealed copy downloads by token
//   3. file route: token-authorized, 403 without, 409 on tampered bytes
//   4. stored practitioner signature auto-applies on countersign (Sig2 on
//      the sealed PDF) and on self-sign; auto-dated by the timestamps
//   5. self-sign refuses dual-signature templates
//   6. desk browser (shelves + grid/list), Portrait agreements tab, nav
// Self-cleaning.
//
//   npm run build
//   DATABASE_URL=...scratch npx tsx audits/agreements/c21-verify.ts

const APP_PORT = 3124;
const BASE = `http://localhost:${APP_PORT}`;
const TENANT = "tnt_valentina_000000001";

const results: { name: string; pass: boolean; note?: string }[] = [];
function check(name: string, pass: boolean, note?: string) {
  results.push({ name, pass, note });
  console.log(`- ${pass ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
}

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
function makeSigPng(): string {
  const w = 40, h = 12;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(h * (w * 4 + 1));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * (w * 4 + 1) + 1 + x * 4;
      raw[p] = 0x58;
      raw[p + 1] = 0x11;
      raw[p + 2] = 0x22;
      raw[p + 3] = Math.abs(y - (h / 2 + 3 * Math.sin(x / 3))) < 1.5 ? 255 : 0;
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

const PACKET_SLUGS = ["client-declaration", "family-services-memorandum", "session-recording-log", "square-dispute-narrative", "c21-upload-probe", "payment-authorization-es"];

async function cleanup() {
  await prisma.agreementEvent.deleteMany({}).catch(() => {});
  await prisma.agreementFile.deleteMany({}).catch(() => {});
  await prisma.agreement.deleteMany({}).catch(() => {});
  await prisma.agreementTemplate.deleteMany({ where: { slug: { in: PACKET_SLUGS } } }).catch(() => {});
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
  const priorSig = await prisma.practiceSetting.findUnique({ where: { key: "practitionerSignatureDrawn" } });

  const server: ChildProcess = spawn("node_modules/.bin/next", ["start", "-p", String(APP_PORT)], {
    env: { ...process.env, AUTH_SECRET: process.env.AUTH_SECRET || "baseline-secret", PORT: String(APP_PORT) },
    stdio: "ignore",
  });
  try {
    for (let i = 0; i < 60; i++) {
      try { if ((await fetch(`${BASE}/api/health`)).ok) break; } catch { /* booting */ }
      await new Promise((r) => setTimeout(r, 1000));
    }

    const AG = await import("../../lib/agreements");
    const { installDisputePacket, DECLARATION_SLUG, MEMORANDUM_SLUG, NARRATIVE_SLUG } = await import("../../lib/agreements/install-c21");
    const { templateFiles } = await import("../../lib/agreements/files");
    const { sealIfComplete } = await import("../../lib/agreements/seal");
    const { getObject, putObject } = await import("../../lib/storage");

    // ---- 1. Install the packet ----
    const inst = await installDisputePacket(TENANT);
    check("dispute packet installs all four documents", inst.installed.length === 4);
    check("idempotent re-install", (await installDisputePacket(TENANT)).installed.length === 0);
    const decl = await prisma.agreementTemplate.findFirst({ where: { slug: DECLARATION_SLUG } });
    const memo = await prisma.agreementTemplate.findFirst({ where: { slug: MEMORANDUM_SLUG } });
    const narr = await prisma.agreementTemplate.findFirst({ where: { slug: NARRATIVE_SLUG } });
    check(
      "declaration: fillable TEXT template, single signature, ACTIVE",
      decl?.kind === "TEXT" && decl.status === "ACTIVE" && !decl.requiresCountersign && Array.isArray(decl.initialItems) && (decl.initialItems as unknown[]).length === 10
    );
    check("memorandum: dual-signature (client + countersign)", memo?.kind === "TEXT" && memo.requiresCountersign === true);
    const narrFiles = narr ? await templateFiles(narr.id) : [];
    const repoNarr = readFileSync("content/agreements/files/square-dispute-narrative.pdf");
    check(
      "branded PDFs attached VERBATIM (hash matches the repo file)",
      narr?.kind === "FILES" && narrFiles.length === 1 && narrFiles[0].sha256 === createHash("sha256").update(repoNarr).digest("hex")
    );

    // ---- 2. Stored practitioner signature ----
    await AG.setPractitionerSignature(makeSigPng());
    check("practitioner signature stored", (await AG.getPractitionerSignature())?.startsWith("data:image/png;base64,") === true);

    // ---- 3. One-off send to an external email (the past client) ----
    const sent = await AG.createAndSendAgreement({
      tenantId: TENANT,
      templateId: decl!.id,
      recipient: { name: "Irene Maria Meza", email: "c21-recipient@example.test" },
    });
    check("one-off send to a bare email succeeds", sent.ok === true);
    const oneOffId = sent.ok ? sent.agreementId : "";
    const rawToken = sent.ok ? sent.rawToken : "";
    const row = await prisma.agreement.findFirst({ where: { id: oneOffId } });
    check("agreement carries the recipient, no client/lead", row?.recipientEmail === "c21-recipient@example.test" && row.recipientName === "Irene Maria Meza" && !row.clientId && !row.leadId);

    const agreePage = await fetch(`${BASE}/agree/${rawToken}`);
    const agreeHtml = await agreePage.text();
    check(
      "token sign page renders inline fillable fields for the recipient",
      agreeHtml.includes(`name="fill:declarant_full_name"`) && agreeHtml.includes(`form="agreement-sign-form"`) && /<textarea[^>]*name="fill:agreement_communication"/.test(agreeHtml)
    );
    check(
      "guided signing: Next-field bar with progress renders (server-side)",
      agreeHtml.includes("data-sign-guide") && agreeHtml.includes("Next field") && agreeHtml.includes("data-sf")
    );

    const fills: Record<string, string> = {
      declarant_full_name: "Irene Maria Meza",
      enrollment_month: "December",
      child1_initials: "IBA",
      child1_age: "15",
      child2_initials: "ALM",
      child2_age: "12",
      services_start_month: "December",
      payment_agreement_month: "December",
      cardholder_full_name: "Cardholder Name",
      agreement_communication: "He agreed by message in December 2025 and sent his card.",
    };
    const missing = await AG.signAgreement({ agreementId: oneOffId, signerName: "Irene Maria Meza", actor: "recipient", initials: { declarant_full_name: "Irene Maria Meza" } });
    check("signature refused until every required field is filled", !missing.ok);
    const signed = await AG.signAgreement({ agreementId: oneOffId, signerName: "Irene Maria Meza", drawn: makeSigPng(), ip: "203.0.113.77", agent: "c21-harness", actor: "recipient", initials: fills });
    check("recipient signs with fills + drawn mark", signed.ok === true);
    await sealIfComplete(oneOffId);
    const sealedRow = await prisma.agreement.findFirst({ where: { id: oneOffId } });
    check("one-off agreement sealed", Boolean(sealedRow?.sealedSha256));

    const pdfByToken = await fetch(`${BASE}/api/agreements/${oneOffId}/pdf?token=${encodeURIComponent(rawToken)}`);
    const pdfText = Buffer.from(await pdfByToken.arrayBuffer()).toString("latin1");
    check(
      "sealed record downloads by token: filled values inline + audit page + drawn mark",
      pdfByToken.status === 200 && pdfText.includes("DECLARATION OF Irene Maria Meza") && !pdfText.includes("{{fill:declarant_full_name}}") && pdfText.includes("/Sig1 Do") && pdfText.includes("(AUDIT CERTIFICATE)")
    );
    const donePage = await fetch(`${BASE}/agree/${rawToken}`);
    check("signed token page offers the sealed copy", (await donePage.text()).includes("Download your sealed copy"));

    // ---- 4. FILES request: attachments on the token page + file route auth ----
    const memoSent = await AG.createAndSendAgreement({
      tenantId: TENANT,
      templateId: narr!.id,
      recipient: { name: "File Probe", email: "c21-files@example.test" },
    });
    const fileAgId = memoSent.ok ? memoSent.agreementId : "";
    const fileTok = memoSent.ok ? memoSent.rawToken : "";
    const frozen = await prisma.agreementFile.findMany({ where: { agreementId: fileAgId } });
    check("template files freeze onto the sent request", frozen.length === 1 && frozen[0].sha256 === narrFiles[0].sha256);
    const filePage = await fetch(`${BASE}/agree/${fileTok}`);
    check("token page lists the documents to review", (await filePage.text()).includes("Documents to review"));
    const fileOk = await fetch(`${BASE}/api/agreements/${fileAgId}/files/${frozen[0].id}?token=${encodeURIComponent(fileTok)}`);
    const fileBytes = Buffer.from(await fileOk.arrayBuffer());
    check("file route serves the exact bytes under the token", fileOk.status === 200 && createHash("sha256").update(fileBytes).digest("hex") === frozen[0].sha256);
    check("file route refuses without token or session", (await fetch(`${BASE}/api/agreements/${fileAgId}/files/${frozen[0].id}`)).status === 403);
    const goodBytes = getObject(frozen[0].key)!;
    const bad = Buffer.from(goodBytes);
    bad[100] ^= 0xff;
    putObject(frozen[0].key, bad);
    check("tampered file bytes refuse with 409", (await fetch(`${BASE}/api/agreements/${fileAgId}/files/${frozen[0].id}?token=${encodeURIComponent(fileTok)}`)).status === 409);
    putObject(frozen[0].key, goodBytes);

    // ---- 5. Countersign auto-applies her stored mark (memorandum) ----
    const memoSent2 = await AG.createAndSendAgreement({
      tenantId: TENANT,
      templateId: memo!.id,
      recipient: { name: "Irene Maria Meza", email: "c21-recipient@example.test" },
    });
    const memoId = memoSent2.ok ? memoSent2.agreementId : "";
    await AG.markViewed(memoId, "recipient");
    await AG.markDisclosureShown(memoId, "recipient");
    const memoSigned = await AG.signAgreement({
      agreementId: memoId,
      signerName: "Irene Maria Meza",
      drawn: makeSigPng(),
      actor: "recipient",
      initials: { client_full_name: "Irene Maria Meza", arrangement_month: "December", child1_initials: "IBA", child2_initials: "ALM" },
    });
    check("memorandum signs with its fills", memoSigned.ok === true);
    await AG.countersignAgreement({ agreementId: memoId, name: "Valentina Vélez" });
    await sealIfComplete(memoId);
    const memoRow = await prisma.agreement.findFirst({ where: { id: memoId } });
    check("countersign auto-applied her stored mark + auto-dated", Boolean(memoRow?.countersignDrawn && memoRow.countersignedAt));
    const memoPdfRes = await fetch(`${BASE}/api/agreements/${memoId}/pdf?token=${encodeURIComponent(memoSent2.ok ? memoSent2.rawToken : "")}`);
    const memoPdf = Buffer.from(await memoPdfRes.arrayBuffer()).toString("latin1");
    check("sealed memorandum renders BOTH drawn marks", memoPdf.includes("/Sig1 Do") && memoPdf.includes("/Sig2 Do"));
    check(
      "KEY TERMS reserved for the client-services master — absent on one-off docs",
      !memoPdf.includes("KEY TERMS") && !pdfText.includes("KEY TERMS")
    );

    // ---- 5b. Word-document conversion: brackets + blanks become fields ----
    const zipStore = (entries: { name: string; data: Buffer }[]): Buffer => {
      const parts: Buffer[] = [];
      const central: Buffer[] = [];
      let offset = 0;
      for (const e of entries) {
        const nameB = Buffer.from(e.name, "latin1");
        const crc = crc32(e.data);
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(e.data.length, 18);
        local.writeUInt32LE(e.data.length, 22);
        local.writeUInt16LE(nameB.length, 26);
        parts.push(local, nameB, e.data);
        const cen = Buffer.alloc(46);
        cen.writeUInt32LE(0x02014b50, 0);
        cen.writeUInt16LE(20, 4);
        cen.writeUInt16LE(20, 6);
        cen.writeUInt32LE(crc, 16);
        cen.writeUInt32LE(e.data.length, 20);
        cen.writeUInt32LE(e.data.length, 24);
        cen.writeUInt16LE(nameB.length, 28);
        cen.writeUInt32LE(offset, 42);
        central.push(cen, nameB);
        offset += 30 + nameB.length + e.data.length;
      }
      const centralBuf = Buffer.concat(central);
      const eocd = Buffer.alloc(22);
      eocd.writeUInt32LE(0x06054b50, 0);
      eocd.writeUInt16LE(entries.length, 8);
      eocd.writeUInt16LE(entries.length, 10);
      eocd.writeUInt32LE(centralBuf.length, 12);
      eocd.writeUInt32LE(offset, 16);
      return Buffer.concat([...parts, centralBuf, eocd]);
    };
    const p = (s: string) => `<w:p><w:r><w:t xml:space="preserve">${s}</w:t></w:r></w:p>`;
    const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${p("Vendor NDA")}${p("Full legal name: [[text: Full legal name]]")}${p("Effective date: ______")}${p("[[checkbox: I have read every page]]")}</w:body></w:document>`;
    const docxBytes = zipStore([
      { name: "[Content_Types].xml", data: Buffer.from("<Types/>") },
      { name: "word/document.xml", data: Buffer.from(docXml) },
    ]);
    const { convertDocxToFillable } = await import("../../lib/agreements/docx");
    const conv = convertDocxToFillable(docxBytes);
    check(
      "docx converts: bracket token → inline field, verbatim text kept",
      Boolean(conv && conv.body.includes("Full legal name: {{fill:full-legal-name}}") && conv.body.includes("Vendor NDA") && !conv.body.includes("[["))
    );
    check(
      "docx converts: underscore blank auto-detected, labeled from context",
      Boolean(conv && conv.body.includes("Effective date: {{fill:effective-date}}") && conv.items.some((i) => i.id === "effective-date" && i.text === "Effective date" && i.kind === "text"))
    );
    check(
      "docx converts: checkbox token becomes an acknowledgment item",
      Boolean(conv && conv.items.some((i) => i.kind === "checkbox" && i.text === "I have read every page") && conv.items.filter((i) => i.required).length === 3)
    );

    // ---- 5c. Payment authorization (es) + DIRECT SIGN LINK (no email) ----
    const { installPaymentAuthorization, PAYMENT_AUTH_SLUG } = await import("../../lib/agreements/install-c21");
    check("payment authorization installs (idempotent)", (await installPaymentAuthorization(TENANT)).installed === true && (await installPaymentAuthorization(TENANT)).installed === false);
    // v2 replacement: an already-installed older text reconciles in place.
    const payAuthId = (await prisma.agreementTemplate.findFirst({ where: { slug: PAYMENT_AUTH_SLUG }, select: { id: true } }))!.id;
    await prisma.agreementTemplate.update({ where: { id: payAuthId }, data: { body: "stale v1 body" } });
    check("older installed text reconciles to the new version in place", (await installPaymentAuthorization(TENANT)).updated === true);
    const payAuth = await prisma.agreementTemplate.findFirst({ where: { slug: PAYMENT_AUTH_SLUG } });
    check(
      "payment auth v2: es, ACTIVE, every box fillable, ZERO card/bank data anywhere",
      payAuth?.locale === "es" &&
        payAuth.status === "ACTIVE" &&
        payAuth.body.includes("{{fill:nombre_autorizante}}") &&
        payAuth.body.includes("{{fill:dia_del_mes}}") &&
        payAuth.body.includes("mantengo en archivo") &&
        !/(Código de Seguridad|Número de Cuenta|Routing|Vencimiento)/i.test(payAuth.body) &&
        (payAuth.initialItems as unknown[]).length === 6
    );
    const linkOnly = await AG.createAndSendAgreement({
      tenantId: TENANT,
      templateId: payAuth!.id,
      recipient: { name: "Pagador Tercero" },
    });
    check("sign link creates WITHOUT an email (nothing to send to)", linkOnly.ok === true);
    const linkRow = await prisma.agreement.findFirst({ where: { id: linkOnly.ok ? linkOnly.agreementId : "" } });
    check("link-only agreement: name kept, no email, es locale", linkRow?.recipientName === "Pagador Tercero" && linkRow.recipientEmail === null && linkRow.locale === "es");
    const linkTok = linkOnly.ok ? linkOnly.rawToken : "";
    const payPage = await fetch(`${BASE}/agree/${linkTok}`);
    const payHtml = await payPage.text();
    check("sign page renders in Spanish with the inline name field", payHtml.includes("Acepto y firmo") && payHtml.includes(`name="fill:nombre_autorizante"`));
    const paySigned = await AG.signAgreement({
      agreementId: linkOnly.ok ? linkOnly.agreementId : "",
      signerName: "Pagador Tercero",
      drawn: makeSigPng(),
      actor: "recipient",
      initials: {
        "cargo-recurrente": "checked",
        nombre_autorizante: "Pagador Tercero",
        frecuencia: "Semanal",
        dia_de_la_semana: "viernes",
        "tarjeta-en-archivo": "checked",
      },
    });
    check("payer signs from the link (optional day-of-month field left empty)", paySigned.ok === true);
    await sealIfComplete(linkOnly.ok ? linkOnly.agreementId : "");
    const payDone = await fetch(`${BASE}/agree/${linkTok}`);
    check("sealed without any email on file; signer downloads from the done page", (await payDone.text()).includes("Download your sealed copy"));

    // ---- 6. Self-sign (the Square narrative) ----
    const self = await AG.selfSignAndSeal({ tenantId: TENANT, templateId: narr!.id });
    check("self-sign + seal in one motion", self.ok === true);
    if (self.ok) {
      const selfRow = await prisma.agreement.findFirst({ where: { id: self.agreementId } });
      check("self-signed: her name, her stored mark, sealed, auto-dated", Boolean(selfRow?.signedAt && selfRow.signerDrawn && selfRow.sealedSha256));
    }
    const refuse = await AG.selfSignAndSeal({ tenantId: TENANT, templateId: memo!.id });
    check("self-sign refuses dual-signature documents", !refuse.ok);

    // ---- 7. Desk browser (document tiles → drill-in), Portrait tab, nav ----
    const practCookie = await signIn("valentina@fixture.test");
    const deskGrid = await fetch(`${BASE}/practitioner/agreements`, { headers: { Cookie: practCookie } });
    const gridHtml = await deskGrid.text();
    check(
      "desk: documents-first tiles (no flat list) + one-step upload form",
      gridHtml.includes("doc=") && gridHtml.includes("request") && !gridHtml.includes("Awaiting signature ·") && gridHtml.includes("Send to anyone by email") && gridHtml.includes("Preview it")
    );
    const memoDoc = encodeURIComponent("Memorandum of Family Services Arrangement");
    const deskDoc = await fetch(`${BASE}/practitioner/agreements?doc=${memoDoc}&view=list&show=signed`, { headers: { Cookie: practCookie } });
    const deskDocHtml = await deskDoc.text();
    check("desk: opening a document shows its requests with shelves + list view", deskDocHtml.includes("All documents") && deskDocHtml.includes("Awaiting signature") && deskDocHtml.includes("Download sealed PDF"));

    // ---- 7b. Upload preview flow: DRAFT until visually confirmed ----
    const probeConv = convertDocxToFillable(docxBytes)!;
    const probeTpl = await prisma.agreementTemplate.create({
      data: {
        tenantId: TENANT,
        slug: "c21-upload-probe",
        kind: "TEXT",
        version: 1,
        locale: "en",
        title: "Upload Probe NDA",
        body: probeConv.body,
        initialItems: probeConv.items as unknown as object[],
        status: "DRAFT",
        placeholder: false,
      },
    });
    const previewPage = await fetch(`${BASE}/practitioner/agreements/upload/${probeTpl.id}`, { headers: { Cookie: practCookie } });
    const previewHtml = await previewPage.text();
    check(
      "upload preview: fields shown IN PLACE with checklist + release/discard controls",
      previewHtml.includes("data-field-pill") && previewHtml.includes("3 fields detected") && previewHtml.includes("Send for signature") && previewHtml.includes("Save as template") && previewHtml.includes("Discard this upload")
    );
    const draftRefuse = await AG.createAndSendAgreement({ tenantId: TENANT, templateId: probeTpl.id, recipient: { name: "X", email: "x@example.test" } });
    check("un-reviewed upload (DRAFT) refuses to send", !draftRefuse.ok);

    // template-file route: practitioner-only
    const tplFileOk = await fetch(`${BASE}/api/agreement-templates/${narr!.id}/files/${narrFiles[0].id}`, { headers: { Cookie: practCookie } });
    check("template files open for the practitioner preview (403 anonymous)", tplFileOk.status === 200 && (await fetch(`${BASE}/api/agreement-templates/${narr!.id}/files/${narrFiles[0].id}`)).status === 403);
    const portrait = await fetch(`${BASE}/practitioner/clients/${maria.id}?tab=agreements`, { headers: { Cookie: practCookie } });
    const portraitHtml = await portrait.text();
    check("Portrait: agreements tab lives on the client file", portrait.status === 200 && portraitHtml.includes("Open the agreements desk"));
    check("practitioner nav carries Agreements", gridHtml.includes(`href="/practitioner/agreements"`) && portraitHtml.includes(">Agreements<"));
    check("practitioner nav carries Settings (was desktop-unreachable)", gridHtml.includes(`href="/practitioner/settings"`) && gridHtml.includes(">Settings<"));
    check(
      "desk points at her signature with its stored state",
      gridHtml.includes("/practitioner/settings#signature") && (gridHtml.includes("signs and countersigns for you") || gridHtml.includes("not set yet"))
    );
    check(
      "desk: Create-a-sign-link form + es-only document visible in dropdowns",
      gridHtml.includes("Create a sign link") && gridHtml.includes("Autorización de Pago")
    );
    const linkBanner = await fetch(`${BASE}/practitioner/agreements?signlink=${encodeURIComponent(`${BASE}/agree/probe`)}&signee=Pagador`, { headers: { Cookie: practCookie } });
    const linkBannerHtml = await linkBanner.text();
    // (React splits text/expression nodes with comments, so match the parts.)
    check("desk: one-time sign-link banner renders copyable", linkBannerHtml.includes("Sign link created for") && linkBannerHtml.includes("Pagador") && linkBannerHtml.includes("select-all"));
    const settingsPage = await fetch(`${BASE}/practitioner/settings`, { headers: { Cookie: practCookie } });
    const settingsHtml = await settingsPage.text();
    check(
      "settings: signature section offers draw AND image upload",
      settingsHtml.includes(`id="signature"`) && settingsHtml.includes("upload a photo / scan of your signature") && settingsHtml.includes(`accept="image/png,image/jpeg,image/webp"`)
    );
  } finally {
    server.kill();
    if (priorSig) {
      await prisma.practiceSetting.upsert({ where: { key: "practitionerSignatureDrawn" }, create: { key: "practitionerSignatureDrawn", value: priorSig.value }, update: { value: priorSig.value } }).catch(() => {});
    } else {
      await prisma.practiceSetting.deleteMany({ where: { key: "practitionerSignatureDrawn" } }).catch(() => {});
    }
    await cleanup();
    console.log("~ probe rows removed, settings restored");
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log(failed === 0 ? `\nC21 VERIFY PASS — ${results.length}/${results.length}` : `\n${failed} CHECK(S) FAILED`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => {
    void prisma.$disconnect();
    try { execSync(`pkill -f "next start -p ${APP_PORT}"`); } catch { /* none */ }
  });
