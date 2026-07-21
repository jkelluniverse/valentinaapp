"use server";

import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { audit } from "@/lib/audit";
import { sendEmail } from "@/lib/notify";
import { getBaseUrlSafe } from "@/lib/base-url";
import {
  pickLocale,
  passwordResetEmail,
  assistedEmailChangedEmail,
  assistSessionEmail,
} from "@/lib/email-copy";
import { startAssist, ASSIST_REASONS } from "@/lib/assist";
import { setChargeStatus } from "@/lib/billing";
import { listCardsOnFile, createSquarePayment, squareConfigured } from "@/lib/square";
import { sendChargeInvoice } from "@/app/practitioner/billing/actions";

// AMD-06 §1 — the "Help with their account" tools. Design law throughout:
// capability yes, impersonation no. actorId = Valentina on everything here,
// onBehalfOfId = the client; the audit line is part of the action, not an
// afterthought. Logs are metadata only — never a password or token.

const back = (clientId: string, q: string) => `/practitioner/clients/${clientId}?help=${q}#help`;

async function requireClientRow(clientId: string) {
  const client = await prisma.user.findFirst({
    where: { id: clientId, role: "CLIENT" },
    select: { id: true, name: true, email: true, locale: true, active: true },
  });
  if (!client) redirect("/practitioner/clients");
  return client;
}

// ---- Locked out: send the normal reset link, admin-initiated ----
export async function adminSendResetLink(clientId: string) {
  const me = await requirePractitioner();
  const client = await requireClientRow(clientId);
  const token = randomBytes(32).toString("hex");
  await prisma.passwordResetToken.create({
    data: {
      userId: client.id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 60 * 60_000),
    },
  });
  const locale = pickLocale(client.locale);
  const link = `${getBaseUrlSafe()}/reset/${token}`;
  const mail = passwordResetEmail(locale, { link });
  await sendEmail({
    to: client.email,
    subject: mail.subject,
    text: mail.text,
    envelope: {
      locale,
      heading: mail.subject,
      button: { label: locale === "es" ? "Crear nueva contraseña" : "Create a new password", url: link },
    },
  });
  await audit({ actorId: me.id, onBehalfOfId: client.id, action: "reset-link-sent" });
  revalidatePath(`/practitioner/clients/${clientId}`);
  redirect(back(clientId, "reset-sent"));
}

// ---- Locked out, phone in hand: temporary password, shown ONCE to her ----
// Returned (not redirected) so the value renders once in her UI and lives
// nowhere else: not in URLs, not in logs, not in the DB beyond its hash.
export async function setTempPassword(
  clientId: string,
): Promise<{ ok: boolean; temp?: string; error?: string }> {
  const me = await requirePractitioner();
  const client = await prisma.user.findFirst({
    where: { id: clientId, role: "CLIENT", active: true },
    select: { id: true },
  });
  if (!client) return { ok: false, error: "not-found" };

  // Readable over the phone: word-digits-word, no ambiguous characters.
  const words = ["cedar", "marfil", "luna", "brisa", "canto", "rio", "salvia", "ambar", "coral", "vela"];
  const pick = () => words[randomBytes(1)[0] % words.length];
  const temp = `${pick()}-${(randomBytes(2).readUInt16BE(0) % 900) + 100}-${pick()}`;

  await prisma.user.update({
    where: { id: client.id },
    data: {
      passwordHash: await bcrypt.hash(temp, 12),
      mustChangePassword: true,
      sessionVersion: { increment: 1 }, // stale sessions die now
    },
  });
  await audit({ actorId: me.id, onBehalfOfId: client.id, action: "temp-password" });
  return { ok: true, temp };
}

// ---- Lost the old inbox: assisted email change (verified by her) ----
export async function assistedEmailChange(clientId: string, formData: FormData) {
  const me = await requirePractitioner();
  const client = await requireClientRow(clientId);
  const newEmail = String(formData.get("newEmail") ?? "").trim().toLowerCase();
  const note = String(formData.get("note") ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) redirect(back(clientId, "email-format"));
  if (!note) redirect(back(clientId, "email-note"));
  if (newEmail === client.email.toLowerCase()) redirect(back(clientId, "email-same"));
  if (await prisma.user.findUnique({ where: { email: newEmail } })) {
    redirect(back(clientId, "email-taken"));
  }

  const oldEmail = client.email;
  await prisma.user.update({
    where: { id: client.id },
    data: { email: newEmail, sessionVersion: { increment: 1 } },
  });
  // The tripwire notice still goes to the OLD address.
  const notice = assistedEmailChangedEmail(pickLocale(client.locale), { newEmail });
  await sendEmail({ to: oldEmail, subject: notice.subject, text: notice.text });
  await audit({
    actorId: me.id,
    onBehalfOfId: client.id,
    action: "email-assisted-change",
    reason: `verifiedByPractitioner: ${note}`,
  });
  revalidatePath(`/practitioner/clients/${clientId}`);
  redirect(back(clientId, "email-done"));
}

