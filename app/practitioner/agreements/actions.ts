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

// One line per field: "text: Label", "textarea: Label", "initials: Label",
// or "checkbox: Label". Unparseable lines are ignored.
function parseFieldLines(src: string): { id: string; text: string; kind: string; required: boolean; multiline?: boolean }[] {
  const items: { id: string; text: string; kind: string; required: boolean; multiline?: boolean }[] = [];
  const seen = new Set<string>();
  for (const rawLine of src.split("\n")) {
    const m = /^(text|textarea|initials|checkbox)\s*:\s*(.+)$/i.exec(rawLine.trim());
    if (!m) continue;
    const kindWord = m[1].toLowerCase();
    const label = m[2].trim();
    let id = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || `field-${items.length + 1}`;
    while (seen.has(id)) id = `${id}-2`;
    seen.add(id);
    items.push({
      id,
      text: label,
      kind: kindWord === "textarea" ? "text" : kindWord,
      required: true,
      ...(kindWord === "textarea" ? { multiline: true } : {}),
    });
  }
  return items;
}

// Upload document file(s) → a signature request. Optionally stored as a
// reusable template; optionally sent immediately to a typed-in recipient.
export async function uploadRequestAction(formData: FormData) {
  await requirePractitioner();
  const tenant = await getTenant();
  const { saveAgreementFile } = await import("@/lib/agreements/files");

  const title = String(formData.get("title") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const saveAsTemplate = formData.get("saveAsTemplate") === "on";
  const recipientName = String(formData.get("recipientName") ?? "").trim();
  const recipientEmail = String(formData.get("recipientEmail") ?? "").trim();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);

  const fail = (msg: string) => redirect(`/practitioner/agreements?error=${encodeURIComponent(msg)}`);
  if (!title) fail("a request title is required");
  if (files.length === 0) fail("attach at least one document file");
  const sendNow = Boolean(recipientName || recipientEmail);
  if (sendNow && (!recipientName || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipientEmail))) {
    fail("to send now, give the recipient's name and a valid email");
  }
  if (!sendNow && !saveAsTemplate) fail("either save as a template or enter a recipient to send to");

  const baseSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "upload";
  let slug = baseSlug;
  for (let i = 2; await prisma.agreementTemplate.findFirst({ where: { tenantId: tenant.id, slug, version: 1, locale: "en" }, select: { id: true } }); i++) {
    slug = `${baseSlug}-${i}`;
  }
  const extraItems = parseFieldLines(String(formData.get("fields") ?? ""));

  // C21.1 — a single Word document converts into a FILLABLE signing page:
  // its text becomes the document body verbatim, [[kind: Label]] brackets
  // and underscore blanks (____) become fields the signer completes in
  // place, guided field-to-field. PDFs/multiple files attach as-is.
  const isDocx = (f: File) => /\.docx$/i.test(f.name) || f.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  const convert = formData.get("convertDocx") === "on" && files.length === 1 && isDocx(files[0]);
  let template;
  if (convert) {
    const { convertDocxToFillable } = await import("@/lib/agreements/docx");
    const converted = convertDocxToFillable(Buffer.from(await files[0].arrayBuffer()));
    if (!converted) fail("couldn't read that Word document — attach it as-is instead, or re-save it as .docx");
    const items = [...converted!.items, ...extraItems];
    template = await prisma.agreementTemplate.create({
      data: {
        tenantId: tenant.id,
        slug,
        kind: "TEXT",
        version: 1,
        locale: "en",
        title,
        body: converted!.body,
        initialItems: items.length ? (items as unknown as object[]) : undefined,
        requiresCountersign: formData.get("requiresCountersign") === "on",
        status: "ACTIVE",
        placeholder: false,
      },
    });
  } else {
    template = await prisma.agreementTemplate.create({
      data: {
        tenantId: tenant.id,
        slug,
        kind: "FILES",
        version: 1,
        locale: "en",
        title,
        body: message || "Review the attached document(s); your signature below covers them.",
        initialItems: extraItems.length ? extraItems : undefined,
        requiresCountersign: formData.get("requiresCountersign") === "on",
        status: "ACTIVE",
        placeholder: false,
      },
    });
    for (const f of files) {
      const saved = await saveAgreementFile({
        tenantId: tenant.id,
        bytes: Buffer.from(await f.arrayBuffer()),
        filename: f.name,
        contentType: f.type,
        templateId: template.id,
      });
      if (!saved.ok) {
        await prisma.agreementFile.deleteMany({ where: { templateId: template.id } });
        await prisma.agreementTemplate.delete({ where: { id: template.id } });
        fail(`${f.name}: ${saved.error}`);
      }
    }
  }

  if (sendNow) {
    const result = await createAndSendAgreement({
      tenantId: tenant.id,
      templateId: template.id,
      recipient: { name: recipientName, email: recipientEmail },
    });
    if (!saveAsTemplate) {
      // One-off: the frozen agreement carries everything; retire the
      // scaffolding template so it doesn't clutter the library.
      await prisma.agreementTemplate.update({ where: { id: template.id }, data: { status: "RETIRED" } });
    }
    if (!result.ok) redirect(`/practitioner/agreements?error=${encodeURIComponent(result.error)}`);
    redirect(`/practitioner/agreements?sent=${result.ok ? result.agreementId : ""}`);
  }
  redirect("/practitioner/agreements?uploaded=1");
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
