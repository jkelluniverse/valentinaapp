"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { setChargeStatus, createChargeForAppointment } from "@/lib/billing";
import { sendEmail, emailConfigured } from "@/lib/notify";
import {
  paymentReminderEmail,
  payeeInvoiceEmail,
  invoiceEmail,
  renewalEmail,
  pickLocale,
} from "@/lib/email-copy";
import { chargeEmailContext } from "@/lib/invoice-context";
import { getBaseUrlSafe } from "@/lib/base-url";
import { formatMoney, resolveSessionRate } from "@/lib/billing";
import { ensureSquareCustomer, sendSquareInvoice, squareConfigured } from "@/lib/square";
import { sendReceiptForCharge } from "@/lib/receipts";
import { PROGRAM_STAGES } from "@/lib/program-config";

const LEDGER = "/practitioner/billing";
const RATES = "/practitioner/billing/rates"; // configuration lives off the daily view

function backPath(formData?: FormData): string {
  const back = formData ? String(formData.get("back") ?? "") : "";
  return back.startsWith("/practitioner") ? back : LEDGER;
}

// `back` may already carry a query (?tab=billing) — join correctly, or the
// tab param silently corrupts and the Portrait lands on the wrong tab.
function withQuery(back: string, query: string): string {
  return `${back}${back.includes("?") ? "&" : "?"}${query}`;
}

// Manual money actions — every one attributable (lastActionById).

export async function markChargePaid(chargeId: string, formData: FormData) {
  const practitioner = await requirePractitioner();
  const charge = await prisma.charge.findUnique({ where: { id: chargeId } });
  if (charge && (charge.status === "DUE" || charge.status === "PENDING")) {
    await setChargeStatus(chargeId, "PAID", practitioner.id, { paidVia: "in-person" });
  }
  const back = backPath(formData);
  revalidatePath(back);
  redirect(withQuery(back, `billing=paid`));
}

export async function waiveCharge(chargeId: string, formData: FormData) {
  const practitioner = await requirePractitioner();
  const charge = await prisma.charge.findUnique({ where: { id: chargeId } });
  if (charge && (charge.status === "DUE" || charge.status === "PENDING")) {
    await setChargeStatus(chargeId, "WAIVED", practitioner.id, { paidVia: "waived" });
  }
  const back = backPath(formData);
  revalidatePath(back);
  redirect(withQuery(back, `billing=waived`));
}

// A warm nudge by email — rides the C10 notification path; quietly skipped
// when email isn't configured.
export async function remindCharge(chargeId: string, formData: FormData) {
  await requirePractitioner();
  const back = backPath(formData);
  if (!emailConfigured()) redirect(withQuery(back, `billing=noemail`));

  const charge = await prisma.charge.findUnique({ where: { id: chargeId } });
  // Honesty over reassurance: a paid/settled charge sends nothing — say so
  // instead of flashing "reminded" for an email that never went out.
  if (!charge || charge.status !== "DUE") {
    revalidatePath(back);
    redirect(withQuery(back, `billing=nothingdue`));
  }
  // The reminder carries the invoice itself: details in the body, the PDF
  // attached, and one button straight to the payment page.
  const ctx = await chargeEmailContext(charge, getBaseUrlSafe());
  if (ctx.client?.email) {
    // AMD-05 — the reminder renders in the client's language; C13-PKG §9 —
    // lastRemindedAt recorded so nothing double-nudges.
    const mail = paymentReminderEmail(ctx.client.locale, {
      description: charge.description,
      amount: ctx.amount,
      due: ctx.dueDateText,
    });
    await sendEmail({
      to: ctx.client.email,
      subject: mail.subject,
      text: mail.text,
      attachments: [ctx.attachment],
      envelope: {
        locale: ctx.client.locale,
        heading: mail.heading,
        paragraphs: mail.paragraphs,
        ...(ctx.payUrl ? { button: { label: mail.buttonLabel, url: ctx.payUrl } } : {}),
      },
    });
    // The payee — when someone else covers this client's bills, the reminder
    // reaches them too, same PDF attached.
    if (ctx.payee) {
      const payeeMail = payeeInvoiceEmail(ctx.client.locale, {
        kind: "reminder",
        payeeName: ctx.payee.name,
        clientName: ctx.client.name ?? "your client",
        description: charge.description,
        amount: ctx.amount,
        due: ctx.dueDateText,
      });
      await sendEmail({
        to: ctx.payee.email,
        subject: payeeMail.subject,
        text: payeeMail.paragraphs.join("\n\n"),
        attachments: [ctx.attachment],
        envelope: {
          locale: ctx.client.locale,
          heading: payeeMail.heading,
          paragraphs: payeeMail.paragraphs,
          ...(ctx.payUrl ? { button: { label: payeeMail.buttonLabel, url: ctx.payUrl } } : {}),
        },
      });
    }
    await prisma.charge.update({
      where: { id: charge.id },
      data: { lastRemindedAt: new Date() },
    });
    console.log(`[billing] reminder charge=${charge.id}${ctx.payee ? " +payee" : ""}`);
  }
  revalidatePath(back);
  redirect(withQuery(back, `billing=reminded`));
}

