import { prisma } from "@/lib/prisma";

// Shared course reads for the builder, preview, and player.

export async function getCourseOutline(courseId: string) {
  return prisma.course.findUnique({
    where: { id: courseId },
    include: {
      chapters: {
        orderBy: { order: "asc" },
        include: { lessons: { orderBy: { order: "asc" } } },
      },
    },
  });
}

export type CourseOutline = NonNullable<Awaited<ReturnType<typeof getCourseOutline>>>;

export function flattenLessons(course: CourseOutline) {
  return course.chapters.flatMap((ch) => ch.lessons.map((l) => ({ ...l, chapterTitle: ch.title })));
}

// The player's authorization read: only an enrolled client on a PUBLISHED
// course gets anything back.
export async function getEnrolledCourse(clientId: string, courseId: string) {
  const enrollment = await prisma.enrollment.findUnique({
    where: { courseId_clientId: { courseId, clientId } },
    include: { progress: true },
  });
  if (!enrollment) return null;

  const course = await getCourseOutline(courseId);
  if (!course || course.status !== "PUBLISHED") return null;

  const done = new Set(
    enrollment.progress.filter((p) => p.completedAt).map((p) => p.lessonId),
  );
  const lessons = flattenLessons(course);
  const total = lessons.length;
  const completed = lessons.filter((l) => done.has(l.id)).length;
  const next = lessons.find((l) => !done.has(l.id)) ?? null;

  return {
    course,
    enrollment,
    done,
    total,
    completed,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    next,
  };
}

export async function listEnrolledCourses(clientId: string) {
  const enrollments = await prisma.enrollment.findMany({
    where: { clientId, course: { status: "PUBLISHED" } },
    include: {
      course: { include: { chapters: { include: { lessons: { select: { id: true } } } } } },
      progress: { where: { completedAt: { not: null } }, select: { lessonId: true } },
    },
    orderBy: { enrolledAt: "desc" },
  });

  return enrollments.map((e) => {
    const total = e.course.chapters.reduce((n, ch) => n + ch.lessons.length, 0);
    const completed = e.progress.length;
    return {
      courseId: e.courseId,
      title: e.course.title,
      description: e.course.description,
      total,
      completed,
      percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    };
  });
}
