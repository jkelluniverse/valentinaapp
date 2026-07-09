import { NextResponse } from "next/server";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

// Diagnostic: does auth() throw on this runtime? API routes aren't redirected,
// so we can read the raw result. Temporary — remove after debugging.
export async function GET() {
  const out: Record<string, unknown> = { marker: "diag-3" };
  try {
    const h = headers();
    out.host = h.get("host");
    out.xfHost = h.get("x-forwarded-host");
    out.xfProto = h.get("x-forwarded-proto");
  } catch (e) {
    out.headersError = String(e);
  }
  try {
    const { auth } = await import("@/auth");
    const session = await auth();
    out.authOk = true;
    out.hasSession = !!session?.user;
  } catch (e) {
    out.authOk = false;
    out.authError = String((e as Error)?.message ?? e);
    out.authStack = String((e as Error)?.stack ?? "").split("\n").slice(0, 6);
  }
  return NextResponse.json(out);
}
