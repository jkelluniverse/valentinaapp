import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-guards";
import { clientLabel } from "@/lib/appointments";

// A plain CSV of all charges for her bookkeeper (C13.6d). Practitioner-only.
export const dynamic = "force-dynamic";

function csvCell(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const user = await getSessionUser();
  if (!user || user.role !== "PRACTITIONER") {
    return new NextResponse("Not found", { status: 404 });
  }

  const [charges, clients] = await Promise.all([
    prisma.charge.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.user.findMany({ where: { role: "CLIENT" }, select: { id: true, name: true, email: true } }),
  ]);
  const byId = new Map(clients.map((c) => [c.id, c]));

  // Charges invoiced to a prospect carry clientId "lead:<id>" — name those too.
  const leadIds = [
    ...new Set(
      charges
        .filter((c) => c.clientId.startsWith("lead:"))
        .map((c) => c.clientId.slice(5)),
    ),
  ];
  const leadById = new Map(
    leadIds.length
      ? (
          await prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, name: true } })
        ).map((l) => [l.id, l])
      : [],
  );
  const nameOf = (id: string) => {
    if (id.startsWith("lead:")) {
      const lead = leadById.get(id.slice(5));
      return lead ? `Lead — ${lead.name}` : id;
    }
    const client = byId.get(id);
    return client ? clientLabel(client) : id;
  };

  const rows = [
    ["created", "client", "description", "kind", "fee_reason", "amount", "currency", "status", "due", "paid", "paid_via", "square_payment_id"],
    ...charges.map((c) => {
      return [
        c.createdAt.toISOString().slice(0, 10),
        nameOf(c.clientId),
        c.description,
        c.kind,
        c.feeReason ?? "",
        (c.amountCents / 100).toFixed(2),
        c.currency,
        c.status,
        c.dueAt?.toISOString().slice(0, 10) ?? "",
        c.paidAt?.toISOString().slice(0, 10) ?? "",
        c.paidVia ?? "",
        c.squarePaymentId ?? "",
      ];
    }),
  ];
  const body = rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";

  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="veritas-billing.csv"',
      "Cache-Control": "no-store",
    },
  });
}
