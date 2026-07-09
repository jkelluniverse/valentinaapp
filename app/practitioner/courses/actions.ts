"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { LessonType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { parseVideoUrl, LESSON_TYPES } from "@/lib/course-meta";

const COURSES = "/practitioner/courses";
const builderPath = (courseId: string) => `${COURSES}/${courseId}`;

export async function createCourse() {
  const practitioner = await requirePractitioner();
  const course = await prisma.course.create({
    data: { title: "Untitled course", createdById: practitioner.id },
  });
  revalidatePath(COURSES);
  redirect(builderPath(course.id));
}

// Autosave targets: every field saves the moment she leaves it.
export async function saveCourseField(courseId: string, formData: FormData) {
  await requirePractitioner();
  const title = formData.get("title");
  const description = formData.get("description");
  await prisma.course.update({
    where: { id: courseId },
    data: {
      ...(title != null ? { title: String(title).trim() || "Untitled course" } : {}),
      ...(description != null ? { description: String(description).trim() || null } : {}),
    },
  });
  revalidatePath(builderPath(courseId));
}

export async function setCourseStatus(courseId: string, publish: boolean) {
  await requirePractitioner();
  await prisma.course.update({
    where: { id: courseId },
    data: { status: publish ? "PUBLISHED" : "DRAFT" },
  });
  revalidatePath(builderPath(courseId));
  redirect(builderPath(courseId));
}

export async function deleteCourse(courseId: string) {
  await requirePractitioner();
  await prisma.course.delete({ where: { id: courseId } });
  revalidatePath(COURSES);
  redirect(COURSES);
}

export async function addChapter(courseId: string) {
  await requirePractitioner();
  const max = await prisma.chapter.aggregate({ where: { courseId }, _max: { order: true } });
  await prisma.chapter.create({
    data: { courseId, title: "New chapter", order: (max._max.order ?? 0) + 1 },
  });
  revalidatePath(builderPath(courseId));
  redirect(builderPath(courseId));
}

export async function saveChapterTitle(chapterId: string, formData: FormData) {
  await requirePractitioner();
  const chapter = await prisma.chapter.update({
    where: { id: chapterId },
    data: { title: String(formData.get("title") ?? "").trim() || "Untitled chapter" },
    select: { courseId: true },
  });
  revalidatePath(builderPath(chapter.courseId));
}

export async function moveChapter(chapterId: string, direction: "up" | "down") {
  await requirePractitioner();
  const chapter = await prisma.chapter.findUnique({ where: { id: chapterId } });
  if (!chapter) return;
  const neighbor = await prisma.chapter.findFirst({
    where: {
      courseId: chapter.courseId,
      order: direction === "up" ? { lt: chapter.order } : { gt: chapter.order },
    },
    orderBy: { order: direction === "up" ? "desc" : "asc" },
  });
  if (neighbor) {
    await prisma.$transaction([
      prisma.chapter.update({ where: { id: chapter.id }, data: { order: neighbor.order } }),
      prisma.chapter.update({ where: { id: neighbor.id }, data: { order: chapter.order } }),
    ]);
  }
  revalidatePath(builderPath(chapter.courseId));
  redirect(builderPath(chapter.courseId));
}

export async function deleteChapter(chapterId: string) {
  await requirePractitioner();
  const chapter = await prisma.chapter.delete({
    where: { id: chapterId },
    select: { courseId: true },
  });
  revalidatePath(builderPath(chapter.courseId));
  redirect(builderPath(chapter.courseId));
}

// One decision at a time: the only choice at creation is the lesson's kind.
export async function addLesson(chapterId: string, type: LessonType) {
  await requirePractitioner();
  if (!LESSON_TYPES.some((t) => t.value === type)) return;
  const chapter = await prisma.chapter.findUnique({
    where: { id: chapterId },
    select: { courseId: true },
  });
  if (!chapter) return;
  const max = await prisma.lesson.aggregate({ where: { chapterId }, _max: { order: true } });
  const lesson = await prisma.lesson.create({
    data: { chapterId, type, title: "New lesson", order: (max._max.order ?? 0) + 1 },
  });
  revalidatePath(builderPath(chapter.courseId));
  redirect(`${builderPath(chapter.courseId)}/lessons/${lesson.id}`);
}

