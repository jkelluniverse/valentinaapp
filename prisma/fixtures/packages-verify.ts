import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

// C13-PACKAGES / C10-POLICY — deterministic verification of the credit ledger
// and the late-fee policy against a real (scratch) database. Proves the spec's
// own acceptance cases:
//   §13.3  1 credit + 3 bookings → 1 COVERED + 2 DUE (reservation holds)
//   §4     complete consumes · cancel releases · reversal restores
//   POLICY exactly-24h is free; <24h fee applies once (idempotent), credit
//          releases and the fee stands separately
//
//   DATABASE_URL=postgresql://postgres@localhost:5433/veritas_migrate_check \
//     npx tsx prisma/fixtures/packages-verify.ts

const prisma = new PrismaClient();

function assert(cond: unknown, label: string) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    process.exitCode = 1;
  }
}

async function main() {
  const host = new URL(process.env.DATABASE_URL ?? "postgres://x/x").hostname;
  if (!["localhost", "127.0.0.1"].includes(host)) {
    throw new Error(`REFUSING: packages-verify runs against a local scratch DB only (host=${host}).`);
  }
  // Import AFTER the guard so nothing touches a remote DB by accident.
  const { createChargeForAppointment, applyLateFee } = await import("../../lib/billing");
  const { activatePackageForCharge, packageCounters } = await import("../../lib/packages");
  const {
    completeAppointment,
    revertAppointmentStatus,
    clientCancelWithPolicy,
    isLateChange,
  } = await import("../../lib/appointments");

  console.log("=== C13-PACKAGES / C10-POLICY ledger verification ===\n");

  // ---- reset a tiny isolated cast ----
  const emails = ["pract@packages.test", "client@packages.test"];
  const old = await prisma.user.findMany({ where: { email: { in: emails } }, select: { id: true } });
  for (const u of old) {
    await prisma.sessionCredit.deleteMany({ where: { package: { clientId: u.id } } });
    await prisma.package.deleteMany({ where: { clientId: u.id } });
    await prisma.charge.deleteMany({ where: { clientId: u.id } });
    await prisma.appointment.deleteMany({ where: { clientId: u.id } });
    await prisma.schedulingConfig.deleteMany({ where: { practitionerId: u.id } });
  }
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
  await prisma.priceBook.deleteMany({ where: { name: { startsWith: "PKGTEST" } } });

  const pw = bcrypt.hashSync("verify-pass-1", 4);
  const pract = await prisma.user.create({
    data: { email: emails[0], name: "Pract Test", role: "PRACTITIONER", passwordHash: pw },
  });
  const client = await prisma.user.create({
    data: { email: emails[1], name: "Client Test", role: "CLIENT", passwordHash: pw },
  });
  const sessionRate = await prisma.priceBook.create({
    data: { name: "PKGTEST session", amountCents: 15000, kind: "SESSION" },
  });
  const packageSku = await prisma.priceBook.create({
    data: { name: "PKGTEST 1-pack", amountCents: 14000, kind: "PACKAGE", sessionsIncluded: 1 },
  });

  // ---- purchase → activation ----
  console.log("1. purchase activates the package");
  const purchase = await prisma.charge.create({
    data: {
      clientId: client.id, kind: "PACKAGE", priceBookId: packageSku.id,
      description: packageSku.name, amountCents: packageSku.amountCents, status: "PAID", paidAt: new Date(),
    },
  });
  const pkg = await activatePackageForCharge(purchase);
  assert(pkg?.status === "ACTIVE" && pkg.sessionsTotal === 1, "package ACTIVE with 1 credit");
  const again = await activatePackageForCharge(purchase);
  assert(again?.id === pkg?.id, "re-activation is idempotent (same package)");

  // ---- 1 credit + 3 bookings ----
  console.log("\n2. §13.3 — 1 credit + 3 bookings = 1 covered + 2 billed");
  const far = (d: number) => new Date(Date.now() + d * 86_400_000);
  const appts = [];
  for (let i = 0; i < 3; i++) {
    const a = await prisma.appointment.create({
      data: {
        practitionerId: pract.id, clientId: client.id, kind: "SESSION",
        startAt: far(7 + i), endAt: new Date(far(7 + i).getTime() + 50 * 60_000),
        bookedBy: "client",
      },
    });
    await createChargeForAppointment(a);
    appts.push(a);
  }
  const covered = await prisma.charge.findMany({ where: { clientId: client.id, kind: "SESSION", status: "COVERED" } });
  const due = await prisma.charge.findMany({ where: { clientId: client.id, kind: "SESSION", status: "DUE" } });
  assert(covered.length === 1, `exactly 1 COVERED (got ${covered.length})`);
  assert(due.length === 2, `exactly 2 DUE at the session rate (got ${due.length})`);
  assert(due.every((c) => c.amountCents === sessionRate.amountCents), "billed at the resolved rate");
  const coveredApptId = covered[0].appointmentId!;

  // ---- complete consumes; package completes; reversal restores ----
  console.log("\n3. §4 — complete consumes · reversal restores");
  await completeAppointment(coveredApptId, pract.id);
  let credit = await prisma.sessionCredit.findUnique({ where: { appointmentId: coveredApptId } });
  assert(credit?.state === "CONSUMED", "credit CONSUMED on completion");
  let p = await prisma.package.findUnique({ where: { id: pkg!.id }, include: { credits: true } });
  assert(p?.status === "COMPLETED", "package COMPLETED at used=total, reserved=0");
  await revertAppointmentStatus(coveredApptId, pract.id);
  credit = await prisma.sessionCredit.findUnique({ where: { appointmentId: coveredApptId } });
  p = await prisma.package.findUnique({ where: { id: pkg!.id }, include: { credits: true } });
  assert(credit?.state === "RESERVED", "reversal: credit back to RESERVED");
  assert(p?.status === "ACTIVE", "reversal: package back to ACTIVE");
  const counters = packageCounters(p!);
  assert(counters.available === 0 && counters.reserved === 1, "counters derive from the ledger");

  // ---- the 24h boundary ----
  console.log("\n4. C10-POLICY — the boundary (exactly-24h is free)");
  assert(!isLateChange(new Date(Date.now() + 24 * 3_600_000 + 1000), 24), "24h+1s out → free");
  assert(isLateChange(new Date(Date.now() + 23.9 * 3_600_000), 24), "23.9h out → late");

  // ---- late cancel: disclosed fee, credit releases, fee idempotent ----
  console.log("\n5. C10-POLICY — late cancel: consent, fee, release, idempotency");
  const soonAppt = await prisma.appointment.update({
    where: { id: coveredApptId },
    data: { startAt: new Date(Date.now() + 3 * 3_600_000), endAt: new Date(Date.now() + 3.8 * 3_600_000) },
  });
  const refused = await clientCancelWithPolicy(soonAppt.id, { id: client.id }, false);
  assert(!refused.ok && (refused as { error: string }).error === "fee-confirm", "without consent → fee-confirm, nothing happens");
  const done = await clientCancelWithPolicy(soonAppt.id, { id: client.id }, true);
  assert(done.ok && (done as { feeApplied: boolean }).feeApplied, "with consent → cancelled + fee applied");
  const fee = await prisma.charge.findUnique({
    where: { appointmentId_kind: { appointmentId: soonAppt.id, kind: "LATE_FEE" } },
  });
  assert(fee?.status === "DUE" && fee.feeReason === "LATE_CANCEL" && fee.amountCents === 5000, "one DUE $50 LATE_FEE with the right reason");
  credit = await prisma.sessionCredit.findUnique({ where: { appointmentId: soonAppt.id } });
  assert(credit?.state === "RELEASED" && credit.reason === "LATE_CANCEL", "credit RELEASED — fee stands separately, never both");
  const dup = await applyLateFee({
    appointmentId: soonAppt.id, clientId: client.id, reason: "LATE_CANCEL", actorId: client.id, lateFeeCents: 5000,
  });
  assert(!dup.created && dup.chargeId === fee?.id, "second fee attempt is a no-op (idempotent)");
  const sessCharge = await prisma.charge.findUnique({
    where: { appointmentId_kind: { appointmentId: soonAppt.id, kind: "SESSION" } },
  });
  assert(sessCharge?.status === "CANCELED", "the covered session charge died with the session");
  p = await prisma.package.findUnique({ where: { id: pkg!.id }, include: { credits: true } });
  assert(packageCounters(p!).available === 1, "the released credit is available again");

  console.log("\n=== done ===");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
