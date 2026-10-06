import { NextResponse, type NextRequest } from "next/server";
import { ingestAcuityEvent } from "@/lib/scheduling/external/ingress";

// C37 §5 / RULING 196 — Acuity's notification endpoint, ONE URL PER
// CONNECTION. Acuity's webhook body carries no account identifier, so a shared
// URL would have nothing to attribute the delivery by. The token in the path
// SELECTS the connection and therefore the key to verify against.
//
// It does NOT grant trust. The signature is verified afterwards, in the
// service, and a correct path with a bad signature is refused. Ruling 195
// stands unamended: the request host is still never consulted.

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const rawBody = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
  try {
    const result = await ingestAcuityEvent(params.token, headers, rawBody);
    if (result.status !== 200) {
      return NextResponse.json({ error: result.note }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(`[scheduling] acuity ingest failed: ${e instanceof Error ? e.message : "error"}`);
    return NextResponse.json({ error: "ingest failed" }, { status: 500 });
  }
}
