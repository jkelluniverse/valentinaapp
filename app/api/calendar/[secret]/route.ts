import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { buildCalendar, appointmentEvent } from "@/lib/ics";
import { partyLabel } from "@/lib/appointments";
import { DAY_MS } from "@/lib/schedule";

// The private iCalendar subscription feed (spec §6). Protected only by the
// unguessable secret in the URL, so the secret is NEVER logged and lookups are
// constant-shape (a bad secret 404s like any missing calendar). One-way,
// read-only: the practitioner subscribes once and her phone keeps it fresh.
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { secret: string } }) {
  // The URL is /api/calendar/<secret>.ics — strip the extension.
  const secret = params.secret.replace(/\.ics$/, "");
  if (!secret || secret.length < 20) {
    return new NextResponse("Not found", { status: 404 });
  }

  const config = await prisma.schedulingConfig.findUnique({
    where: { calendarFeedSecret: secret },
    select: { practitionerId: true },
  });
  if (!config) {
    return new NextResponse("Not found", { status: 404 });
  }

  // A rolling window: recent past (context) through the full booking horizon.
  const now = new Date();
  const from = new Date(now.getTime() - 30 * DAY_MS);
  const to = new Date(now.getTime() + 120 * DAY_MS);

  const appointments = await prisma.appointment.findMany({
    where: {
      practitionerId: config.practitionerId,
      startAt: { gte: from, lte: to },
      status: { in: ["SCHEDULED", "COMPLETED"] },
    },
    include: {
      client: { select: { name: true, email: true } },
      lead: { select: { name: true, email: true } },
    },
    orderBy: { startAt: "asc" },
  });

  const events = appointments.map((a) => appointmentEvent(a, partyLabel(a)));
  const body = buildCalendar(events, "Veritas · Sessions");

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="veritas-sessions.ics"',
      // Let clients cache briefly but always revalidate; never store on shared caches.
      "Cache-Control": "private, max-age=300",
    },
  });
}
