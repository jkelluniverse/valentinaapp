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
