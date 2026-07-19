"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SessionLocation } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { getPractitioner, getOrCreateConfig, isSlotOpen } from "@/lib/schedule";
import { createAppointment, rescheduleAppointment, cancelAppointment } from "@/lib/appointments";
import {
  ensureSquareCustomer,
  sendSquareInvoice,
  squareConfigured,
  getSquareCustomer,
  updateSquareCustomer,
  listCardsOnFile,
  createCardOnFile,
  createSquarePayment,
} from "@/lib/square";
import { sendEmail } from "@/lib/notify";
import { invoiceEmail, payeeInvoiceEmail } from "@/lib/email-copy";
import { chargeEmailContext } from "@/lib/invoice-context";
import { getBaseUrlSafe } from "@/lib/base-url";
import { setChargeStatus } from "@/lib/billing";
import { timeValueToMinutes } from "@/lib/schedule-meta";
import { zonedWallToUtc } from "@/lib/schedule";
import { PROGRAM_STAGES, programStageLabel } from "@/lib/program-config";
import { record } from "@/lib/record";

// Return to the same tab when a form is submitted from within the Portrait.
function returnTo(clientId: string, formData: FormData, query: string): string {
  const base = `/practitioner/clients/${clientId}`;
  const back = String(formData.get("back") ?? "");
  const target = back.startsWith(base) ? back : base;
  return `${target}${target.includes("?") ? "&" : "?"}${query}`;
}

// Manual assignment (C3 spec §3 default). Recurring delivery is deferred —
// scheduleRule stays null until the scheduler pass.
export async function assignPrompt(clientId: string, formData: FormData) {
  const practitioner = await requirePractitioner();

  const client = await prisma.user.findFirst({
    where: { id: clientId, role: "CLIENT" },
    select: { id: true },
  });
  if (!client) redirect("/practitioner/clients");

  const promptId = String(formData.get("promptId") ?? "");
  const prompt = await prisma.prompt.findFirst({
    where: { id: promptId, active: true },
    select: { id: true },
  });
  const back = `/practitioner/clients/${clientId}`;
  if (!prompt) redirect(returnTo(clientId, formData, "error=prompt"));

  const rawDue = String(formData.get("dueAt") ?? "").trim();
  const parsedDue = rawDue ? new Date(rawDue) : null;
  const dueAt = parsedDue && !isNaN(parsedDue.getTime()) ? parsedDue : null;

  await prisma.assignment.create({
    data: {
      promptId: prompt.id,
      clientId: client.id,
      assignedById: practitioner.id,
      dueAt,
    },
  });

  revalidatePath(back);
  redirect(returnTo(clientId, formData, "sent=1"));
}

// Assign a worksheet (C9) — same manual pattern as prompts.
export async function assignWorksheet(clientId: string, formData: FormData) {
  const practitioner = await requirePractitioner();

  const client = await prisma.user.findFirst({
    where: { id: clientId, role: "CLIENT" },
    select: { id: true },
  });
  if (!client) redirect("/practitioner/clients");

  const worksheetId = String(formData.get("worksheetId") ?? "");
  const worksheet = await prisma.worksheet.findFirst({
    where: { id: worksheetId, active: true },
    select: { id: true },
  });
  const back = `/practitioner/clients/${clientId}`;
  if (!worksheet) redirect(returnTo(clientId, formData, "error=prompt"));

  const rawDue = String(formData.get("dueAt") ?? "").trim();
  const parsedDue = rawDue ? new Date(rawDue) : null;
  const dueAt = parsedDue && !isNaN(parsedDue.getTime()) ? parsedDue : null;

  await prisma.worksheetAssignment.create({
    data: {
      worksheetId: worksheet.id,
      clientId: client.id,
      assignedById: practitioner.id,
      dueAt,
    },
  });

  revalidatePath(back);
  redirect(returnTo(clientId, formData, "sent=1"));
}

