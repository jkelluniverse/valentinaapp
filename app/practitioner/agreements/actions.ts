"use server";

import { redirect } from "next/navigation";
import { requirePractitioner } from "@/lib/auth-guards";
import { getTenant } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import {
  createAndSendAgreement,
  ensureStarterTemplates,
  countersignAgreement,
  voidAgreement,
  markPaperSigned,
  agEvent,
} from "@/lib/agreements";
import { sealIfComplete } from "@/lib/agreements/seal";

export async function seedStarterTemplates() {
  await requirePractitioner();
  const tenant = await getTenant();
  const created = await ensureStarterTemplates(tenant.id);
  redirect(`/practitioner/agreements?seeded=${created}`);
}

// v3.1 — install counsel's master agreement (verbatim from the repo file),
// as DRAFT. Flipping it live stays a deliberate, separate act.
export async function installMasterV31Action() {
  await requirePractitioner();
  const tenant = await getTenant();
  const { installMasterV31 } = await import("@/lib/agreements/install-v31");
  await installMasterV31(tenant.id);
  redirect("/practitioner/agreements?installed=v31");
}

export async function sendAgreementAction(formData: FormData) {
  await requirePractitioner();
  const tenant = await getTenant();
  const result = await createAndSendAgreement({
    tenantId: tenant.id,
    templateId: String(formData.get("templateId") ?? ""),
    clientId: String(formData.get("clientId") ?? "") || undefined,
    merge: {
      ...(String(formData.get("package_name") ?? "").trim() ? { package_name: String(formData.get("package_name")).trim() } : {}),
      ...(String(formData.get("price") ?? "").trim() ? { price: String(formData.get("price")).trim() } : {}),
      ...(String(formData.get("term") ?? "").trim() ? { term: String(formData.get("term")).trim() } : {}),
    },
  });
  if (!result.ok) redirect(`/practitioner/agreements?error=${encodeURIComponent(result.error)}`);
  redirect(`/practitioner/agreements?sent=${result.ok ? result.agreementId : ""}`);
}

export async function remindAgreement(agreementId: string) {
  await requirePractitioner();
  const tenant = await getTenant();
  const a = await prisma.agreement.findFirst({ where: { id: agreementId } });
  if (a && ["SENT", "VIEWED"].includes(a.status)) {
    await prisma.agreement.update({ where: { id: a.id }, data: { remindedAt: new Date() } });
    await agEvent(tenant.id, a.id, "reminded", "practitioner");
  }
  redirect("/practitioner/agreements?reminded=1");
}

export async function voidAgreementAction(agreementId: string, formData: FormData) {
  await requirePractitioner();
  await voidAgreement(agreementId, String(formData.get("reason") ?? ""));
  redirect("/practitioner/agreements?voided=1");
}

export async function countersignAction(agreementId: string, formData: FormData) {
  const me = await requirePractitioner();
  const name = String(formData.get("name") ?? "").trim() || me.name || "Practitioner";
  const r = await countersignAgreement({ agreementId, name });
  if (r.ok) await sealIfComplete(agreementId);
  redirect(`/practitioner/agreements?countersigned=${r.ok ? 1 : 0}`);
}

export async function markPaperAction(agreementId: string, formData: FormData) {
  await requirePractitioner();
  await markPaperSigned(agreementId, String(formData.get("note") ?? ""));
  await sealIfComplete(agreementId);
  redirect("/practitioner/agreements?paper=1");
}

// ---------- C21 — one-off sends, uploads, self-sign, stored signature ----------

// C21 — install the dispute packet (files_7.zip): two fillable text
// documents + two branded-PDF file templates, verbatim, ACTIVE.
export async function installDisputePacketAction() {
  await requirePractitioner();
  const tenant = await getTenant();
  const { installDisputePacket } = await import("@/lib/agreements/install-c21");
  await installDisputePacket(tenant.id);
  redirect("/practitioner/agreements?installed=dispute-packet");
}

// C21.4 — install the Spanish payment authorization (payee-signed).
export async function installPaymentAuthAction() {
  await requirePractitioner();
  const tenant = await getTenant();
  const { installPaymentAuthorization } = await import("@/lib/agreements/install-c21");
  await installPaymentAuthorization(tenant.id);
  redirect("/practitioner/agreements?installed=payment-auth");
}

