import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { WorksheetFill } from "@/components/WorksheetFill";
import { parseFields } from "@/lib/worksheet-meta";

export const dynamic = "force-dynamic";

export default async function WorksheetPreviewPage({ params }: { params: { worksheetId: string } }) {
  await requirePractitioner();

  const worksheet = await prisma.worksheet.findUnique({ where: { id: params.worksheetId } });
  if (!worksheet) notFound();

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-8">
      <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
        Preview — this is what a client sees.{" "}
        <Link
          href={`/practitioner/worksheets/${worksheet.id}`}
          className="font-medium underline underline-offset-4"
        >
          Back to the builder
        </Link>
      </p>
      <div className="flex flex-col gap-2">
        <Eyebrow>From Valentina</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">{worksheet.title}</h1>
        {worksheet.intro && <p className="max-w-prose text-lg leading-relaxed text-ink">{worksheet.intro}</p>}
        <SignatureRule />
      </div>
      <WorksheetFill assignmentId="preview" fields={parseFields(worksheet.schema)} preview />
    </div>
  );
}
