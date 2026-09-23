import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { WorksheetAnswersView } from "@/components/WorksheetAnswers";
import { formatDay } from "@/components/entries";
import { parseFields, type WorksheetAnswers } from "@/lib/worksheet-meta";

export const dynamic = "force-dynamic";

// Read-only worksheet response (C9.5). Practitioner-only.
export default async function WorksheetResponsePage({
  params,
}: {
  params: { clientId: string; assignmentId: string };
}) {
  await requirePractitioner();

  const assignment = await prisma.worksheetAssignment.findFirst({
    where: { id: params.assignmentId, clientId: params.clientId },
    include: {
      worksheet: true,
      response: true,
      client: { select: { name: true, email: true } },
    },
  });
  if (!assignment || !assignment.response) notFound();

  return (
    <div className="mx-auto flex max-w-[720px] flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>
          {assignment.client.name || assignment.client.email} · sent{" "}
          {formatDay(assignment.response.completedAt)}
        </Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">{assignment.worksheet.title}</h1>
        <p className="text-sm text-slate">read-only</p>
        <SignatureRule />
      </div>

      <div className="rounded-lg border border-line bg-white p-6 shadow-soft">
        <WorksheetAnswersView
          fields={parseFields(assignment.worksheet.schema)}
          answers={assignment.response.answers as WorksheetAnswers}
        />
      </div>

      <Link
        href={`/practitioner/clients/${params.clientId}`}
        className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
      >
        Back to the client page
      </Link>
    </div>
  );
}
