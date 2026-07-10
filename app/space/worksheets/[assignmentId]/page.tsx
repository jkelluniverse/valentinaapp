import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { WorksheetFill } from "@/components/WorksheetFill";
import { WorksheetAnswersView } from "@/components/WorksheetAnswers";
import { formatDay } from "@/components/entries";
import { parseFields, type WorksheetAnswers } from "@/lib/worksheet-meta";
import { submitWorksheet } from "../actions";

export const dynamic = "force-dynamic";

// The client fill-out (C9 spec §6) — calm, sectioned, autosaving on-device.
export default async function WorksheetFillPage({
  params,
  searchParams,
}: {
  params: { assignmentId: string };
  searchParams: { error?: string; done?: string };
}) {
  const user = await requireClient();

  const assignment = await prisma.worksheetAssignment.findFirst({
    where: { id: params.assignmentId, clientId: user.id },
    include: { worksheet: true, response: true },
  });
  if (!assignment) notFound();

  const fields = parseFields(assignment.worksheet.schema);
  const submit = submitWorksheet.bind(null, assignment.id);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>A worksheet from Valentina</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">{assignment.worksheet.title}</h1>
        {assignment.worksheet.intro && (
          <p className="max-w-prose text-lg leading-relaxed text-ink">{assignment.worksheet.intro}</p>
        )}
        <SignatureRule />
        {assignment.dueAt && assignment.status === "PENDING" && (
          <p className="text-sm text-slate">
            Whenever you&apos;re ready — ideally by {formatDay(assignment.dueAt)}.
          </p>
        )}
      </div>

      {searchParams.done && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          Sent to Valentina — thank you for taking the time.
        </p>
      )}

      {assignment.status === "PENDING" ? (
        <WorksheetFill
          assignmentId={assignment.id}
          fields={fields}
          action={submit}
          error={
            searchParams.error === "required"
              ? "A few starred questions still need an answer."
              : null
          }
        />
      ) : assignment.response ? (
        <div className="flex flex-col gap-4 rounded-lg border border-line bg-white p-6 shadow-soft">
          <p className="text-xs text-slate">
            Sent {formatDay(assignment.response.completedAt)}
          </p>
          <WorksheetAnswersView
            fields={fields}
            answers={assignment.response.answers as WorksheetAnswers}
          />
        </div>
      ) : (
        <p className="text-ink">You set this one aside.</p>
      )}

      <Link href="/space" className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline">
        Back to your space
      </Link>
    </div>
  );
}
