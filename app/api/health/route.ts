import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { prisma } from "@/lib/prisma";

// Build/version marker so we can fingerprint exactly which build is live, plus
// the host Next.js sees (to debug proxy/host detection). Bump `version` on deploys.
export const dynamic = "force-dynamic";

const VERSION = "amendment02-mobile-1";

export async function GET() {
  const h = headers();
  const seenHost = h.get("x-forwarded-host") ?? h.get("host") ?? null;
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: "up", version: VERSION, seenHost });
  } catch {
    return NextResponse.json({ ok: false, db: "down", version: VERSION, seenHost }, { status: 500 });
  }
}
