import { NextResponse, type NextRequest } from "next/server";
import { verifyAudioToken } from "@/lib/storage";
import { completeCapture, captureTenantId } from "@/lib/capture";

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
  // C38-B / RULING 238 — the tenant comes from the PAYLOAD'S captureId, via
  // the row that owns it. The request Host is consulted nowhere on this path.
  // An unknown id is acknowledged and dropped (200, so the provider does not
  // retry a stranger's id forever), and logged — never guessed into a tenant.
  const tenantId = await captureTenantId(captureId);
  if (!tenantId) {
    console.warn(`[capture] webhook for unknown capture=${captureId} — dropped, not attributed`);
    return NextResponse.json({ ok: true, note: "unknown capture — dropped" });
  }
  // Body is only a signal ({ transcript_id, status }); completion re-fetches
  // from the provider and is idempotent on capture status.
  await completeCapture(captureId, tenantId).catch((e) => {
    console.error(`[capture] webhook completion failed capture=${captureId}: ${e instanceof Error ? e.message : "error"}`);
  });
  return NextResponse.json({ ok: true });
}
