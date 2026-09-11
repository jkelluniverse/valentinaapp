import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readSealedPdf } from "@/lib/agreements/seal";

// C20 §4 — sealed-PDF download for either party: the practitioner, or the
// client the agreement belongs to. Every download re-verifies the SHA-256
// against the sealed record (tamper evidence) — a mismatch refuses.

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const agreement = await prisma.agreement.findFirst({ where: { id: params.id } });
  if (!agreement) return NextResponse.json({ error: "not found" }, { status: 404 });

  // C21 — the signed link's holder may download their sealed copy too
  // (external recipients have no login; the token is their basis).
  const token = new URL(req.url).searchParams.get("token");
  const { hashToken } = await import("@/lib/invites");
  let allowed = Boolean(token && agreement.tokenHash && hashToken(token) === agreement.tokenHash);
  if (!allowed) {
    const session = await auth();
    const email = session?.user?.email;
    if (!email) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    const me = await prisma.user.findFirst({ where: { email }, select: { id: true, role: true } });
    if (!me) return NextResponse.json({ error: "forbidden" }, { status: 403 });
    allowed = me.role === "PRACTITIONER" || agreement.clientId === me.id;
  }
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const result = await readSealedPdf(agreement.id);
  if (!result.ok) {
    const status = result.reason === "tampered" ? 409 : 404;
    return NextResponse.json({ error: result.reason }, { status });
  }
  return new NextResponse(new Uint8Array(result.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${result.filename}"`,
    },
  });
}