// C13.1 — move a client between program stages. Practitioner-only; history
// appends to StageChange and to the C4 record so the journey shows it.
export async function setClientStage(clientId: string, formData: FormData) {
  const practitioner = await requirePractitioner();
  const toStage = String(formData.get("stage") ?? "");
  if (!PROGRAM_STAGES.some((s) => s.key === toStage)) {
    redirect(`/practitioner/clients/${clientId}`);
  }
  const note = String(formData.get("note") ?? "").trim() || null;

  const client = await prisma.user.findFirst({
    where: { id: clientId, role: "CLIENT" },
    select: { id: true },
  });
  if (!client) redirect("/practitioner/clients");

  const profile = await prisma.clientProfile.upsert({
    where: { userId: clientId },
    create: { userId: clientId },
    update: {},
  });
  if (profile.stage === toStage) redirect(`/practitioner/clients/${clientId}`);

  const change = await prisma.$transaction(async (tx) => {
    const c = await tx.stageChange.create({
      data: {
        clientId,
        fromStage: profile.stage,
        toStage,
        changedById: practitioner.id,
        note,
      },
    });
    await tx.clientProfile.update({ where: { userId: clientId }, data: { stage: toStage } });
    return c;
  });

  await record.append({
    clientId,
    kind: "NOTE",
    occurredAt: change.changedAt,
    title: `Moved to ${programStageLabel(toStage)}`,
    summary: note ?? `Program stage set to ${programStageLabel(toStage)}.`,
    tags: [],
    sourceType: "StageChange",
    sourceId: change.id,
  });

  revalidatePath(`/practitioner/clients/${clientId}`);
  redirect(returnTo(clientId, formData, "staged=1"));
}

// C10.4 — the end-of-session habit: book the client's next session on the spot.
// Two paths: a slot from the grid, or an "any time" override (date + time in the
// practitioner's timezone) for booking outside standard availability.
export async function bookForClient(clientId: string, formData: FormData) {
  await requirePractitioner();
  const practitioner = await getPractitioner();
  if (!practitioner) redirect("/practitioner/clients");

  const client = await prisma.user.findFirst({
    where: { id: clientId, role: "CLIENT" },
    select: { id: true },
  });
  const bookPath = `/practitioner/clients/${clientId}/book`;
  if (!client) redirect("/practitioner/clients");

  const config = await getOrCreateConfig(practitioner.id);
  const now = new Date();
  const mode = String(formData.get("mode") ?? "slot");
  const location: SessionLocation =
    formData.get("location") === "IN_PERSON" ? "IN_PERSON" : "VIRTUAL";
  const note = String(formData.get("note") ?? "").trim() || null;

  let startAt: Date | null = null;

  if (mode === "anytime") {
    // Free-form date + time in the practitioner's timezone.
    const dateStr = String(formData.get("date") ?? "");
    const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
    const minutes = timeValueToMinutes(String(formData.get("time") ?? ""));
    if (!dm || minutes == null) redirect(`${bookPath}?error=anytime`);
    startAt = zonedWallToUtc(
      Number(dm[1]),
      Number(dm[2]) - 1,
      Number(dm[3]),
      minutes,
      config.timezone,
    );
  } else {
    const iso = String(formData.get("start") ?? "");
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) redirect(`${bookPath}?error=slot`);
    // A grid slot must still be open; "any time" bypasses that check by design.
    if (!(await isSlotOpen(practitioner.id, parsed, now))) redirect(`${bookPath}?error=taken`);
    startAt = parsed;
  }

  const endAt = new Date(startAt.getTime() + config.sessionMinutes * 60000);
  const result = await createAppointment({
    practitionerId: practitioner.id,
    clientId: client.id,
    startAt,
    endAt,
    bookedBy: "practitioner",
    location,
    clientNote: note,
  });
  if (!result.ok) redirect(`${bookPath}?error=taken`);

  revalidatePath(`/practitioner/clients/${clientId}`);
  redirect(`/practitioner/clients/${clientId}?booked=1`);
}

