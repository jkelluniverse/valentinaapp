import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";

// C14-REMARKABLE — the original handwriting, served only to her. The PDF is
// part of the record; every node evidence tap can land back here.

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  await requirePractitioner();
  const draft = await prisma.handwrittenNote.findUnique({
    where: { id: params.id },
    select: { pdf: true },
  });
  if (!draft) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(Buffer.from(draft.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": "inline; filename=session-note.pdf",
      "Cache-Control": "private, no-store",
    },
  });
}
