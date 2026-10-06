import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-guards";
import { renderReadingPdf } from "@/lib/reading-pdf";
import { displayName } from "@/lib/name";

// The reading as a downloadable report. Two doors, same file: the
// practitioner for any client; a client for their own — and only once it's
// published (a pending draft is hers to review, not theirs to download).

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { clientId: string } }) {
  const me = await getSessionUser();
  if (!me) return new NextResponse("Unauthorized", { status: 401 });
  const isPractitioner = me.role === "PRACTITIONER";
  if (!isPractitioner && me.id !== params.clientId) {
    return new NextResponse("Not found", { status: 404 });
  }

  const client = await prisma.user.findFirst({
    where: { id: params.clientId, role: "CLIENT" },
    select: { id: true, name: true, email: true, locale: true },
  });
  if (!client) return new NextResponse("Not found", { status: 404 });

  const reading = await prisma.integrativeReading.findUnique({ where: { userId: client.id } });
  if (!reading || (!isPractitioner && reading.status !== "PUBLISHED")) {
    return new NextResponse("Not found", { status: 404 });
  }

  const locale = client.locale === "es" ? ("es" as const) : ("en" as const);
  const pdf = renderReadingPdf({
    locale,
    clientName: displayName(client),
    content: reading.content,
    generatedDate: reading.generatedAt.toLocaleDateString(locale === "es" ? "es-US" : "en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    }),
  });

  return new NextResponse(Buffer.from(pdf.base64, "base64"), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${pdf.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
