import { NextResponse } from "next/server";
import { getDiscoveryInvite } from "@/lib/discovery";
import { buildInvite } from "@/lib/ics";

export const dynamic = "force-dynamic";

// The downloadable invite for a booked discovery call — token-gated (same
// signed token as the manage page), so it exposes exactly one appointment's
// time and video link, nothing else.
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const invite = await getDiscoveryInvite(params.token);
  if (!invite || invite.cancelled) return new NextResponse("Not found", { status: 404 });

  const ics = buildInvite({
    uid: `veritas-discovery-${invite.appointmentId}`,
    start: invite.startAt,
    end: invite.endAt,
    summary: "Discovery call · Valentina Vélez",
    description: invite.videoUrl ? `Join here at the time: ${invite.videoUrl}` : undefined,
    location: invite.videoUrl ?? "Virtual",
    status: "CONFIRMED",
    stamp: new Date(),
  });

  return new NextResponse(ics, {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="discovery-call.ics"',
    },
  });
}
