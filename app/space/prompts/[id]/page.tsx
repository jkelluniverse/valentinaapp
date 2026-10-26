import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { MoodDots, formatDay } from "@/components/entries";
import { promptKindClientLabel } from "@/lib/prompt-meta";
import { RespondForm } from "./RespondForm";
import { respondToAssignment, dismissAssignment } from "../actions";

export const dynamic = "force-dynamic";

export default async function AssignmentPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const user = await requireClient();

  // Scoped to the session user: someone else's assignment id is a plain 404.
  const assignment = await prisma.assignment.findFirst({
    where: { id: params.id, clientId: user.id },
    include: { prompt: true, response: true },
  });
  if (!assignment) notFound();

  const respond = respondToAssignment.bind(null, assignment.id);
  const dismiss = dismissAssignment.bind(null, assignment.id);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>{promptKindClientLabel(assignment.prompt.kind)}</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">{assignment.prompt.title}</h1>
        <SignatureRule />
        {assignment.dueAt && assignment.status === "PENDING" && (
          <p className="text-sm text-slate">Whenever you&apos;re ready — ideally by {formatDay(assignment.dueAt)}.</p>
        )}
      </div>

      <div className="rounded-lg border border-line bg-white p-6 shadow-soft">
        <p className="whitespace-pre-wrap text-lg leading-relaxed text-ink">
          {assignment.prompt.body}
        </p>
      </div>

      {assignment.status === "PENDING" ? (
        <RespondForm
          action={respond}
          dismissAction={dismiss}
          isCheckIn={assignment.prompt.kind === "CHECK_IN"}
          error={
            searchParams.error === "empty"
              ? "Add a few words (or pick an intensity) before saving."
              : null
          }
        />
      ) : assignment.response ? (
        <div className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold">Your response</h2>
          <div className="flex flex-col gap-2 rounded-lg border border-line bg-white p-6 shadow-soft">
            <div className="flex items-center gap-3">
              <MoodDots mood={assignment.response.mood} />
              <span className="ml-auto text-xs text-slate">
                {formatDay(assignment.response.completedAt)}
              </span>
            </div>
            {assignment.response.body && (
              <p className="whitespace-pre-wrap leading-relaxed text-ink">
                {assignment.response.body}
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="text-ink">You set this one aside.</p>
      )}

      <Link
        href="/space"
        className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
      >
        Back to your space
      </Link>
    </div>
  );
}