// BILLING-DASH — Square-invoice an EXISTING due charge (the Portrait's
// sendInvoice creates a new charge; this one payables what's already owed).
// Idempotent: the order/invoice idempotency keys derive from the charge id.
export async function sendChargeInvoice(chargeId: string, formData: FormData) {
  await requirePractitioner();
  const back = backPath(formData);
  if (!squareConfigured()) redirect(withQuery(back, "billing=invoiceconfig"));
  const charge = await prisma.charge.findUnique({ where: { id: chargeId } });
  if (!charge || charge.status !== "DUE") redirect(withQuery(back, "billing=nothingdue"));
  if (charge.squareInvoiceId) redirect(withQuery(back, "billing=invoicealready"));

  const client = await prisma.user.findFirst({
    where: { id: charge.clientId, role: "CLIENT" },
    select: { id: true, name: true, email: true },
  });
  if (!client) redirect(withQuery(back, "billing=invoicefail"));
  const squareCustomerId = await ensureSquareCustomer(client);
  if (!squareCustomerId) redirect(withQuery(back, "billing=invoicefail"));

  const sent = await sendSquareInvoice({
    chargeId: charge.id,
    squareCustomerId,
    title: charge.description,
    amountCents: charge.amountCents,
    currency: charge.currency,
    dueDate: charge.dueAt ? charge.dueAt.toISOString().slice(0, 10) : null,
  });
  if (!sent.ok) redirect(withQuery(back, "billing=invoicefail"));
  const updated = await prisma.charge.update({
    where: { id: charge.id },
    data: { squareInvoiceId: sent.invoiceId, squareInvoiceUrl: sent.publicUrl },
  });
  if (sent.publicUrl) {
    const ctx = await chargeEmailContext(updated, getBaseUrlSafe());
    if (ctx.client?.email) {
      const mail = invoiceEmail(ctx.client.locale, {
        description: charge.description,
        amount: ctx.amount,
      });
      await sendEmail({
        to: ctx.client.email,
        subject: mail.subject,
        text: "",
        attachments: [ctx.attachment],
        envelope: {
          locale: ctx.client.locale,
          heading: mail.heading,
          paragraphs: mail.paragraphs,
          button: { label: mail.buttonLabel, url: sent.publicUrl },
        },
      });
      if (ctx.payee) {
        const payeeMail = payeeInvoiceEmail(ctx.client.locale, {
          kind: "invoice",
          payeeName: ctx.payee.name,
          clientName: ctx.client.name ?? "your client",
          description: charge.description,
          amount: ctx.amount,
          due: ctx.dueDateText,
        });
        await sendEmail({
          to: ctx.payee.email,
          subject: payeeMail.subject,
          text: payeeMail.paragraphs.join("\n\n"),
          attachments: [ctx.attachment],
          envelope: {
            locale: ctx.client.locale,
            heading: payeeMail.heading,
            paragraphs: payeeMail.paragraphs,
            button: { label: payeeMail.buttonLabel, url: sent.publicUrl },
          },
        });
      }
    }
  }
  console.log(`[billing] charge invoiced charge=${charge.id}`);
  revalidatePath(back);
  redirect(withQuery(back, "billing=invoicesent"));
}

