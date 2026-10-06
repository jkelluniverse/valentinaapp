import Link from "next/link";
import { notFound } from "next/navigation";
import { requireClient } from "@/lib/auth-guards";
import { getEnrolledCourse } from "@/lib/courses";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { lessonTypeLabel, lessonTypePill } from "@/lib/course-meta";

export const dynamic = "force-dynamic";

export default async function ClientCoursePage({ params }: { params: { courseId: string } }) {
  const user = await requireClient();
  const enrolled = await getEnrolledCourse(user.id, params.courseId);
  if (!enrolled) notFound();

  const { course, done, percent, next } = enrolled;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>Course · {percent}% complete</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">{course.title}</h1>
        {course.description && <p className="max-w-prose text-lg text-ink">{course.description}</p>}
        <SignatureRule />
        {next && (
          <Link
            href={`/space/courses/${course.id}/lessons/${next.id}`}
            className="mt-2 self-start rounded-md bg-wine px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-wine-dark"
          >
            {percent === 0 ? "Begin" : "Pick up where you left off"}
          </Link>
        )}
        {!next && percent === 100 && (
          <p className="mt-2 text-sm font-medium text-wine">You&apos;ve completed this course 🎉</p>
        )}
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
                    href={`/space/courses/${course.id}/lessons/${lesson.id}`}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-blush"
                  >
                    <span
                      className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                        done.has(lesson.id) ? "bg-wine text-white" : "border border-line text-slate"
                      }`}
                    >
                      {done.has(lesson.id) ? "✓" : ""}
                    </span>
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

      <Link href="/space/courses" className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline">
        All your courses
      </Link>
    </div>
  );
}
