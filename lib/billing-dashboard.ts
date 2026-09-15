// BILLING-DASH — the data behind the owner's dashboard: six boxes, each
// answering one question in plain words, and the rows their panels act on.
// All derived from the existing rails (Charges, Packages/credits,
// Appointments); no new state except Package.renewalEmailSentAt.

import { prisma } from "@/lib/prisma";
import { resolveSessionRate } from "@/lib/billing";
import { packageCounters } from "@/lib/packages";

const DAY = 24 * 60 * 60 * 1000;

export type AwaitingRow = {
  chargeId: string;
  clientId: string;
  kind: string;
  feeReason: string | null;
  description: string;
  amountCents: number;
  currency: string;
  dueAt: Date | null;
  overdueDays: number; // 0 = not overdue
  hasInvoice: boolean; // Square invoice already exists for it
  lastRemindedAt: Date | null;
};

export type RenewalRow = {
  clientId: string;
  sessionsTotal: number;
  finishedAt: Date;
  renewalEmailSentAt: Date | null;
  packageId: string;
};

export type LastSessionRow = {
  clientId: string;
  packageId: string;
  sessionNumber: number; // e.g. 5 (of sessionsTotal)
  sessionsTotal: number;
  appointmentId: string | null;
  startAt: Date | null;
};

export type UnbilledRow = {
  appointmentId: string;
  clientId: string;
  startAt: Date;
  location: string;
  rateCents: number | null; // what "Bill it" would charge (null = no rate set)
  currency: string;
};

export type CollectedRow = {
  chargeId: string;
  clientId: string;
  description: string;
  amountCents: number;
  currency: string;
  paidAt: Date | null;
  paidVia: string | null;
};

export type BookedRow = {
  appointmentId: string;
  clientId: string;
  startAt: Date;
  coverage: "covered" | "billed" | "paid" | "will-bill";
  valueCents: number;
  currency: string;
  packageNote: string | null; // "session 5 of 6"
};

export type BillingDashboard = {
  monthStart: Date;
  collected: {
    cents: number;
    count: number;
    lastMonthCents: number;
    rows: CollectedRow[];
  };
  awaiting: {
    cents: number;
    people: number;
    overdueCents: number;
    rows: AwaitingRow[];
  };
  renewal: { rows: RenewalRow[] };
  lastSession: { rows: LastSessionRow[] };
  unbilled: { rows: UnbilledRow[] };
  booked: {
    cents: number;
    count: number;
    willBillCount: number;
    rows: BookedRow[];
  };
};