// BILLING-DASH — the one-tap renewal email: her packages, her words, one
// button to the portal. Respects the per-client renewal suppression; records
// the send on the client's latest completed package.
export async function sendRenewalEmail(clientId: string, formData: FormData) {
  const practitioner = await requirePractitioner();
  const back = backPath(formData);
  if (!emailConfigured()) redirect(withQuery(back, "billing=noemail"));

  const client = await prisma.user.findFirst({
    where: { id: clientId, role: "CLIENT" },
    select: {
      email: true,
      locale: true,
      profile: { select: { renewalMessagesMuted: true } },
    },
  });
  if (!client?.email) redirect(withQuery(back, "billing=renewalfail"));
  if (client.profile?.renewalMessagesMuted) redirect(withQuery(back, "billing=renewalmuted"));

  const skus = await prisma.priceBook.findMany({
    where: { active: true, kind: "PACKAGE" },
    orderBy: { createdAt: "desc" },
  });
  const mail = renewalEmail(pickLocale(client.locale), {
    packages: skus.map((s) => ({
      name: s.name,
      amount: formatMoney(s.amountCents, s.currency),
      sessions: s.sessionsIncluded,
    })),
  });
  await sendEmail({
    to: client.email,
    subject: mail.subject,
    text: mail.paragraphs.join("\n\n"),
    envelope: {
      locale: pickLocale(client.locale),
      heading: mail.heading,
      paragraphs: mail.paragraphs,
      button: { label: mail.buttonLabel, url: `${getBaseUrlSafe()}/space/schedule` },
    },
  });
  // Record on the latest completed package so the dashboard can word its state.
  const latest = await prisma.package.findFirst({
    where: { clientId, status: "COMPLETED" },
    orderBy: { purchasedAt: "desc" },
  });
  if (latest) {
    await prisma.package.update({
      where: { id: latest.id },
      data: { renewalEmailSentAt: new Date() },
    });
  }
  console.log(`[billing] renewal email client=${clientId} by=${practitioner.id}`);
  revalidatePath(back);
  redirect(withQuery(back, "billing=renewalsent"));
}

// BILLING-DASH — an unbilled session that was settled in person: create the
// charge at the effective rate and mark it paid in one motion.
export async function markSessionPaidInPerson(appointmentId: string, formData: FormData) {
  const practitioner = await requirePractitioner();
  const back = backPath(formData);
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt || !appt.clientId) redirect(withQuery(back, "billing=norate"));
  await createChargeForAppointment(appt);
  const charge = await prisma.charge.findUnique({
    where: { appointmentId_kind: { appointmentId, kind: "SESSION" } },
  });
  if (!charge) redirect(withQuery(back, "billing=norate"));
  if (charge.status === "DUE" || charge.status === "PENDING") {
    await setChargeStatus(charge.id, "PAID", practitioner.id, { paidVia: "in-person" });
  }
  revalidatePath(back);
  redirect(withQuery(back, "billing=paid"));
}

// BILLING-DASH — "No charge": the session happened and she chooses to let it
// go. A $0-or-rate WAIVED charge records the decision with her name, and the
// session stops counting as unbilled. Idempotent via the composite unique.
export async function noChargeSession(appointmentId: string, formData: FormData) {
  const practitioner = await requirePractitioner();
  const back = backPath(formData);
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt || !appt.clientId) redirect(withQuery(back, "billing=waived"));
  const existing = await prisma.charge.findUnique({
    where: { appointmentId_kind: { appointmentId, kind: "SESSION" } },
  });
  if (!existing) {
    const rate = await resolveSessionRate(appt.clientId);
    await prisma.charge
      .create({
        data: {
          clientId: appt.clientId,
          appointmentId: appt.id,
          kind: "SESSION",
          priceBookId: rate?.id ?? null,
          description: rate?.name ?? "Session — no charge",
          amountCents: rate?.amountCents ?? 0,
          currency: rate?.currency ?? "USD",
          status: "WAIVED",
          paidVia: "waived",
          lastActionById: practitioner.id,
        },
      })
      .catch(() => undefined); // raced with another writer — the unique guard held
  } else if (existing.status === "DUE" || existing.status === "PENDING") {
    await setChargeStatus(existing.id, "WAIVED", practitioner.id, { paidVia: "waived" });
  }
  console.log(`[billing] no-charge appt=${appointmentId} by=${practitioner.id}`);
  revalidatePath(back);
  redirect(withQuery(back, "billing=waived"));
}

