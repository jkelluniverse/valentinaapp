"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth-guards";
import { record, promptResponseToRecord, snapshot } from "@/lib/record";

// Player writes (C7). Ownership is always re-derived from the session; a
// lesson in a course the client isn't enrolled in behaves like a missing one.

async function getPlayable(lessonId: string, clientId: string) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { chapter: { include: { course: { select: { id: true, title: true, status: true } } } } },
  });
  if (!lesson || lesson.chapter.course.status !== "PUBLISHED") return null;
  const enrollment = await prisma.enrollment.findUnique({
    where: { courseId_clientId: { courseId: lesson.chapter.course.id, clientId } },
  });
  if (!enrollment) return null;
  return { lesson, course: lesson.chapter.course, enrollment };
}

export async function markLessonComplete(lessonId: string, nextUrl: string) {
  const user = await requireClient();
  const playable = await getPlayable(lessonId, user.id);
  if (!playable) redirect("/space/courses");

  await prisma.$transaction(async (tx) => {
    const progress = await tx.lessonProgress.upsert({
      where: { enrollmentId_lessonId: { enrollmentId: playable.enrollment.id, lessonId } },
      create: { enrollmentId: playable.enrollment.id, lessonId, completedAt: new Date() },
      update: { completedAt: new Date() },
    });
    // Course activity feeds the unified record (C4).
    await record.append(
      {
        clientId: user.id,
        kind: "COURSE_ACTIVITY",
        occurredAt: new Date(),
        title: playable.lesson.title,
        summary: `Completed a lesson in “${playable.course.title}”`,
        tags: [],
        sourceType: "LessonProgress",
        sourceId: progress.id,
      },
      tx,
    );
  });

  revalidatePath(`/space/courses/${playable.course.id}`);
  redirect(nextUrl);
}

// An exercise response is the lesson's completion. It flows through the same
// assignment → response path as C3, so it feeds the record automatically.
export async function respondToExercise(lessonId: string, formData: FormData) {
  const user = await requireClient();
  if (!user.consentAt) redirect("/space?error=consent");

  const playable = await getPlayable(lessonId, user.id);
  if (!playable || !playable.lesson.promptId) redirect("/space/courses");

  const prompt = await prisma.prompt.findUnique({
    where: { id: playable.lesson.promptId },
    select: { id: true, title: true, kind: true },
  });
  if (!prompt) redirect("/space/courses");

  const body = String(formData.get("body") ?? "").trim() || null;
  const rawMood = String(formData.get("mood") ?? "");
  const mood = /^[1-5]$/.test(rawMood) ? Number(rawMood) : null;
  const enough = prompt.kind === "CHECK_IN" ? mood !== null || body : body;
  const lessonUrl = `/space/courses/${playable.course.id}/lessons/${lessonId}`;
  if (!enough) redirect(`${lessonUrl}?error=empty`);

  await prisma.$transaction(async (tx) => {
    const assignment = await tx.assignment.create({
      data: {
        promptId: prompt.id,
        clientId: user.id,
        assignedById: user.id, // self-served via the course, not sent manually
        status: "COMPLETED",
      },
    });
    const response = await tx.promptResponse.create({
      data: { assignmentId: assignment.id, body, mood },
    });
    await record.append(
      promptResponseToRecord({
        responseId: response.id,
        clientId: user.id,
        promptTitle: `${prompt.title} · from “${playable.course.title}”`,
        completedAt: response.completedAt,
        body: snapshot(body),
        mood,
      }),
      tx,
    );
    await tx.lessonProgress.upsert({
      where: { enrollmentId_lessonId: { enrollmentId: playable.enrollment.id, lessonId } },
      create: { enrollmentId: playable.enrollment.id, lessonId, completedAt: new Date() },
      update: { completedAt: new Date() },
    });
  });

  revalidatePath(`/space/courses/${playable.course.id}`);
  redirect(`${lessonUrl}?responded=1`);
}
