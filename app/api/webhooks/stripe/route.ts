import { NextResponse, type NextRequest } from "next/server";
import { ingestStripeEvent } from "@/lib/billing/lifecycle";

// BILLING §4.5 — Stripe's notification endpoint. Raw body read before any
// parsing (the signature covers the exact bytes); verification, idempotency,
// and tenant resolution live in the service.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }
  const rawBody = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
  try {
    const result = await ingestStripeEvent(headers, rawBody);
    if (result.status !== 200) {
      return NextResponse.json({ error: result.note }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(`[billing] stripe ingest failed: ${e instanceof Error ? e.message : "error"}`);
    return NextResponse.json({ error: "ingest failed" }, { status: 500 });
  }
}
