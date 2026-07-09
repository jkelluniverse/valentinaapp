import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth-guards";
import { getEnrolledCourse, flattenLessons } from "@/lib/courses";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { LessonBody } from "@/components/LessonContent";
import { MoodDots, formatDay } from "@/components/entries";
import { markLessonComplete, respondToExercise } from "../../../actions";
import { ExerciseForm } from "./ExerciseForm";

export const dynamic = "force-dynamic";

// The lesson player (C7.2/7.3): watch, read, or do — then move on.
export default async function LessonPlayerPage({
  params,
  searchParams,
}: {
  params: { courseId: string; lessonId: string };
  searchParams: { error?: string; responded?: string };
}) {
  const user = await requireClient();
  const enrolled = await getEnrolledCourse(user.id, params.courseId);
  if (!enrolled) notFound();

  const lessons = flattenLessons(enrolled.course);
  const idx = lessons.findIndex((l) => l.id === params.lessonId);
  if (idx < 0) notFound();
  const lesson = lessons[idx];
  const prev = idx > 0 ? lessons[idx - 1] : null;
  const next = idx < lessons.length - 1 ? lessons[idx + 1] : null;
  const isDone = enrolled.done.has(lesson.id);

  const lessonUrl = (id: string) => `/space/courses/${params.courseId}/lessons/${id}`;
  const afterUrl = next ? lessonUrl(next.id) : `/space/courses/${params.courseId}`;
  const complete = markLessonComplete.bind(null, lesson.id, afterUrl);
  const respond = respondToExercise.bind(null, lesson.id);

  // For an exercise lesson, show the prompt and (if already answered through
  // this course) the client's own latest response.
  const prompt = lesson.promptId
    ? await prisma.prompt.findUnique({ where: { id: lesson.promptId } })
    : null;
  const existingResponse =
    isDone && prompt
      ? await prisma.promptResponse.findFirst({
          where: { assignment: { clientId: user.id, promptId: prompt.id } },
          orderBy: { completedAt: "desc" },
        })
      : null;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>
          {enrolled.course.title} · {lesson.chapterTitle}
        </Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">{lesson.title}</h1>
        <SignatureRule />
      </div>

      {searchParams.responded && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          Response saved — beautifully done.
        </p>
      )}

      <LessonBody lesson={lesson} />

      {lesson.type === "EXERCISE" &&
        (prompt ? (
          <div className="flex flex-col gap-4 rounded-lg border border-line bg-white p-6 shadow-soft">
            <div className="flex flex-col gap-2">
              <h2 className="text-xl font-semibold">{prompt.title}</h2>
              <p className="whitespace-pre-wrap leading-relaxed text-ink">{prompt.body}</p>
            </div>
            {existingResponse ? (
              <div className="flex flex-col gap-2 rounded-md bg-cream p-4">
                <div className="flex items-center gap-3">
                  <MoodDots mood={existingResponse.mood} />
                  <span className="ml-auto text-xs text-slate">
                    {formatDay(existingResponse.completedAt)}
                  </span>
                </div>
                {existingResponse.body && (
                  <p className="whitespace-pre-wrap leading-relaxed text-ink">{existingResponse.body}</p>
                )}
              </div>
            ) : (
              <ExerciseForm
                action={respond}
                isCheckIn={prompt.kind === "CHECK_IN"}
                error={
                  searchParams.error === "empty"
                    ? "Add a few words (or pick an intensity) before saving."
                    : null
                }
              />
            )}
          </div>
        ) : (
          <p className="text-ink">This exercise isn&apos;t ready yet — check back soon.</p>
        ))}

      <div className="flex flex-wrap items-center gap-4">
        {lesson.type !== "EXERCISE" && !isDone && (
          <form action={complete}>
            <button className="rounded-md bg-wine px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-wine-dark">
              Mark complete {next ? "& continue" : ""}
            </button>
          </form>
        )}
        {isDone && <span className="text-sm font-medium text-wine">Completed ✓</span>}
        <div className="ml-auto flex items-center gap-4 text-sm">
          {prev && (
            <Link href={lessonUrl(prev.id)} className="text-slate underline-offset-4 hover:text-wine hover:underline">
              ← Previous
            </Link>
          )}
          {next && (
            <Link href={lessonUrl(next.id)} className="font-medium text-wine underline-offset-4 hover:underline">
              Next →
            </Link>
          )}
        </div>
      </div>

      <Link
        href={`/space/courses/${params.courseId}`}
        className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
      >
        Course outline
      </Link>
    </div>
  );
}