export async function billingDashboard(now = new Date()): Promise<BillingDashboard> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const prevMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const weekAhead = new Date(now.getTime() + 7 * DAY);

  const [paidThisMonth, paidLastMonth, awaitingCharges, allPackages, upcoming] =
    await Promise.all([
      prisma.charge.findMany({
        where: { status: "PAID", paidAt: { gte: monthStart } },
        orderBy: { paidAt: "desc" },
      }),
      prisma.charge.aggregate({
        where: { status: "PAID", paidAt: { gte: prevMonthStart, lt: monthStart } },
        _sum: { amountCents: true },
      }),
      prisma.charge.findMany({
        where: { status: { in: ["DUE", "PENDING"] } },
        orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      }),
      prisma.package.findMany({
        orderBy: { purchasedAt: "desc" },
        include: { credits: { select: { state: true, appointmentId: true } } },
      }),
      prisma.appointment.findMany({
        where: {
          kind: "SESSION",
          status: "SCHEDULED",
          clientId: { not: null },
          startAt: { gte: now, lt: weekAhead },
        },
        orderBy: { startAt: "asc" },
      }),
    ]);

  // ---- Box 1 · Collected this month ----
  const collected = {
    cents: paidThisMonth.reduce((s, c) => s + c.amountCents, 0),
    count: paidThisMonth.length,
    lastMonthCents: paidLastMonth._sum.amountCents ?? 0,
    rows: paidThisMonth.map((c) => ({
      chargeId: c.id,
      clientId: c.clientId,
      description: c.description,
      amountCents: c.amountCents,
      currency: c.currency,
      paidAt: c.paidAt,
      paidVia: c.paidVia,
    })),
  };

  // ---- Box 2 · Waiting to be paid ----
  const awaitingRows: AwaitingRow[] = awaitingCharges
    .map((c) => ({
      chargeId: c.id,
      clientId: c.clientId,
      kind: c.kind,
      feeReason: c.feeReason,
      description: c.description,
      amountCents: c.amountCents,
      currency: c.currency,
      dueAt: c.dueAt,
      overdueDays:
        c.dueAt && c.dueAt.getTime() < now.getTime()
          ? Math.max(1, Math.floor((now.getTime() - c.dueAt.getTime()) / DAY))
          : 0,
      hasInvoice: Boolean(c.squareInvoiceId),
      lastRemindedAt: c.lastRemindedAt,
    }))
    // Overdue first, most overdue on top; then soonest due.
    .sort((a, b) => b.overdueDays - a.overdueDays || (a.dueAt?.getTime() ?? Infinity) - (b.dueAt?.getTime() ?? Infinity));
  const awaiting = {
    cents: awaitingRows.reduce((s, r) => s + r.amountCents, 0),
    people: new Set(awaitingRows.map((r) => r.clientId)).size,
    overdueCents: awaitingRows.filter((r) => r.overdueDays > 0).reduce((s, r) => s + r.amountCents, 0),
    rows: awaitingRows,
  };

  // ---- Boxes 3 & 4 · the renewal pipeline, from the package ledger ----
  // Latest package per client decides their state: COMPLETED with nothing
  // newer = out of sessions; ACTIVE with the final session booked = last one.
  const latestByClient = new Map<string, (typeof allPackages)[number]>();
  for (const p of allPackages) {
    if (!latestByClient.has(p.clientId)) latestByClient.set(p.clientId, p); // ordered desc
  }
  const renewalRows: RenewalRow[] = [];
  const lastSessionRows: LastSessionRow[] = [];
  for (const [clientId, pkg] of latestByClient) {
    if (clientId.startsWith("lead:")) continue;
    if (pkg.status === "COMPLETED") {
      renewalRows.push({
        clientId,
        sessionsTotal: pkg.sessionsTotal,
        finishedAt: pkg.updatedAt,
        renewalEmailSentAt: pkg.renewalEmailSentAt,
        packageId: pkg.id,
      });
    } else if (pkg.status === "ACTIVE") {
      const c = packageCounters(pkg);
      if (c.available === 0 && c.reserved > 0 && c.used + c.reserved >= pkg.sessionsTotal) {
        const reservedCredit = pkg.credits.find((cr) => cr.state === "RESERVED");
        const appt = reservedCredit
          ? await prisma.appointment.findUnique({
              where: { id: reservedCredit.appointmentId },
              select: { id: true, startAt: true, status: true },
            })
          : null;
        lastSessionRows.push({
          clientId,
          packageId: pkg.id,
          sessionNumber: pkg.sessionsTotal,
          sessionsTotal: pkg.sessionsTotal,
          appointmentId: appt?.status === "SCHEDULED" ? appt.id : null,
          startAt: appt?.status === "SCHEDULED" ? appt.startAt : null,
        });
      }
    }
  }
  renewalRows.sort((a, b) => b.finishedAt.getTime() - a.finishedAt.getTime());

  // ---- Box 5 · Sessions not yet billed ----
  // Happened (COMPLETED), no charge row of any kind. Credit-covered sessions
  // always have a COVERED charge, so charge-absence is the whole test.
  const chargedIds = new Set(
    (
      await prisma.charge.findMany({
        where: { appointmentId: { not: null }, kind: "SESSION" },
        select: { appointmentId: true },
      })
    ).map((c) => c.appointmentId!),
  );
  const unbilledAppts = (
    await prisma.appointment.findMany({
      where: {
        kind: "SESSION",
        status: "COMPLETED",
        clientId: { not: null },
        startAt: { gte: new Date(now.getTime() - 90 * DAY) },
      },
      orderBy: { startAt: "desc" },
    })
  ).filter((a) => !chargedIds.has(a.id));
  const unbilledRows: UnbilledRow[] = [];
  for (const a of unbilledAppts) {
    const rate = await resolveSessionRate(a.clientId!);
    unbilledRows.push({
      appointmentId: a.id,
      clientId: a.clientId!,
      startAt: a.startAt,
      location: a.location === "IN_PERSON" ? "in person" : "virtual",
      rateCents: rate?.amountCents ?? null,
      currency: rate?.currency ?? "USD",
    });
  }

  // ---- Box 6 · Booked ahead, next 7 days ----
  const bookedRows: BookedRow[] = [];
  for (const a of upcoming) {
    const charge = await prisma.charge.findUnique({
      where: { appointmentId_kind: { appointmentId: a.id, kind: "SESSION" } },
    });
    if (charge?.status === "COVERED") {
      // Effective per-session value of its package (what the package cost ÷ sessions).
      const pkg = charge.packageId
        ? allPackages.find((p) => p.id === charge.packageId) ?? null
        : null;
      const pkgCharge = pkg
        ? await prisma.charge.findUnique({ where: { id: pkg.chargeId } })
        : null;
      const per =
        pkg && pkgCharge ? Math.round(pkgCharge.amountCents / pkg.sessionsTotal) : 0;
      const counters = pkg ? packageCounters(pkg) : null;
      bookedRows.push({
        appointmentId: a.id,
        clientId: a.clientId!,
        startAt: a.startAt,
        coverage: "covered",
        valueCents: per,
        currency: pkgCharge?.currency ?? "USD",
        packageNote:
          pkg && counters
            ? `session ${Math.min(counters.used + counters.reserved, pkg.sessionsTotal)} of ${pkg.sessionsTotal}`
            : null,
      });
    } else if (charge) {
      bookedRows.push({
        appointmentId: a.id,
        clientId: a.clientId!,
        startAt: a.startAt,
        coverage: charge.status === "PAID" ? "paid" : "billed",
        valueCents: charge.amountCents,
        currency: charge.currency,
        packageNote: null,
      });
    } else {
      const rate = await resolveSessionRate(a.clientId!);
      bookedRows.push({
        appointmentId: a.id,
        clientId: a.clientId!,
        startAt: a.startAt,
        coverage: "will-bill",
        valueCents: rate?.amountCents ?? 0,
        currency: rate?.currency ?? "USD",
        packageNote: null,
      });
    }
  }

  return {
    monthStart,
    collected,
    awaiting,
    renewal: { rows: renewalRows },
    lastSession: { rows: lastSessionRows },
    unbilled: { rows: unbilledRows },
    booked: {
      cents: bookedRows.reduce((s, r) => s + r.valueCents, 0),
      count: bookedRows.length,
      willBillCount: bookedRows.filter((r) => r.coverage === "will-bill").length,
      rows: bookedRows,
    },
  };
}
