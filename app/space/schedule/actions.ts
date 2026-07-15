"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth-guards";
import { hasConsent } from "@/lib/consent";
import { getPractitioner, isSlotOpen, getOrCreateConfig } from "@/lib/schedule";
import {
  createAppointment,
  clientCancelWithPolicy,
  clientRescheduleWithPolicy,
} from "@/lib/appointments";
import { ensureSquareCustomer, createSquarePayment, squareConfigured } from "@/lib/square";
import { setChargeStatus } from "@/lib/billing";

const PATH = "/space/schedule";

// Client self-serve booking. Consent (C1) is required before booking, matching
// every other client write path.
export async function bookSlot(formData: FormData) {
  const user = await requireClient();
  if (!(await hasConsent(user.id))) redirect("/space/consent");

  const startIso = String(formData.get("start") ?? "");
  const startAt = new Date(startIso);
  if (Number.isNaN(startAt.getTime())) redirect(`${PATH}?error=slot`);

  const practitioner = await getPractitioner();
  if (!practitioner) redirect(`${PATH}?error=slot`);

  const now = new Date();
  // Re-validate server-side: the slot must still be open on the grid.
  if (!(await isSlotOpen(practitioner.id, startAt, now))) {
    redirect(`${PATH}?error=taken`);
  }

  const config = await getOrCreateConfig(practitioner.id);
  const endAt = new Date(startAt.getTime() + config.sessionMinutes * 60000);
  const note = String(formData.get("note") ?? "").trim() || null;

  const result = await createAppointment({
    practitionerId: practitioner.id,
    clientId: user.id,
    startAt,
    endAt,
    bookedBy: "client",
    location: "VIRTUAL",
    clientNote: note,
  });
  if (!result.ok) redirect(`${PATH}?error=taken`);

  revalidatePath(PATH);
  redirect(`${PATH}?booked=1`);
}

// C13.4 — spend the single-use card token from Square's browser form. Scoped
// hard to the caller's own open charge; the token is all that ever reaches us.
export async function payChargeWithToken(
  chargeId: string,
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireClient();
  if (!squareConfigured()) return { ok: false, error: "config" };
  if (!token || typeof token !== "string") return { ok: false, error: "token" };

  const charge = await prisma.charge.findFirst({
    where: { id: chargeId, clientId: user.id, status: { in: ["DUE", "PENDING"] } },
  });
  if (!charge) return { ok: false, error: "charge" };

  const squareCustomerId = await ensureSquareCustomer({
    id: user.id,
    name: user.name,
    email: user.email,
  });

  const result = await createSquarePayment({
    token,
    amountCents: charge.amountCents,
    currency: charge.currency,
    chargeId: charge.id,
    squareCustomerId,
  });
  if (!result.ok) return { ok: false, error: "declined" };

  if (result.status === "COMPLETED" || result.status === "APPROVED") {
    await setChargeStatus(charge.id, "PAID", user.id, {
      paidVia: "portal-card",
      squarePaymentId: result.paymentId,
    });
  } else {
    // Rare async statuses — the webhook confirms; show it as pending meanwhile.
    await prisma.charge.update({
      where: { id: charge.id },
      data: { status: "PENDING", squarePaymentId: result.paymentId, lastActionById: user.id },
    });
  }
  revalidatePath(PATH);
  return { ok: true }; // the card form navigates on success
}

// C13-PKG §10 — buy a package from the portal with the Square card form. The
// DUE charge is created (or reused on a retry — no duplicates) before the
// token is spent; a PAID package charge auto-activates the package.
export async function purchasePackage(
  priceBookId: string,
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireClient();
  if (!squareConfigured()) return { ok: false, error: "config" };
  if (!token || typeof token !== "string") return { ok: false, error: "token" };

  const sku = await prisma.priceBook.findFirst({
    where: { id: priceBookId, active: true, kind: "PACKAGE" },
  });
  if (!sku) return { ok: false, error: "sku" };

  // Reuse an existing open charge for this SKU (retry after a decline, or an
  // invoice she already sent) so a second attempt never doubles the ledger.
  let charge = await prisma.charge.findFirst({
    where: { clientId: user.id, kind: "PACKAGE", priceBookId: sku.id, status: "DUE" },
  });
  if (!charge) {
    charge = await prisma.charge.create({
      data: {
        clientId: user.id,
        kind: "PACKAGE",
        priceBookId: sku.id,
        description: sku.name,
        amountCents: sku.amountCents,
        currency: sku.currency,
        status: "DUE",
        dueAt: new Date(),
      },
    });
  }

  const squareCustomerId = await ensureSquareCustomer({
    id: user.id,
    name: user.name,
    email: user.email,
  });

  const result = await createSquarePayment({
    token,
    amountCents: charge.amountCents,
    currency: charge.currency,
    chargeId: charge.id,
    squareCustomerId,
  });
  if (!result.ok) return { ok: false, error: "declined" };

  if (result.status === "COMPLETED" || result.status === "APPROVED") {
    // PAID on a PACKAGE charge activates the package automatically.
    await setChargeStatus(charge.id, "PAID", user.id, {
      paidVia: "portal-card",
      squarePaymentId: result.paymentId,
    });
  } else {
    await prisma.charge.update({
      where: { id: charge.id },
      data: { status: "PENDING", squarePaymentId: result.paymentId, lastActionById: user.id },
    });
  }
  revalidatePath(PATH);
  return { ok: true }; // the card form navigates to /space/schedule?package=1
}

// C10-POLICY §2 — cancel with the policy enforced server-side. The cancel page
// decides which sheet to show; the service layer is the real gate: inside the
// window, feeConfirmed must be explicitly true.
export async function cancelMyAppointmentWithPolicy(
  appointmentId: string,
  feeConfirmed: boolean,
) {
  const user = await requireClient();
  const result = await clientCancelWithPolicy(appointmentId, { id: user.id }, feeConfirmed);

  if (!result.ok) {
    // Crossed the boundary between render and click — re-show the fee sheet.
    if (result.error === "fee-confirm") {
      redirect(`${PATH}/cancel/${appointmentId}?policy=1`);
    }
    redirect(PATH);
  }
  revalidatePath(PATH);
  redirect(`${PATH}?cancelled=1${result.feeApplied ? "&fee=1" : ""}`);
}

// C10-POLICY §2 — reschedule with the policy judged against the ORIGINAL time.
export async function rescheduleMyAppointment(appointmentId: string, formData: FormData) {
  const user = await requireClient();
  const base = `${PATH}/reschedule/${appointmentId}`;

  const startIso = String(formData.get("start") ?? "");
  const newStart = new Date(startIso);
  if (Number.isNaN(newStart.getTime())) redirect(base);
  const feeConfirmed = String(formData.get("feeConfirmed") ?? "") === "1";

  const result = await clientRescheduleWithPolicy(
    appointmentId,
    { id: user.id },
    newStart,
    feeConfirmed,
  );

  if (!result.ok) {
    if (result.error === "fee-confirm") {
      redirect(`${base}?start=${encodeURIComponent(newStart.toISOString())}&policy=1`);
    }
    if (result.error === "slot-taken" || result.error === "conflict") {
      redirect(`${base}?error=taken`);
    }
    redirect(PATH);
  }
  revalidatePath(PATH);
  redirect(`${PATH}?rescheduled=1${result.feeApplied ? "&fee=1" : ""}`);
}