// C21.4 — a DIRECT SIGN LINK, no email: for documents passed along by
// hand — e.g. the client forwards it to their payer over WhatsApp. Same
// signed-token basis as emailed sends; the link is shown once, copyable.
export async function createSignLinkAction(formData: FormData) {
  await requirePractitioner();
  const tenant = await getTenant();
  const name = String(formData.get("signerName") ?? "").trim();
  const email = String(formData.get("signerEmail") ?? "").trim();
  if (!name) redirect(`/practitioner/agreements?error=${encodeURIComponent("the signer's name is required")}`);
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    redirect(`/practitioner/agreements?error=${encodeURIComponent("that email doesn't look right — leave it empty for a link-only request")}`);
  }
  const result = await createAndSendAgreement({
    tenantId: tenant.id,
    templateId: String(formData.get("templateId") ?? ""),
    recipient: { name, ...(email ? { email } : {}) },
  });
  if (!result.ok) redirect(`/practitioner/agreements?error=${encodeURIComponent(result.error)}`);
  const { getBaseUrlSafe } = await import("@/lib/base-url");
  const link = `${getBaseUrlSafe()}/agree/${result.ok ? result.rawToken : ""}`;
  redirect(`/practitioner/agreements?signlink=${encodeURIComponent(link)}&signee=${encodeURIComponent(name)}`);
}

// Send any ACTIVE template to ANY email address — recipient needs no
// account; the signed link is their whole path.
export async function sendToEmailAction(formData: FormData) {
  await requirePractitioner();
  const tenant = await getTenant();
  const name = String(formData.get("recipientName") ?? "").trim();
  const email = String(formData.get("recipientEmail") ?? "").trim();
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    redirect(`/practitioner/agreements?error=${encodeURIComponent("recipient name and a valid email are required")}`);
  }
  const result = await createAndSendAgreement({
    tenantId: tenant.id,
    templateId: String(formData.get("templateId") ?? ""),
    recipient: { name, email },
  });
  if (!result.ok) redirect(`/practitioner/agreements?error=${encodeURIComponent(result.error)}`);
  redirect(`/practitioner/agreements?sent=${result.ok ? result.agreementId : ""}`);
}

// C21.2 — upload is now upload → PREVIEW → confirm. This step only reads
// the file(s) and parks everything as a DRAFT; nothing is sendable until
// the practitioner has SEEN the converted page (fields visually placed)
// or the attached files, and confirmed from the preview.
export async function uploadRequestAction(formData: FormData) {
  await requirePractitioner();
  const tenant = await getTenant();
  const { saveAgreementFile } = await import("@/lib/agreements/files");

  const title = String(formData.get("title") ?? "").trim();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const fail = (msg: string) => redirect(`/practitioner/agreements?error=${encodeURIComponent(msg)}`);
  if (!title) fail("a request title is required");
  if (files.length === 0) fail("attach at least one document file");

  const baseSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "upload";
  let slug = baseSlug;
  for (let i = 2; await prisma.agreementTemplate.findFirst({ where: { tenantId: tenant.id, slug, version: 1, locale: "en" }, select: { id: true } }); i++) {
    slug = `${baseSlug}-${i}`;
  }

  // A single Word document becomes a fillable signing page (verbatim text;
  // [[kind: Label]] brackets and ____ blanks become fields). Anything else
  // attaches as-is for review + signature.
  const isDocx = (f: File) => /\.docx$/i.test(f.name) || f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const convert = files.length === 1 && isDocx(files[0]);
  const countersign = formData.get("requiresCountersign") === "on";
  let templateId: string;
  if (convert) {
    const { convertDocxToFillable } = await import("@/lib/agreements/docx");
    const converted = convertDocxToFillable(Buffer.from(await files[0].arrayBuffer()));
    if (!converted) fail("couldn't read that Word document — re-save it as .docx, or upload a PDF to attach as-is");
    const template = await prisma.agreementTemplate.create({
      data: {
        tenantId: tenant.id,
        slug,
        kind: "TEXT",
        version: 1,
        locale: "en",
        title,
        body: converted!.body,
        initialItems: converted!.items.length ? (converted!.items as unknown as object[]) : undefined,
        requiresCountersign: countersign,
        status: "DRAFT",
        placeholder: false,
      },
    });
    templateId = template.id;
  } else {
    const template = await prisma.agreementTemplate.create({
      data: {
        tenantId: tenant.id,
        slug,
        kind: "FILES",
        version: 1,
        locale: "en",
        title,
        body: "Review the attached document(s); your signature below covers them.",
        requiresCountersign: countersign,
        status: "DRAFT",
        placeholder: false,
      },
    });
    templateId = template.id;
    for (const f of files) {
      const saved = await saveAgreementFile({
        tenantId: tenant.id,
        bytes: Buffer.from(await f.arrayBuffer()),
        filename: f.name,
        contentType: f.type,
        templateId,
      });
      if (!saved.ok) {
        await prisma.agreementFile.deleteMany({ where: { templateId } });
        await prisma.agreementTemplate.delete({ where: { id: templateId } });
        fail(`${f.name}: ${saved.error}`);
      }
    }
  }
  redirect(`/practitioner/agreements/upload/${templateId}`);
}

