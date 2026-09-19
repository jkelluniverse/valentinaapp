import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getObject, verifyAudioToken } from "@/lib/storage";

// SESSION-PIPELINE §9 — signed, expiring audio access; no public objects,
// ever. This is the ONLY read path to session audio: the transcription
// provider fetches through here with a time-limited HMAC token.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { captureId: string } }) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!verifyAudioToken(token, params.captureId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const capture = await prisma.sessionCapture.findFirst({ where: { id: params.captureId } });
  if (!capture?.audioKey || capture.audioDeletedAt) {
    return NextResponse.json({ error: "gone" }, { status: 410 });
  }
  const bytes = getObject(capture.audioKey);
  if (!bytes) return NextResponse.json({ error: "gone" }, { status: 410 });
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": capture.audioMime ?? "application/octet-stream",
      "Content-Length": String(bytes.length),
      "Cache-Control": "no-store",
    },
  });
}