// C13-PKG §8 — send a Square invoice from the Portrait's Billing tab: a
// package SKU, a session rate, or a custom line, with an optional note in her
// voice. Square hosts payment and delivery; the webhook flips PAID (and a paid
// PACKAGE charge activates its package on its own).
export async function sendInvoice(clientId: string, formData: FormData) {
  const practitioner = await requirePractitioner();
  const base = `/practitioner/clients/${clientId}`;
  const rawBack = String(formData.get("back") ?? "");
  const target = rawBack.startsWith(base) ? rawBack : `${base}?tab=billing`;
  const backWith = (q: string) => `${target}${target.includes("?") ? "&" : "?"}${q}`;

  if (!squareConfigured()) redirect(backWith("invoice=config"));

  const client = await prisma.user.findFirst({
    where: { id: clientId, role: "CLIENT" },
    select: { id: true, name: true, email: true },
  });
  if (!client) redirect("/practitioner/clients");

  // Either a price book line (package or session rate) or a custom one.
  const priceBookId = String(formData.get("priceBookId") ?? "");
  const sku = priceBookId
    ? await prisma.priceBook.findFirst({ where: { id: priceBookId, active: true } })
    : null;

  let description: string;
  let amountCents: number;
  let currency = "USD";
  if (sku) {
    description = sku.name;
    amountCents = sku.amountCents;
    currency = sku.currency;
  } else {
    description = String(formData.get("description") ?? "").trim();
    const amount = Number(formData.get("amount"));
    if (!description || !Number.isFinite(amount) || amount <= 0) {
      redirect(backWith("invoice=bad"));
    }
    amountCents = Math.round(amount * 100);
  }

  const dueRaw = String(formData.get("dueDate") ?? "").trim();
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(dueRaw) ? dueRaw : null;
  const note = String(formData.get("note") ?? "").trim() || null;

  const squareCustomerId = await ensureSquareCustomer(client);
  if (!squareCustomerId) redirect(backWith("invoice=square"));

  const charge = await prisma.charge.create({
    data: {
      clientId: client.id,
      kind: sku?.kind === "PACKAGE" ? "PACKAGE" : "CUSTOM",
      priceBookId: sku?.id ?? null,
      description,
      amountCents,
      currency,
      status: "DUE",
      dueAt: dueDate ? new Date(`${dueDate}T00:00:00Z`) : new Date(),
      lastActionById: practitioner.id,
    },
  });

  const sent = await sendSquareInvoice({
    chargeId: charge.id,
    squareCustomerId,
    title: description,
    amountCents,
    currency,
    dueDate,
    note,
  });
  if (!sent.ok) {
    // The invoice never went out — take the charge back out of the ledger.
    await prisma.charge.delete({ where: { id: charge.id } }).catch(() => undefined);
    redirect(backWith("invoice=failed"));
  }
  const updated = await prisma.charge.update({
    where: { id: charge.id },
    data: {
      squareInvoiceId: sent.invoiceId,
      squareInvoiceUrl: sent.publicUrl,
      lastActionById: practitioner.id,
    },
  });
  // The email that carries the invoice is OURS (branded Envelope); Square
  // hosts only the payment page behind the button. The PDF invoice rides
  // along as an attachment, and the payee — when one is set — gets their own
  // copy of both.
  if (sent.publicUrl) {
    const ctx = await chargeEmailContext(updated, getBaseUrlSafe(), { note });
    if (ctx.client?.email) {
      const mail = invoiceEmail(ctx.client.locale, {
        description,
        amount: ctx.amount,
        note,
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
          note: note || null,
          button: { label: mail.buttonLabel, url: sent.publicUrl },
        },
      });
    }
    if (ctx.payee) {
      const payeeMail = payeeInvoiceEmail(ctx.client?.locale ?? "en", {
        kind: "invoice",
        payeeName: ctx.payee.name,
        clientName: ctx.client?.name ?? client.name ?? "your client",
        description,
        amount: ctx.amount,
        due: ctx.dueDateText,
      });
      await sendEmail({
        to: ctx.payee.email,
        subject: payeeMail.subject,
        text: payeeMail.paragraphs.join("\n\n"),
        attachments: [ctx.attachment],
        envelope: {
          locale: ctx.client?.locale ?? "en",
          heading: payeeMail.heading,
          paragraphs: payeeMail.paragraphs,
          note: note || null,
          button: { label: payeeMail.buttonLabel, url: sent.publicUrl },
        },
      });
    }
  }
  console.log(`[billing] invoice sent charge=${charge.id} by=${practitioner.id}`);

  revalidatePath(`/practitioner/clients/${clientId}`);
  redirect(backWith("invoice=sent"));
}