// The preview's confirm: release the reviewed DRAFT — keep it as a
// reusable template, and/or send it to a typed-in recipient right away.
export async function confirmUploadAction(templateId: string, formData: FormData) {
  await requirePractitioner();
  const tenant = await getTenant();
  const template = await prisma.agreementTemplate.findFirst({ where: { id: templateId } });
  if (!template) redirect("/practitioner/agreements?error=upload+not+found");
  // Never a side door for counsel's master: its DRAFT→ACTIVE flip stays a
  // deliberate database act (v3.1 hard rule), not an upload confirm.
  if (template!.slug === "client-services-agreement") {
    redirect("/practitioner/agreements?error=the+master+agreement+is+released+separately");
  }

  const mode = String(formData.get("mode") ?? "save");
  await prisma.agreementTemplate.update({ where: { id: templateId }, data: { status: "ACTIVE" } });
  if (mode !== "send") redirect("/practitioner/agreements?uploaded=saved");

  const name = String(formData.get("recipientName") ?? "").trim();
  const email = String(formData.get("recipientEmail") ?? "").trim();
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    redirect(`/practitioner/agreements/upload/${templateId}?error=${encodeURIComponent("recipient name and a valid email are required")}`);
  }
  const result = await createAndSendAgreement({ tenantId: tenant.id, templateId, recipient: { name, email } });
  if (formData.get("keepTemplate") !== "on") {
    // One-off: the frozen agreement carries everything; retire the
    // scaffolding template so the library stays curated.
    await prisma.agreementTemplate.update({ where: { id: templateId }, data: { status: "RETIRED" } });
  }
  if (!result.ok) redirect(`/practitioner/agreements?error=${encodeURIComponent(result.error)}`);
  redirect(`/practitioner/agreements?sent=${result.ok ? result.agreementId : ""}`);
}

export async function discardUploadAction(templateId: string) {
  await requirePractitioner();
  const template = await prisma.agreementTemplate.findFirst({ where: { id: templateId, status: "DRAFT" } });
  if (template) {
    await prisma.agreementFile.deleteMany({ where: { templateId } });
    await prisma.agreementTemplate.delete({ where: { id: templateId } });
  }
  redirect("/practitioner/agreements?uploaded=discarded");
}

// Practitioner-only documents: sign + seal in one motion, with her stored
// mark and the auto-set date.
export async function selfSignAction(templateId: string) {
  await requirePractitioner();
  const tenant = await getTenant();
  const { selfSignAndSeal } = await import("@/lib/agreements");
  const result = await selfSignAndSeal({ tenantId: tenant.id, templateId });
  if (!result.ok) redirect(`/practitioner/agreements?error=${encodeURIComponent(result.error)}`);
  redirect("/practitioner/agreements?selfsigned=1");
}

// Store (or remove) her drawn signature — settings surface.
export async function savePractitionerSignatureAction(formData: FormData) {
  await requirePractitioner();
  const { setPractitionerSignature } = await import("@/lib/agreements");
  if (formData.get("remove") === "1") {
    await setPractitionerSignature(null);
  } else {
    const drawn = String(formData.get("drawn") ?? "");
    if (drawn) await setPractitionerSignature(drawn);
  }
  redirect("/practitioner/settings?signature=saved");
}

export async function toggleTemplateTrigger(templateId: string, field: string) {
  await requirePractitioner();
  const allowed = new Set(["sendOnInviteAccept", "requireBeforeBooking", "sendOnPackagePurchase", "sendOnRecordingConsent"]);
  if (!allowed.has(field)) redirect("/practitioner/agreements");
  const row = await prisma.agreementTemplate.findFirst({ where: { id: templateId } });
  if (row) {
    await prisma.agreementTemplate.update({
      where: { id: templateId },
      data: { [field]: !(row as unknown as Record<string, boolean>)[field] },
    });
  }
  redirect("/practitioner/agreements?toggled=1");
}
