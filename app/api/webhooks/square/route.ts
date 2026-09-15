import { NextResponse, type NextRequest } from "next/server";
import { webhookConfigured } from "@/lib/payments/square";
import { ingestSquareEvent } from "@/lib/payments/webhook";

// CLAUDE-BILLING §3.4 Phase B2 — Square's notification endpoint. The raw
// body is read BEFORE any parsing (the signature covers the exact bytes).
// Verification, idempotency, and tenant resolution live in the service.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!webhookConfigured()) {
    // No signature key configured → we cannot authenticate anything.
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  const rawBody = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
  try {
    const result = await ingestSquareEvent(headers, rawBody);
    if (result.status !== 200) {
      return NextResponse.json({ error: result.note }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(`[payments] webhook ingest failed: ${e instanceof Error ? e.message : "error"}`);
    // 500 → Square retries; the WebhookEvent row makes the retry safe.
    return NextResponse.json({ error: "ingest failed" }, { status: 500 });
  }
}
