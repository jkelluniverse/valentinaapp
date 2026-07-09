import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { getCourseOutline, flattenLessons } from "@/lib/courses";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { InlineField } from "@/components/InlineField";
import { LESSON_TYPES, lessonTypeLabel, lessonTypePill } from "@/lib/course-meta";
import {
  saveCourseField,
  setCourseStatus,
  deleteCourse,
  addChapter,
  saveChapterTitle,
  moveChapter,
  deleteChapter,
  addLesson,
  moveLesson,
  deleteLesson,
  enrollClient,
  enrollAllClients,
  unenrollClient,
} from "../actions";

export const dynamic = "force-dynamic";

const iconBtn =
  "rounded-md border border-line bg-white px-2 py-1 text-xs text-slate transition-colors hover:bg-blush hover:text-wine disabled:opacity-30";

// The outline builder (C6 spec §6): one screen, one mental model —
// Course › Chapters › Lessons. Everything autosaves; nothing is required
// beyond a title. Reordering is one tap (drag-and-drop is a flagged polish).
export default async function CourseBuilderPage({ params }: { params: { courseId: string } }) {
  await requirePractitioner();

  const course = await getCourseOutline(params.courseId);
  if (!course) notFound();

  const [clients, enrollments] = await Promise.all([
    prisma.user.findMany({
      where: { role: "CLIENT", active: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    }),
    prisma.enrollment.findMany({
      where: { courseId: course.id },
      include: {
        client: { select: { id: true, name: true, email: true } },
        progress: { where: { completedAt: { not: null } }, select: { id: true } },
      },
    }),
  ]);

  const totalLessons = flattenLessons(course).length;
  const enrolledIds = new Set(enrollments.map((e) => e.clientId));
  const enrollable = clients.filter((c) => !enrolledIds.has(c.id));

  const publish = setCourseStatus.bind(null, course.id, true);
  const unpublish = setCourseStatus.bind(null, course.id, false);
  const removeCourse = deleteCourse.bind(null, course.id);
  const newChapter = addChapter.bind(null, course.id);
  const enroll = enrollClient.bind(null, course.id);
  const enrollAll = enrollAllClients.bind(null, course.id);

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <Eyebrow>Course builder</Eyebrow>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
              course.status === "PUBLISHED" ? "bg-wine text-white" : "bg-line/50 text-slate"
            }`}
          >
            {course.status === "PUBLISHED" ? "Published" : "Draft"}
          </span>
        </div>
        <InlineField
          action={saveCourseField.bind(null, course.id)}
          name="title"
          defaultValue={course.title}
          placeholder="Give your course a name"
          className="font-headline text-2xl font-semibold text-wine"
        />
        <InlineField
          action={saveCourseField.bind(null, course.id)}
          name="description"
          defaultValue={course.description ?? ""}
          placeholder="A sentence about what this course opens up (optional)"
          textarea
          rows={2}
        />
        <SignatureRule />
        <div className="flex flex-wrap items-center gap-4">
          {course.status === "DRAFT" ? (
            <form action={publish}>
              <button className="rounded-md bg-wine px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wine-dark">
                Publish
              </button>
            </form>
          ) : (
            <form action={unpublish}>
              <button className="rounded-md border border-mocha px-5 py-2.5 text-sm font-medium text-wine transition-colors hover:bg-blush">
                Unpublish
              </button>
            </form>
          )}
          <Link
            href={`/practitioner/courses/${course.id}/preview`}
            className="text-sm font-medium text-wine underline-offset-4 hover:underline"
          >
            Preview as a client
          </Link>
          <form action={removeCourse} className="ml-auto">
            <button className="text-sm text-slate underline-offset-4 hover:text-rose hover:underline">
              Delete course
            </button>
          </form>
        </div>
      </div>

      <section className="flex flex-col gap-4">
        {course.chapters.length === 0 && (
          <p className="text-ink">Start with a chapter — you can rename everything later.</p>
        )}
        {course.chapters.map((chapter, ci) => (
          <div key={chapter.id} className="flex flex-col gap-3 rounded-lg border border-line bg-white p-5 shadow-soft">
            <div className="flex items-start gap-2">
              <span className="mt-2 font-headline text-lg font-semibold text-mocha">{ci + 1}.</span>
              <InlineField
                action={saveChapterTitle.bind(null, chapter.id)}
                name="title"
                defaultValue={chapter.title}
                placeholder="Chapter title"
                className="font-medium"
              />
              <div className="mt-1.5 flex shrink-0 items-center gap-1">
                <form action={moveChapter.bind(null, chapter.id, "up")}>
                  <button className={iconBtn} disabled={ci === 0} title="Move up">↑</button>
                </form>
                <form action={moveChapter.bind(null, chapter.id, "down")}>
                  <button className={iconBtn} disabled={ci === course.chapters.length - 1} title="Move down">↓</button>
                </form>
                <form action={deleteChapter.bind(null, chapter.id)}>
                  <button className={iconBtn} title="Delete chapter">✕</button>
                </form>
              </div>
            </div>

            <ul className="flex flex-col gap-1.5 pl-8">
              {chapter.lessons.map((lesson, li) => (
                <li key={lesson.id} className="flex items-center gap-2 rounded-md border border-line bg-cream/60 px-3 py-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${lessonTypePill(lesson.type)}`}
                  >
                    {lessonTypeLabel(lesson.type)}
                  </span>
                  <Link
                    href={`/practitioner/courses/${course.id}/lessons/${lesson.id}`}
                    className="min-w-0 flex-1 truncate text-sm font-medium text-ink-strong underline-offset-4 hover:text-wine hover:underline"
                  >
                    {lesson.title}
                  </Link>
                  <form action={moveLesson.bind(null, lesson.id, "up")}>
                    <button className={iconBtn} disabled={li === 0} title="Move up">↑</button>
                  </form>
                  <form action={moveLesson.bind(null, lesson.id, "down")}>
                    <button className={iconBtn} disabled={li === chapter.lessons.length - 1} title="Move down">↓</button>
                  </form>
                  <form action={deleteLesson.bind(null, lesson.id)}>
                    <button className={iconBtn} title="Delete lesson">✕</button>
                  </form>
                </li>
              ))}
            </ul>

            <div className="flex flex-wrap items-center gap-2 pl-8">
              <span className="text-xs text-slate">Add:</span>
              {LESSON_TYPES.map((t) => (
                <form key={t.value} action={addLesson.bind(null, chapter.id, t.value)}>
                  <button
                    className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-blush"
                    title={t.ask}
                  >
                    {t.ask}
                  </button>
                </form>
              ))}
            </div>
          </div>
        ))}

        <form action={newChapter}>
          <button className="rounded-md border border-mocha px-5 py-2.5 text-sm font-medium text-wine transition-colors hover:bg-blush">
            Add a chapter
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Who&apos;s taking it</h2>
        {course.status === "DRAFT" && (
          <p className="text-sm text-slate">
            Enrolled clients will see this course once it&apos;s published.
          </p>
        )}
        <div className="flex flex-col gap-3 rounded-lg border border-line bg-white p-5 shadow-soft">
          {enrollments.length === 0 ? (
            <p className="text-sm text-ink">No one yet.</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {enrollments.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-medium text-ink-strong">{e.client.name || e.client.email}</span>
                  <span className="text-slate">
                    · {totalLessons === 0 ? 0 : Math.round((e.progress.length / totalLessons) * 100)}% complete
                  </span>
                  <form action={unenrollClient.bind(null, e.id)} className="ml-auto">
                    <button className="text-xs text-slate underline-offset-4 hover:text-rose hover:underline">
                      Remove
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {enrollable.length > 0 && (
              <form action={enroll} className="flex items-center gap-2">
                <select
                  name="clientId"
                  className="rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-wine"
                >
                  {enrollable.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name || c.email}
                    </option>
                  ))}
                </select>
                <button className="rounded-md bg-wine px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-wine-dark">
                  Enroll
                </button>
              </form>
            )}
            {enrollable.length > 1 && (
              <form action={enrollAll}>
                <button className="rounded-md border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush">
                  Enroll everyone
                </button>
              </form>
            )}
          </div>
        </div>
      </section>

      <Link href="/practitioner/courses" className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline">
        Back to courses
      </Link>
    </div>
  );
}