export async function moveLesson(lessonId: string, direction: "up" | "down") {
  await requirePractitioner();
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { chapter: { select: { courseId: true } } },
  });
  if (!lesson) return;
  const neighbor = await prisma.lesson.findFirst({
    where: {
      chapterId: lesson.chapterId,
      order: direction === "up" ? { lt: lesson.order } : { gt: lesson.order },
    },
    orderBy: { order: direction === "up" ? "desc" : "asc" },
  });
  if (neighbor) {
    await prisma.$transaction([
      prisma.lesson.update({ where: { id: lesson.id }, data: { order: neighbor.order } }),
      prisma.lesson.update({ where: { id: neighbor.id }, data: { order: lesson.order } }),
    ]);
  }
  revalidatePath(builderPath(lesson.chapter.courseId));
  redirect(builderPath(lesson.chapter.courseId));
}

export async function deleteLesson(lessonId: string) {
  await requirePractitioner();
  const lesson = await prisma.lesson.delete({
    where: { id: lessonId },
    select: { chapter: { select: { courseId: true } } },
  });
  revalidatePath(builderPath(lesson.chapter.courseId));
  redirect(builderPath(lesson.chapter.courseId));
}

// Lesson editors (autosave on blur).
export async function saveLessonField(lessonId: string, formData: FormData) {
  await requirePractitioner();
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    select: { id: true, chapter: { select: { courseId: true } } },
  });
  if (!lesson) return;

  const title = formData.get("title");
  const text = formData.get("text");
  const videoUrl = formData.get("videoUrl");
  const promptId = formData.get("promptId");

  const data: Record<string, unknown> = {};
  if (title != null) data.title = String(title).trim() || "Untitled lesson";
  if (text != null) data.content = { text: String(text) };
  if (videoUrl != null) {
    const raw = String(videoUrl).trim();
    const parsed = raw ? parseVideoUrl(raw) : null;
    data.videoUrl = raw || null;
    data.videoSource = parsed?.source ?? null;
  }
  if (promptId != null) data.promptId = String(promptId) || null;

  await prisma.lesson.update({ where: { id: lessonId }, data });
  revalidatePath(`${builderPath(lesson.chapter.courseId)}/lessons/${lessonId}`);
  revalidatePath(builderPath(lesson.chapter.courseId));
}

// Enrollment (C7.1): one client, or everyone active at once.
export async function enrollClient(courseId: string, formData: FormData) {
  await requirePractitioner();
  const clientId = String(formData.get("clientId") ?? "");
  const client = await prisma.user.findFirst({
    where: { id: clientId, role: "CLIENT" },
    select: { id: true },
  });
  if (client) {
    await prisma.enrollment.upsert({
      where: { courseId_clientId: { courseId, clientId: client.id } },
      create: { courseId, clientId: client.id },
      update: {},
    });
  }
  revalidatePath(builderPath(courseId));
  redirect(builderPath(courseId));
}

export async function enrollAllClients(courseId: string) {
  await requirePractitioner();
  const clients = await prisma.user.findMany({
    where: { role: "CLIENT", active: true },
    select: { id: true },
  });
  for (const c of clients) {
    await prisma.enrollment.upsert({
      where: { courseId_clientId: { courseId, clientId: c.id } },
      create: { courseId, clientId: c.id },
      update: {},
    });
  }
  revalidatePath(builderPath(courseId));
  redirect(builderPath(courseId));
}

export async function unenrollClient(enrollmentId: string) {
  await requirePractitioner();
  const enrollment = await prisma.enrollment.delete({
    where: { id: enrollmentId },
    select: { courseId: true },
  });
  revalidatePath(builderPath(enrollment.courseId));
  redirect(builderPath(enrollment.courseId));
}