export async function cancelForClient(clientId: string, appointmentId: string) {
  const practitioner = await requirePractitioner();
  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (appt && appt.clientId === clientId && appt.status === "SCHEDULED") {
    await cancelAppointment(appointmentId, practitioner.id);
  }
  revalidatePath(`/practitioner/clients/${clientId}`);
  redirect(`/practitioner/clients/${clientId}?booked=cancelled`);
}

export async function rescheduleForClient(clientId: string, appointmentId: string, formData: FormData) {
  await requirePractitioner();
  const practitioner = await getPractitioner();
  if (!practitioner) redirect("/practitioner/clients");

  const appt = await prisma.appointment.findUnique({ where: { id: appointmentId } });
  if (!appt || appt.clientId !== clientId) redirect(`/practitioner/clients/${clientId}`);

  const config = await getOrCreateConfig(practitioner.id);
  const iso = String(formData.get("start") ?? "");
  const startAt = new Date(iso);
  if (Number.isNaN(startAt.getTime())) redirect(`/practitioner/clients/${clientId}?error=slot`);
  const endAt = new Date(startAt.getTime() + config.sessionMinutes * 60000);

  const result = await rescheduleAppointment(appointmentId, practitioner.id, startAt, endAt);
  if (!result.ok) redirect(`/practitioner/clients/${clientId}?error=taken`);

  revalidatePath(`/practitioner/clients/${clientId}`);
  redirect(`/practitioner/clients/${clientId}?booked=moved`);
}

// ---------------------------------------------------------------------------
// Square billing profile & cards on file. She manages a client's billing
// details without leaving the Portrait: view/update the Square customer
// (incl. mailing address), keep cards on file, and settle due charges with a
// stored card. Card data is tokenized in the browser — never touches us.

export async function updateSquareProfile(clientId: string, formData: FormData) {
  const practitioner = await requirePractitioner();
  const back = String(formData.get("back") ?? `/practitioner/clients/${clientId}?tab=billing`);
  const link = await prisma.squareCustomerLink.findUnique({ where: { clientId } });
  if (!link) redirect(`${back}&billing=squarefail`);

  const ok = await updateSquareCustomer(link.squareCustomerId, {
    givenName: String(formData.get("givenName") ?? "").trim() || undefined,
    familyName: String(formData.get("familyName") ?? "").trim() || undefined,
    email: String(formData.get("email") ?? "").trim() || undefined,
    phone: String(formData.get("phone") ?? "").trim(),
    addressLine1: String(formData.get("addressLine1") ?? "").trim(),
    addressLine2: String(formData.get("addressLine2") ?? "").trim(),
    city: String(formData.get("city") ?? "").trim(),
    state: String(formData.get("state") ?? "").trim(),
    postalCode: String(formData.get("postalCode") ?? "").trim(),
  });
  console.log(`[billing] square profile ${ok ? "updated" : "update FAILED"} client=${clientId} by=${practitioner.id}`);
  revalidatePath(`/practitioner/clients/${clientId}`);
  redirect(`${back}&billing=${ok ? "squaresaved" : "squarefail"}`);
}

