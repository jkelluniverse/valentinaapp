import type { Package, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// C13-PACKAGES — the credit ledger. Append-only truth: counters are DERIVED,
// never stored. available = sessionsTotal − CONSUMED − RESERVED; the ledger
// decides. Every transition carries an actor + reason. Money is where silent
// bugs cost trust — reservation on booking is what prevents the classic
// "1 credit covers 3 bookings" bug.

type Tx = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export type PackageCounters = {
  used: number;
  reserved: number;
  available: number;
};

export function packageCounters(pkg: {
  sessionsTotal: number;
  credits: { state: string }[];
}): PackageCounters {
  const used = pkg.credits.filter((c) => c.state === "CONSUMED").length;
  const reserved = pkg.credits.filter((c) => c.state === "RESERVED").length;
  return { used, reserved, available: Math.max(0, pkg.sessionsTotal - used - reserved) };
}

// ACTIVE packages with availability, in consumption order: soonest-expiring
// first, then oldest (fairest to the client — §4).
export async function activePackagesWithAvailability(clientId: string, db: Tx = prisma) {
  const packages = await (db as PrismaClient).package.findMany({
    where: { clientId, status: "ACTIVE" },
    include: { credits: { select: { state: true } } },
  });
  return packages
    .map((p) => ({ pkg: p, counters: packageCounters(p) }))
    .filter((x) => x.counters.available > 0)
    .sort((a, b) => {
      const ax = a.pkg.expiresAt?.getTime() ?? Infinity;
      const bx = b.pkg.expiresAt?.getTime() ?? Infinity;
      if (ax !== bx) return ax - bx;
      return a.pkg.purchasedAt.getTime() - b.pkg.purchasedAt.getTime();
    });
}

// On booking (§4): reserve a credit from the best available package.
// Returns the package the credit came from, or null (→ normal DUE charge).
// Serialized in a transaction so two simultaneous bookings can't both take
// the last credit (the appointmentId unique is the final backstop).
export async function reserveCreditForAppointment(
  clientId: string,
  appointmentId: string,
  actorId: string,
): Promise<Package | null> {
  try {
    return await prisma.$transaction(async (tx) => {
      const candidates = await activePackagesWithAvailability(clientId, tx);
      const best = candidates[0];
      if (!best) return null;
      await tx.sessionCredit.create({
        data: {
          packageId: best.pkg.id,
          appointmentId,
          state: "RESERVED",
          actorId,
        },
      });
      console.log(`[packages] credit reserved pkg=${best.pkg.id} appt=${appointmentId}`);
      return best.pkg;
    });
  } catch {
    console.error(`[packages] reserve failed appt=${appointmentId}`);
    return null;
  }
}

// On completion (§4/§5): RESERVED → CONSUMED; then the package may complete.
export async function consumeCreditForAppointment(
  appointmentId: string,
  actorId: string,
  reason = "COMPLETED",
): Promise<void> {
  const credit = await prisma.sessionCredit.findUnique({ where: { appointmentId } });
  if (!credit || credit.state !== "RESERVED") return;
  await prisma.sessionCredit.update({
    where: { id: credit.id },
    data: { state: "CONSUMED", consumedAt: new Date(), reason, actorId },
  });
  console.log(`[packages] credit consumed appt=${appointmentId} reason=${reason}`);
  await maybeCompletePackage(credit.packageId);
}

// On cancel / reschedule-out (§4): RESERVED → RELEASED, back to available.
export async function releaseCreditForAppointment(
  appointmentId: string,
  actorId: string,
  reason: string,
): Promise<void> {
  const credit = await prisma.sessionCredit.findUnique({ where: { appointmentId } });
  if (!credit || credit.state !== "RESERVED") return;
  await prisma.sessionCredit.update({
    where: { id: credit.id },
    data: { state: "RELEASED", releasedAt: new Date(), reason, actorId },
  });
  console.log(`[packages] credit released appt=${appointmentId} reason=${reason}`);
  // A completed package a release re-opens? Completion requires zero reserved
  // and full consumption, so a release can only affect ACTIVE packages.
}

// Reversal (§4): un-completing a session flips CONSUMED → RESERVED (and the
// package back to ACTIVE if the consumption had completed it).
export async function unconsumeCreditForAppointment(
  appointmentId: string,
  actorId: string,
): Promise<void> {
  const credit = await prisma.sessionCredit.findUnique({ where: { appointmentId } });
  if (!credit || credit.state !== "CONSUMED") return;
  await prisma.sessionCredit.update({
    where: { id: credit.id },
    data: { state: "RESERVED", consumedAt: null, reason: "MANUAL", actorId },
  });
  await prisma.package.updateMany({
    where: { id: credit.packageId, status: "COMPLETED" },
    data: { status: "ACTIVE", completedNoticeAt: null },
  });
  console.log(`[packages] credit un-consumed appt=${appointmentId}`);
}

// Package completes when used = total and none reserved (§4) → renewal moment.
export async function maybeCompletePackage(packageId: string): Promise<void> {
  const pkg = await prisma.package.findUnique({
    where: { id: packageId },
    include: { credits: { select: { state: true } } },
  });
  if (!pkg || pkg.status !== "ACTIVE") return;
  const { used, reserved } = packageCounters(pkg);
  if (used >= pkg.sessionsTotal && reserved === 0) {
    await prisma.package.update({
      where: { id: packageId },
      data: { status: "COMPLETED" },
    });
    console.log(`[packages] package completed pkg=${packageId}`);
  }
}

// Activate the package a paid charge bought (§7/§8). Idempotent via the
// chargeId unique — the webhook and the portal action can both call this.
export async function activatePackageForCharge(charge: {
  id: string;
  clientId: string;
  kind: string;
  status: string;
  priceBookId: string | null;
}): Promise<Package | null> {
  if (charge.kind !== "PACKAGE" || charge.status !== "PAID") return null;
  const existing = await prisma.package.findUnique({ where: { chargeId: charge.id } });
  if (existing) return existing;
  if (!charge.priceBookId) return null;
  const sku = await prisma.priceBook.findUnique({ where: { id: charge.priceBookId } });
  if (!sku?.sessionsIncluded || sku.sessionsIncluded < 1) return null;
  try {
    const pkg = await prisma.package.create({
      data: {
        clientId: charge.clientId,
        priceBookId: sku.id,
        sessionsTotal: sku.sessionsIncluded,
        chargeId: charge.id,
        status: "ACTIVE",
      },
    });
    console.log(`[packages] package activated pkg=${pkg.id} charge=${charge.id}`);
    return pkg;
  } catch {
    // Unique race — someone else activated it first. That's the idempotency working.
    return prisma.package.findUnique({ where: { chargeId: charge.id } });
  }
}

// A package refund (§4 reversal): release all unconsumed credits; open COVERED
// charges for still-scheduled sessions fall back to DUE at the session rate
// separately (practitioner action decides; we only free the ledger here).
export async function refundPackage(packageId: string, actorId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.sessionCredit.updateMany({
      where: { packageId, state: "RESERVED" },
      data: { state: "RELEASED", releasedAt: new Date(), reason: "MANUAL", actorId },
    });
    await tx.package.update({
      where: { id: packageId },
      data: { status: "REFUNDED" },
    });
  });
  console.log(`[packages] package refunded pkg=${packageId} by=${actorId}`);
}

// The client-facing summary for /space/schedule (§10) — words first.
export async function clientPackageSummary(clientId: string) {
  const packages = await prisma.package.findMany({
    where: { clientId, status: { in: ["ACTIVE", "COMPLETED"] } },
    include: { credits: { select: { state: true } } },
    orderBy: { purchasedAt: "desc" },
  });
  return packages.map((p) => ({
    id: p.id,
    status: p.status,
    sessionsTotal: p.sessionsTotal,
    purchasedAt: p.purchasedAt,
    expiresAt: p.expiresAt,
    ...packageCounters(p),
  }));
}
