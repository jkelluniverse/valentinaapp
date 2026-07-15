import type { ChargeStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { reserveCreditForAppointment, activatePackageForCharge } from "@/lib/packages";

// The billing ledger (C13). The app owns this record of what's due and paid;
// Square owns the actual money movement. Amounts live in integer cents; money
// actions record who acted; logs stay metadata-only (ids, never amounts).

export function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

// Her rate for a client's session: a stage-specific active rate if the client
// sits in that stage, else the newest general session rate. Null = unbilled
// (the ledger surfaces it; she can add a rate and bill it in one tap).
export async function resolveSessionRate(clientId: string) {
  const profile = await prisma.clientProfile.findUnique({
    where: { userId: clientId },
    select: { stage: true },
  });
  const rates = await prisma.priceBook.findMany({
    where: { active: true, kind: "SESSION" },
    orderBy: { createdAt: "desc" },
  });
  if (profile?.stage) {
    const staged = rates.find((r) => r.stage === profile.stage);
    if (staged) return staged;
  }
  return rates.find((r) => !r.stage) ?? null;
}

// Auto-charge on booking (C13.2 + C13-PKG §4): if the client has an ACTIVE
// package with available credits, the session is COVERED — a credit reserves
// and no bill is shown. Otherwise a DUE charge at the resolved rate. Never
// throws — an unbilled session is a ledger nudge, not a booking failure.
export async function createChargeForAppointment(appt: {
  id: string;
  clientId: string | null; // C18 — discovery calls have no client and are free
  startAt: Date;
}): Promise<void> {
  try {
    if (!appt.clientId) return; // free discovery call — never billed
    const existing = await prisma.charge.findUnique({
      where: { appointmentId_kind: { appointmentId: appt.id, kind: "SESSION" } },
    });
    if (existing) return;

    const rate = await resolveSessionRate(appt.clientId);

    // C13-PKG: a package credit covers this session — reserve it and record a
    // COVERED charge (the record row; no money due).
    const pkg = await reserveCreditForAppointment(appt.clientId, appt.id, appt.clientId);
    if (pkg) {
      await prisma.charge.create({
        data: {
          clientId: appt.clientId,
          appointmentId: appt.id,
          kind: "SESSION",
          packageId: pkg.id,
          priceBookId: rate?.id ?? null,
          description: rate?.name ?? "Session",
          amountCents: rate?.amountCents ?? 0,
          currency: rate?.currency ?? "USD",
          status: "COVERED",
        },
      });
      return;
    }

    if (!rate) return; // no price book yet — surfaces as "unbilled"
    await prisma.charge.create({
      data: {
        clientId: appt.clientId,
        appointmentId: appt.id,
        kind: "SESSION",
        priceBookId: rate.id,
        description: rate.name,
        amountCents: rate.amountCents,
        currency: rate.currency,
        status: "DUE",
        dueAt: appt.startAt,
      },
    });
  } catch {
    console.error(`[billing] charge creation failed appt=${appt.id}`);
  }
}

// Cancel the open charge when its session is cancelled. Paid charges stay —
// refunds happen in Square and reflect back via webhook. COVERED charges
// cancel too; the credit release is the ledger's own move (lib/packages).
export async function cancelChargeForAppointment(appointmentId: string, actorId: string) {
  await prisma.charge.updateMany({
    where: { appointmentId, kind: "SESSION", status: { in: ["DUE", "PENDING", "COVERED"] } },
    data: { status: "CANCELED", lastActionById: actorId },
  });
}

export async function setChargeStatus(
  chargeId: string,
  status: ChargeStatus,
  actorId: string,
  extras: { paidVia?: string; squarePaymentId?: string } = {},
) {
  const charge = await prisma.charge.update({
    where: { id: chargeId },
    data: {
      status,
      lastActionById: actorId,
      ...(status === "PAID" ? { paidAt: new Date(), paidVia: extras.paidVia ?? null } : {}),
      ...(extras.squarePaymentId ? { squarePaymentId: extras.squarePaymentId } : {}),
    },
  });
  console.log(`[billing] charge=${chargeId} status=${status} by=${actorId}`);
  // C13-PKG §7/§8 — a paid package purchase activates its package (idempotent).
  if (status === "PAID" && charge.kind === "PACKAGE") {
    await activatePackageForCharge(charge);
  }
  return charge;
}

// C10-POLICY §4 — the late fee, riding the existing rails. Idempotent: one
// LATE_FEE per appointment (the composite unique is the guard); a late
// reschedule that's later late-cancelled doesn't stack a second fee.
export async function applyLateFee(args: {
  appointmentId: string;
  clientId: string;
  reason: "LATE_RESCHEDULE" | "LATE_CANCEL" | "NO_SHOW";
  actorId: string;
  lateFeeCents: number;
  currency?: string;
}): Promise<{ created: boolean; chargeId: string | null }> {
  if (args.lateFeeCents <= 0) return { created: false, chargeId: null };
  try {
    const existing = await prisma.charge.findUnique({
      where: { appointmentId_kind: { appointmentId: args.appointmentId, kind: "LATE_FEE" } },
    });
    if (existing) return { created: false, chargeId: existing.id };
    const labels: Record<string, string> = {
      LATE_RESCHEDULE: "Late reschedule fee",
      LATE_CANCEL: "Late cancellation fee",
      NO_SHOW: "Missed session fee",
    };
    const charge = await prisma.charge.create({
      data: {
        clientId: args.clientId,
        appointmentId: args.appointmentId,
        kind: "LATE_FEE",
        description: labels[args.reason],
        amountCents: args.lateFeeCents,
        currency: args.currency ?? "USD",
        status: "DUE",
        dueAt: new Date(),
        feeReason: args.reason,
        lastActionById: args.actorId,
      },
    });
    console.log(`[billing] late fee charge=${charge.id} appt=${args.appointmentId} reason=${args.reason}`);
    return { created: true, chargeId: charge.id };
  } catch {
    // Unique race — the fee already exists. Idempotency, working as intended.
    const existing = await prisma.charge.findUnique({
      where: { appointmentId_kind: { appointmentId: args.appointmentId, kind: "LATE_FEE" } },
    });
    return { created: false, chargeId: existing?.id ?? null };
  }
}

// Ledger rollups for /practitioner/billing — words + one honest number each.
export async function ledgerSummary(now = new Date()) {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [collected, awaiting, unbilled] = await Promise.all([
    prisma.charge.aggregate({
      where: { status: "PAID", paidAt: { gte: monthStart } },
      _sum: { amountCents: true },
    }),
    prisma.charge.aggregate({
      where: { status: { in: ["DUE", "PENDING"] } },
      _sum: { amountCents: true },
      _count: true,
    }),
    prisma.appointment.count({
      where: {
        status: { in: ["SCHEDULED", "COMPLETED"] },
        startAt: { gte: monthStart },
        // no charge row → unbilled
        NOT: { id: { in: (await prisma.charge.findMany({
          where: { appointmentId: { not: null }, kind: "SESSION" },
          select: { appointmentId: true },
        })).map((c) => c.appointmentId!) } },
      },
    }),
  ]);
  return {
    collectedCents: collected._sum.amountCents ?? 0,
    awaitingCents: awaiting._sum.amountCents ?? 0,
    awaitingCount: awaiting._count,
    unbilledCount: unbilled,
  };
}
