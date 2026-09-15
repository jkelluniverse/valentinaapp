import { NextResponse, type NextRequest } from "next/server";
import { verifyAudioToken } from "@/lib/storage";
import { completeCapture } from "@/lib/capture";

// SESSION-PIPELINE §8 step 4 — the provider's completion signal. Double
// verification: the signed capture token in the URL (bound at submit time)
// AND the webhook auth header the provider echoes back. Unsigned callbacks
// are rejected; the payload itself is never trusted for content — we fetch
// the transcript from the provider by job id.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const captureId = req.nextUrl.searchParams.get("capture") ?? "";
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!captureId || !verifyAudioToken(token, captureId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const expected = process.env.TRANSCRIPTION_WEBHOOK_SECRET;
  if (expected && req.headers.get("x-veritas-webhook") !== expected) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  // Body is only a signal ({ transcript_id, status }); completion re-fetches
  // from the provider and is idempotent on capture status.
  await completeCapture(captureId).catch((e) => {
    console.error(`[capture] webhook completion failed capture=${captureId}: ${e instanceof Error ? e.message : "error"}`);
  });
  return NextResponse.json({ ok: true });
}
