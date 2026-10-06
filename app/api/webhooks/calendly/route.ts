import { NextResponse, type NextRequest } from "next/server";
import { ingestCalendlyEvent } from "@/lib/scheduling/external/ingress";

// C37 §5 — Calendly's notification endpoint. ONE shared URL for every
// practice: the payload names its owning user/organization, so attribution
// comes from the event (ruling 195), never from the host this arrived on.
// Raw body read before any parsing — the signature covers the exact bytes.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
  try {
    const result = await ingestCalendlyEvent(headers, rawBody);
    if (result.status !== 200) {
      return NextResponse.json({ error: result.note }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(`[scheduling] calendly ingest failed: ${e instanceof Error ? e.message : "error"}`);
    // 500 → Calendly retries; the WebhookEvent row makes the retry safe.
    return NextResponse.json({ error: "ingest failed" }, { status: 500 });
  }
}