// BILLING-DASH — resend the warm receipt for a collected payment.
export async function resendReceipt(chargeId: string, formData: FormData) {
  await requirePractitioner();
  const back = backPath(formData);
  const charge = await prisma.charge.findUnique({ where: { id: chargeId } });
  if (charge?.status === "PAID") await sendReceiptForCharge(charge);
  revalidatePath(back);
  redirect(withQuery(back, "billing=receiptsent"));
}

// Bill a session that has no charge yet (e.g. booked before rates existed).
export async function billAppointment(appointmentId: string, formData: FormData) {
  await requirePractitioner();
  const back = backPath(formData);
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (appt) {
    await createChargeForAppointment(appt);
    const created = await prisma.charge.findUnique({
      where: { appointmentId_kind: { appointmentId, kind: "SESSION" } },
    });
    if (!created) redirect(withQuery(back, `billing=norate`));
  }
  revalidatePath(back);
  redirect(withQuery(back, `billing=billed`));
}

// Price book — her rates and package SKUs. Kept simple: add and retire.
// C13-PKG — kind="PACKAGE" carries sessionsIncluded (3/6/9 or her own number);
// the SESSION path is unchanged.
export async function addRate(formData: FormData) {
  await requirePractitioner();
  const name = String(formData.get("name") ?? "").trim();
  const amount = Number(formData.get("amount"));
  const stage = String(formData.get("stage") ?? "");
  const kind = String(formData.get("kind") ?? "SESSION") === "PACKAGE" ? "PACKAGE" : "SESSION";
  if (!name || !Number.isFinite(amount) || amount <= 0) redirect(`${RATES}?billing=badrate`);

  let sessionsIncluded: number | null = null;
  if (kind === "PACKAGE") {
    const sessions = Number(formData.get("sessions"));
    if (!Number.isInteger(sessions) || sessions < 1) redirect(`${RATES}?billing=badpackage`);
    sessionsIncluded = sessions;
  }

  await prisma.priceBook.create({
    data: {
      name,
      amountCents: Math.round(amount * 100),
      // Stage-matching only applies to session rates; packages are for anyone.
      stage: kind === "SESSION" && PROGRAM_STAGES.some((s) => s.key === stage) ? stage : null,
      kind,
      sessionsIncluded,
    },
  });
  revalidatePath(RATES);
  redirect(`${RATES}?billing=rate`);
}

export async function retireRate(rateId: string) {
  await requirePractitioner();
  await prisma.priceBook.update({ where: { id: rateId }, data: { active: false } });
  revalidatePath(RATES);
  redirect(RATES);
}

// A reviewed external payment that isn't a session payment (a retail sale,
// a tip, a test) — dismiss it so "Worth a look" stays a real to-do list.
export async function dismissExternalPayment(externalId: string) {
  const practitioner = await requirePractitioner();
  await prisma.externalPayment.updateMany({
    where: { id: externalId, matchedChargeId: null },
    data: { dismissedAt: new Date() },
  });
  console.log(`[billing] external dismissed id=${externalId} by=${practitioner.id}`);
  revalidatePath(LEDGER);
  redirect(`${LEDGER}?billing=dismissed`);
}

// One-tap match: an outside-the-app Square payment settles an awaiting charge.
export async function matchExternalPayment(externalId: string, formData: FormData) {
  const practitioner = await requirePractitioner();
  const chargeId = String(formData.get("chargeId") ?? "");
  const [external, charge] = await Promise.all([
    prisma.externalPayment.findUnique({ where: { id: externalId } }),
    prisma.charge.findUnique({ where: { id: chargeId } }),
  ]);
  if (
    external &&
    !external.matchedChargeId &&
    charge &&
    (charge.status === "DUE" || charge.status === "PENDING")
  ) {
    await prisma.$transaction([
      prisma.charge.update({
        where: { id: charge.id },
        data: {
          status: "PAID",
          paidAt: external.receivedAt,
          paidVia: "square-external",
          squarePaymentId: external.squarePaymentId,
          lastActionById: practitioner.id,
        },
      }),
      prisma.externalPayment.update({
        where: { id: external.id },
        data: { matchedChargeId: charge.id },
      }),
    ]);
    console.log(`[billing] matched external=${external.id} charge=${charge.id} by=${practitioner.id}`);
  }
  revalidatePath(LEDGER);
  redirect(`${LEDGER}?billing=matched`);
}
