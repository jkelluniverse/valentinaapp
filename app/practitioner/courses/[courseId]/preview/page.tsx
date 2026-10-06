import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { getCourseOutline } from "@/lib/courses";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { LessonBody } from "@/components/LessonContent";
import { lessonTypeLabel, lessonTypePill } from "@/lib/course-meta";

export const dynamic = "force-dynamic";

// Preview as a client (C6.5): the same content a client would see, without
// progress. Works on drafts, which stay invisible to real clients.
export default async function CoursePreviewPage({
  params,
  searchParams,
}: {
  params: { courseId: string };
  searchParams: { lesson?: string };
}) {
  await requirePractitioner();

  const course = await getCourseOutline(params.courseId);
  if (!course) notFound();

  const lessons = course.chapters.flatMap((ch) => ch.lessons);
  const current = searchParams.lesson
    ? lessons.find((l) => l.id === searchParams.lesson)
    : null;
  const prompt = current?.promptId
    ? await prisma.prompt.findUnique({ where: { id: current.promptId } })
    : null;

  return (
    <div className="flex flex-col gap-8">
      <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
        Preview — this is what an enrolled client sees.{" "}
        <Link href={`/practitioner/courses/${course.id}`} className="font-medium underline underline-offset-4">
          Back to the builder
        </Link>
      </p>

      {current ? (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Eyebrow>{course.title}</Eyebrow>
            <h1 className="text-[2.25rem] font-semibold">{current.title}</h1>
            <SignatureRule />
          </div>
          <LessonBody lesson={current} />
          {current.type === "EXERCISE" &&
            (prompt ? (
              <div className="flex flex-col gap-3 rounded-lg border border-line bg-white p-6 shadow-soft">
                <h2 className="text-xl font-semibold">{prompt.title}</h2>
                <p className="whitespace-pre-wrap leading-relaxed text-ink">{prompt.body}</p>
                <p className="text-sm text-slate">(Clients get a response box here.)</p>
              </div>
            ) : (
              <p className="text-ink">No exercise attached yet.</p>
            ))}
          <Link
            href={`/practitioner/courses/${course.id}/preview`}
            className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
          >
            Back to the outline
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Eyebrow>Course</Eyebrow>
            <h1 className="text-[2.25rem] font-semibold">{course.title}</h1>
            {course.description && <p className="max-w-prose text-lg text-ink">{course.description}</p>}
            <SignatureRule />
          </div>
          <div className="flex flex-col gap-4">
            {course.chapters.map((chapter, ci) => (
              <div key={chapter.id} className="flex flex-col gap-2 rounded-lg border border-line bg-white p-5 shadow-soft">
                <h2 className="text-lg font-semibold">
                  {ci + 1}. {chapter.title}
                </h2>
                <ul className="flex flex-col gap-1.5">
                  {chapter.lessons.map((lesson) => (
                    <li key={lesson.id}>
                      <Link
                        href={`/practitioner/courses/${course.id}/preview?lesson=${lesson.id}`}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-blush"
                      >
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${lessonTypePill(lesson.type)}`}>
                          {lessonTypeLabel(lesson.type)}
                        </span>
                        <span className="text-sm font-medium text-ink-strong">{lesson.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