// Ensure the Square customer exists (first card for a brand-new profile).
export async function linkSquareCustomer(clientId: string, formData: FormData) {
  await requirePractitioner();
  const back = String(formData.get("back") ?? `/practitioner/clients/${clientId}?tab=billing`);
  const client = await prisma.user.findFirst({
    where: { id: clientId, role: "CLIENT" },
    select: { id: true, name: true, email: true },
  });
  if (client) await ensureSquareCustomer(client);
  revalidatePath(`/practitioner/clients/${clientId}`);
  redirect(back);
}

export async function saveCardOnFile(
  clientId: string,
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  const practitioner = await requirePractitioner();
  const client = await prisma.user.findFirst({
    where: { id: clientId, role: "CLIENT" },
    select: { id: true, name: true, email: true },
  });
  if (!client) return { ok: false, error: "not-found" };
  const squareCustomerId = await ensureSquareCustomer(client);
  if (!squareCustomerId) return { ok: false, error: "config" };
  const saved = await createCardOnFile({
    customerId: squareCustomerId,
    token,
    cardholderName: client.name,
  });
  if (!saved.ok) return { ok: false, error: "declined" };
  await prisma.squareCustomerLink.update({
    where: { clientId },
    data: { cardOnFile: true },
  });
  console.log(`[billing] card on file saved client=${clientId} by=${practitioner.id}`);
  return { ok: true };
}

// Payee — a different person who covers this client's bills (a parent, a
// partner, an employer). When set, invoice emails and payment reminders are
// also sent to them, with the PDF invoice attached. Clearing both fields
// removes the payee.
export async function savePayee(clientId: string, formData: FormData) {
  const practitioner = await requirePractitioner();
  const back = String(formData.get("back") ?? `/practitioner/clients/${clientId}?tab=billing`);
  const name = String(formData.get("payeeName") ?? "").trim();
  const email = String(formData.get("payeeEmail") ?? "").trim().toLowerCase();
  if ((name && !email) || (email && !name) || (email && !/^\S+@\S+\.\S+$/.test(email))) {
    redirect(`${back}&billing=payeebad`);
  }
  await prisma.clientProfile.upsert({
    where: { userId: clientId },
    create: { userId: clientId, payeeName: name || null, payeeEmail: email || null },
    update: { payeeName: name || null, payeeEmail: email || null },
  });
  console.log(`[billing] payee ${name ? "set" : "cleared"} client=${clientId} by=${practitioner.id}`);
  revalidatePath(`/practitioner/clients/${clientId}`);
  redirect(`${back}&billing=${name ? "payeesaved" : "payeecleared"}`);
}

// Settle a due charge with the stored card (merchant-initiated, card on file).
export async function chargeCardOnFile(chargeId: string, formData: FormData) {
  const practitioner = await requirePractitioner();
  const back = String(formData.get("back") ?? "/practitioner/billing");
  const cardId = String(formData.get("cardId") ?? "");
  const charge = await prisma.charge.findUnique({ where: { id: chargeId } });
  if (!charge || !cardId || !(charge.status === "DUE" || charge.status === "PENDING")) {
    redirect(`${back}&billing=chargefail`);
  }
  const link = await prisma.squareCustomerLink.findUnique({
    where: { clientId: charge.clientId },
  });
  if (!link) redirect(`${back}&billing=chargefail`);

  const paid = await createSquarePayment({
    token: cardId, // a stored card id is a valid source_id with customer_id
    amountCents: charge.amountCents,
    currency: charge.currency,
    chargeId: charge.id,
    squareCustomerId: link.squareCustomerId,
  });
  if (!paid.ok || (paid.status !== "COMPLETED" && paid.status !== "APPROVED")) {
    redirect(`${back}&billing=chargefail`);
  }
  await setChargeStatus(chargeId, "PAID", practitioner.id, {
    paidVia: "card-on-file",
    squarePaymentId: paid.paymentId,
  });
  revalidatePath(back.split("?")[0]);
  redirect(`${back}&billing=charged`);
}
