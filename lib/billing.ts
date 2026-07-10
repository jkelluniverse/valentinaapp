import type { ChargeStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

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

// Auto-charge on booking (C13.2): a DUE charge at the resolved rate, due by
// the session day. Never throws — an unbilled session is a ledger nudge, not
// a booking failure.
export async function createChargeForAppointment(appt: {
  id: string;
  clientId: string;
  startAt: Date;
}): Promise<void> {
  try {
    const existing = await prisma.charge.findUnique({ where: { appointmentId: appt.id } });
    if (existing) return;
    const rate = await resolveSessionRate(appt.clientId);
    if (!rate) return; // no price book yet — surfaces as "unbilled"
    await prisma.charge.create({
      data: {
        clientId: appt.clientId,
        appointmentId: appt.id,
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
// refunds happen in Square and reflect back via webhook.
export async function cancelChargeForAppointment(appointmentId: string, actorId: string) {
  await prisma.charge.updateMany({
    where: { appointmentId, status: { in: ["DUE", "PENDING"] } },
    data: { status: "CANCELED", lastActionById: actorId },
  });
}

export async function setChargeStatus(
  chargeId: string,
  status: ChargeStatus,
  actorId: string,
  extras: { paidVia?: string; squarePaymentId?: string } = {},
) {
  await prisma.charge.update({
    where: { id: chargeId },
    data: {
      status,
      lastActionById: actorId,
      ...(status === "PAID" ? { paidAt: new Date(), paidVia: extras.paidVia ?? null } : {}),
      ...(extras.squarePaymentId ? { squarePaymentId: extras.squarePaymentId } : {}),
    },
  });
  console.log(`[billing] charge=${chargeId} status=${status} by=${actorId}`);
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
          where: { appointmentId: { not: null } },
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
