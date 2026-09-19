import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readAgreementFileVerified } from "@/lib/agreements/files";

// C21.2 — template-file download for the practitioner's upload preview.
// Practitioner session only (templates are hers; signers get files
// through the agreement route with their token). Hash re-verified.

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string; fileId: string } }) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const me = await prisma.user.findFirst({ where: { email }, select: { role: true } });
  if (me?.role !== "PRACTITIONER") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const result = await readAgreementFileVerified(params.fileId);
  if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.reason === "tampered" ? 409 : 404 });
  if (result.templateId !== params.id) return NextResponse.json({ error: "not found" }, { status: 404 });

  return new NextResponse(new Uint8Array(result.bytes), {
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `inline; filename="${result.filename}"`,
    },
  });
}
