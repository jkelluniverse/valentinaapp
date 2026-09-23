import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-guards";
import { buildInvite } from "@/lib/ics";

export const dynamic = "force-dynamic";

// A signed-in party downloads the invite for THEIR appointment (client owns
// it, or the practitioner). One event, one file, one-tap add on a phone.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getSessionUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });

  const appt = await prisma.appointment.findUnique({ where: { id: params.id } });
  if (!appt) return new NextResponse("Not found", { status: 404 });
  const mine = appt.clientId === user.id || user.role === "PRACTITIONER";
  if (!mine) return new NextResponse("Not found", { status: 404 });

  const ics = buildInvite({
    uid: `veritas-appt-${appt.id}`,
    start: appt.startAt,
    end: appt.endAt,
    summary: "Session · Valentina Vélez",
    description:
      appt.location === "VIRTUAL" && appt.videoUrl
        ? `Join here at the time: ${appt.videoUrl}`
        : undefined,
    location: appt.location === "VIRTUAL" ? appt.videoUrl ?? "Virtual" : "In person",
    status: appt.status === "CANCELLED" ? "CANCELLED" : "CONFIRMED",
    stamp: new Date(),
  });

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="session.ics"',
    },
  });
}