// ---- Phone/in-person purchase: charge + package via attributed paths ----
export async function recordAssistedPurchase(clientId: string, formData: FormData) {
  const me = await requirePractitioner();
  const client = await requireClientRow(clientId);
  const priceBookId = String(formData.get("priceBookId") ?? "");
  const settlement = String(formData.get("settlement") ?? "invoice");
  const note = String(formData.get("note") ?? "").trim();
  if (!note) redirect(back(clientId, "purchase-note"));

  const sku = await prisma.priceBook.findFirst({ where: { id: priceBookId, active: true } });
  if (!sku) redirect(back(clientId, "purchase-bad"));

  const charge = await prisma.charge.create({
    data: {
      clientId: client.id,
      kind: sku.kind === "PACKAGE" ? "PACKAGE" : "CUSTOM",
      priceBookId: sku.id,
      description: sku.name,
      amountCents: sku.amountCents,
      currency: sku.currency,
      status: "DUE",
      dueAt: new Date(),
      lastActionById: me.id,
      channel: "PRACTITIONER_ASSISTED",
      channelNote: note,
    },
  });
  await audit({
    actorId: me.id,
    onBehalfOfId: client.id,
    action: "assisted-purchase",
    reason: note,
    meta: { chargeId: charge.id, sku: sku.name, settlement },
  });

  if (settlement === "markpaid") {
    // Cash/Zelle in person — settle now; a paid package activates itself.
    await setChargeStatus(charge.id, "PAID", me.id, { paidVia: "in-person" });
    revalidatePath(`/practitioner/clients/${clientId}`);
    redirect(back(clientId, "purchase-paid"));
  }

  if (settlement === "card") {
    // ONLY reachable when their card-on-file consent exists (the UI hides the
    // option otherwise; this is the server-side check behind it).
    const link = await prisma.squareCustomerLink.findUnique({ where: { clientId: client.id } });
    const consented = Boolean(link?.cardOnFile && link.cardConsentAt && !link.cardConsentRevokedAt);
    if (!link || !consented || !squareConfigured()) redirect(back(clientId, "purchase-noconsent"));
    const cards = await listCardsOnFile(link!.squareCustomerId);
    if (cards.length === 0) redirect(back(clientId, "purchase-nocard"));
    const paid = await createSquarePayment({
      token: cards[0].id,
      amountCents: charge.amountCents,
      currency: charge.currency,
      chargeId: charge.id,
      squareCustomerId: link!.squareCustomerId,
    });
    if (!paid.ok || (paid.status !== "COMPLETED" && paid.status !== "APPROVED")) {
      redirect(back(clientId, "purchase-declined"));
    }
    await setChargeStatus(charge.id, "PAID", me.id, {
      paidVia: "card-on-file",
      squarePaymentId: paid.paymentId,
    });
    revalidatePath(`/practitioner/clients/${clientId}`);
    redirect(back(clientId, "purchase-charged"));
  }

  // Default: send the Square invoice (they pay) — the shared branded flow.
  const f = new FormData();
  f.set("back", `/practitioner/clients/${clientId}?tab=billing`);
  await sendChargeInvoice(charge.id, f);
}

// ---- Stuck worksheet: reopen a jammed item without touching answers ----
export async function reopenWorksheet(clientId: string, assignmentId: string) {
  const me = await requirePractitioner();
  const assignment = await prisma.worksheetAssignment.findFirst({
    where: { id: assignmentId, clientId },
    include: { response: { select: { id: true } } },
  });
  if (!assignment) redirect(back(clientId, "reopen-missing"));
  if (assignment.response) {
    // Answers exist — the consistent state is COMPLETED (fixes a jam where
    // the status write was lost); their answers are never touched.
    await prisma.worksheetAssignment.update({
      where: { id: assignment.id },
      data: { status: "COMPLETED" },
    });
  } else {
    await prisma.worksheetAssignment.update({
      where: { id: assignment.id },
      data: { status: "PENDING" },
    });
  }
  await audit({
    actorId: me.id,
    onBehalfOfId: clientId,
    action: "worksheet-reopen",
    meta: { assignmentId, hadAnswers: Boolean(assignment.response) },
  });
  revalidatePath(`/practitioner/clients/${clientId}`);
  redirect(back(clientId, "reopen-done"));
}

// ---- §2 — enter Assist Mode ----
export async function enterAssist(clientId: string, formData: FormData) {
  const me = await requirePractitioner();
  const client = await requireClientRow(clientId);
  if (!client.active) redirect(back(clientId, "assist-inactive"));
  const reason = String(formData.get("reason") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (!ASSIST_REASONS[reason]) redirect(back(clientId, "assist-reason"));
  if (reason === "other" && !note) redirect(back(clientId, "assist-note"));

  await startAssist({ practitionerId: me.id, clientId: client.id, reason, note });

  // Transparency default ON — her conscious setting, not a silent choice.
  const pref = await prisma.practiceSetting.findUnique({ where: { key: "assistNotifyEmail" } });
  if (pref?.value !== "off") {
    const mail = assistSessionEmail(pickLocale(client.locale));
    await sendEmail({ to: client.email, subject: mail.subject, text: mail.text });
  }
  redirect("/space");
}
