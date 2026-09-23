import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual, createHash } from "crypto";
import { ingestInboundEmail, type InboundAttachment } from "@/lib/remarkable";

// C14-REMARKABLE R.1 — the private inbound address's webhook (Resend inbound
// or any provider that POSTs parsed email JSON). Two gates: the URL secret
// (INBOUND_WEBHOOK_SECRET) and the sender allowlist inside the ingest.
// Strangers get the same 200 as everyone — silence, not information.

export const dynamic = "force-dynamic";
export const maxDuration = 300; // transcription runs inline

function authorized(req: NextRequest): boolean {
  const secret = process.env.INBOUND_WEBHOOK_SECRET;
  if (!secret) return false;
  const given = req.nextUrl.searchParams.get("key") ?? "";
  const a = createHash("sha256").update(secret).digest();
  const b = createHash("sha256").update(given).digest();
  return timingSafeEqual(a, b);
}

// Tolerant extraction across inbound-provider payload shapes.
type LooseAttachment = {
  filename?: string;
  content_type?: string;
  contentType?: string;
  content?: string; // base64
};
type LoosePayload = {
  from?: string | { address?: string; email?: string };
  subject?: string;
  attachments?: LooseAttachment[];
  data?: LoosePayload; // Resend wraps the event payload in `data`
};

function fromAddress(p: LoosePayload): string {
  const f = p.from ?? p.data?.from;
  if (typeof f === "string") return f;
  return f?.address ?? f?.email ?? "";
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let payload: LoosePayload;
  try {
    payload = (await req.json()) as LoosePayload;
  } catch {
    return NextResponse.json({ ok: true }); // malformed → silent
  }
  const inner = payload.data ?? payload;
  const attachments: InboundAttachment[] = (inner.attachments ?? [])
    .filter((a) => typeof a.content === "string" && a.content.length > 0)
    .map((a) => ({
      filename: a.filename,
      contentType: a.content_type ?? a.contentType,
      contentBase64: a.content!,
    }));

  await ingestInboundEmail({
    from: fromAddress(payload),
    subject: inner.subject ?? null,
    attachments,
  }).catch(() => undefined);

  // Always 200, always the same body — rejection is silent by design (§2).
  return NextResponse.json({ ok: true });
}
