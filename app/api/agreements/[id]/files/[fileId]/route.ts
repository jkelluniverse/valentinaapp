import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/invites";
import { readAgreementFileVerified } from "@/lib/agreements/files";

// C21 — document-file download for a signature request. Three authorized
// readers: the signed link's holder (?token=, same basis as the sign page),
// the practitioner, or the enrolled client the agreement belongs to.
// Every read re-verifies the file's SHA-256 (tamper evidence).

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string; fileId: string } }) {
  const agreement = await prisma.agreement.findFirst({ where: { id: params.id } });
  if (!agreement) return NextResponse.json({ error: "not found" }, { status: 404 });

  const token = new URL(req.url).searchParams.get("token");
  let allowed = Boolean(token && agreement.tokenHash && hashToken(token) === agreement.tokenHash);
  if (!allowed) {
    const session = await auth();
    const email = session?.user?.email;
    if (email) {
      const me = await prisma.user.findFirst({ where: { email }, select: { id: true, role: true } });
      allowed = Boolean(me && (me.role === "PRACTITIONER" || agreement.clientId === me.id));
    }
  }
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const result = await readAgreementFileVerified(params.fileId);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.reason === "tampered" ? 409 : 404 });
  if (result.agreementId !== agreement.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(result.bytes), {
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `inline; filename="${result.filename}"`,
    },
  });
}
