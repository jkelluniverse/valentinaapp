import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual, createHash } from "crypto";
import { ingestRecording, type PulledRecording } from "@/lib/recording";

// C19 REC.2 — the zero-touch trigger: recording processed → webhook → pull.
// Secret-in-URL gate (RECORDING_WEBHOOK_SECRET); fixture payloads may arrive
// inline for staging verification without a device.

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function authorized(req: NextRequest): boolean {
  const secret = process.env.RECORDING_WEBHOOK_SECRET;
  if (!secret) return false;
  const given = req.nextUrl.searchParams.get("key") ?? "";
  const a = createHash("sha256").update(secret).digest();
  const b = createHash("sha256").update(given).digest();
  return timingSafeEqual(a, b);
}

type WebhookBody = {
  recording_id?: string;
  id?: string;
  provider?: string;
  payload?: PulledRecording; // fixture inline path
};

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: WebhookBody;
  try {
    body = (await req.json()) as WebhookBody;
  } catch {
    return NextResponse.json({ ok: true });
  }
  const ref = body.recording_id ?? body.id;
  if (!ref) return NextResponse.json({ ok: true });
  await ingestRecording({
    providerRef: String(ref).slice(0, 100),
    provider: body.payload ? "fixture" : (body.provider ?? "pocket"),
    inline: body.payload ?? null,
  }).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
