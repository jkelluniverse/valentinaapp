"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { setChargeStatus, createChargeForAppointment, formatMoney } from "@/lib/billing";
import { sendEmail, emailConfigured } from "@/lib/notify";
import { pickLocale, paymentReminderEmail } from "@/lib/email-copy";
import { PROGRAM_STAGES } from "@/lib/program-config";

const LEDGER = "/practitioner/billing";

function backPath(formData?: FormData): string {
  const back = formData ? String(formData.get("back") ?? "") : "";
  return back.startsWith("/practitioner") ? back : LEDGER;
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
  redirect(`${back}?billing=paid`);
}

export async function waiveCharge(chargeId: string, formData: FormData) {
  const practitioner = await requirePractitioner();
  const charge = await prisma.charge.findUnique({ where: { id: chargeId } });
  if (charge && (charge.status === "DUE" || charge.status === "PENDING")) {
    await setChargeStatus(chargeId, "WAIVED", practitioner.id, { paidVia: "waived" });
  }
  const back = backPath(formData);
  revalidatePath(back);
  redirect(`${back}?billing=waived`);
}

// A warm nudge by email — rides the C10 notification path; quietly skipped
// when email isn't configured.
export async function remindCharge(chargeId: string, formData: FormData) {
  await requirePractitioner();
  const back = backPath(formData);
  if (!emailConfigured()) redirect(`${back}?billing=noemail`);

  const charge = await prisma.charge.findUnique({ where: { id: chargeId } });
  if (charge && charge.status === "DUE") {
    const client = await prisma.user.findUnique({
      where: { id: charge.clientId },
      select: { email: true, name: true, locale: true },
    });
    if (client?.email) {
      // AMD-05 — the reminder renders in the client's language; C13-PKG §9 —
      // lastRemindedAt recorded so nothing double-nudges.
      const mail = paymentReminderEmail(pickLocale(client.locale), {
        description: charge.description,
        amount: formatMoney(charge.amountCents, charge.currency),
      });
      await sendEmail({ to: client.email, subject: mail.subject, text: mail.text });
      await prisma.charge.update({
        where: { id: charge.id },
        data: { lastRemindedAt: new Date() },
      });
      console.log(`[billing] reminder charge=${charge.id}`);
    }
  }
  revalidatePath(back);
  redirect(`${back}?billing=reminded`);
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
    if (!created) redirect(`${back}?billing=norate`);
  }
  revalidatePath(back);
  redirect(`${back}?billing=billed`);
}

// Price book — her rates. Kept simple: add and retire.
export async function addRate(formData: FormData) {
  await requirePractitioner();
  const name = String(formData.get("name") ?? "").trim();
  const amount = Number(formData.get("amount"));
  const stage = String(formData.get("stage") ?? "");
  if (!name || !Number.isFinite(amount) || amount <= 0) redirect(`${LEDGER}?billing=badrate`);
  await prisma.priceBook.create({
    data: {
      name,
      amountCents: Math.round(amount * 100),
      stage: PROGRAM_STAGES.some((s) => s.key === stage) ? stage : null,
      kind: "SESSION",
    },
  });
  revalidatePath(LEDGER);
  redirect(`${LEDGER}?billing=rate`);
}

export async function retireRate(rateId: string) {
  await requirePractitioner();
  await prisma.priceBook.update({ where: { id: rateId }, data: { active: false } });
  revalidatePath(LEDGER);
  redirect(LEDGER);
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
