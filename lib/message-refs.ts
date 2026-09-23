import { prisma } from "@/lib/prisma";

// C15.2 — reference cards. A message may carry references to in-app objects,
// resolved LIVE (a renamed worksheet's card follows). Each party may only
// reference what they're allowed to see; resolution re-checks scope so a stale
// or hand-crafted reference can never leak another client's material.

export const REF_TYPES = ["ASSIGNMENT", "WORKSHEET", "COURSE", "LESSON", "READING", "REFLECTION"] as const;
export type RefType = (typeof REF_TYPES)[number];

export type MessageRef = { type: RefType; id: string };

export type ResolvedRef = {
  type: RefType;
  id: string;
  kindLabel: string;
  title: string;
  context: string | null;
  href: string; // where THIS viewer opens it
};

export function parseRefs(raw: unknown): MessageRef[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (r): r is MessageRef =>
        !!r && typeof r === "object" && REF_TYPES.includes((r as MessageRef).type) && typeof (r as MessageRef).id === "string",
    )
    .slice(0, 6);
}

type Viewer = { role: "CLIENT" | "PRACTITIONER"; clientId: string };

// Resolve references for display, scoped to the viewer. `clientId` is the
// conversation's client (the practitioner views a client's thread).
export async function resolveRefs(refs: MessageRef[], viewer: Viewer): Promise<ResolvedRef[]> {
  const out: ResolvedRef[] = [];
  const isClient = viewer.role === "CLIENT";
  const clientBase = "/space";
  const practBase = `/practitioner/clients/${viewer.clientId}`;

  for (const ref of refs) {
    try {
      if (ref.type === "ASSIGNMENT") {
        const a = await prisma.assignment.findFirst({
          where: { id: ref.id, clientId: viewer.clientId },
          include: { prompt: { select: { title: true, kind: true } } },
        });
        if (a) {
          out.push({
            type: ref.type,
            id: ref.id,
            kindLabel: a.prompt.kind === "EXERCISE" ? "Exercise" : a.prompt.kind === "CHECK_IN" ? "Check-in" : "Prompt",
            title: a.prompt.title,
            context: a.status === "COMPLETED" ? "answered" : "waiting",
            href: isClient ? `${clientBase}/prompts/${a.id}` : `${practBase}?tab=between`,
          });
        }
      } else if (ref.type === "WORKSHEET") {
        // A worksheet ASSIGNMENT (their own) — scoped to the client.
        const wa = await prisma.worksheetAssignment.findFirst({
          where: { id: ref.id, clientId: viewer.clientId },
          include: { worksheet: { select: { title: true } } },
        });
        if (wa) {
          out.push({
            type: ref.type,
            id: ref.id,
            kindLabel: "Worksheet",
            title: wa.worksheet.title,
            context: wa.status === "COMPLETED" ? "completed" : "to fill in",
            href: isClient ? `${clientBase}/worksheets/${wa.id}` : `${practBase}?tab=between`,
          });
        }
      } else if (ref.type === "COURSE") {
        const enrolled = await prisma.enrollment.findFirst({
          where: { courseId: ref.id, clientId: viewer.clientId },
          include: { course: { select: { title: true } } },
        });
        if (enrolled) {
          out.push({
            type: ref.type,
            id: ref.id,
            kindLabel: "Course",
            title: enrolled.course.title,
            context: null,
            href: isClient ? `${clientBase}/courses/${ref.id}` : `${practBase}?tab=courses`,
          });
        }
      } else if (ref.type === "LESSON") {
        const lesson = await prisma.lesson.findUnique({
          where: { id: ref.id },
          include: { chapter: { select: { courseId: true, course: { select: { title: true } } } } },
        });
        // Only if the client is enrolled in the lesson's course.
        if (lesson) {
          const enrolled = await prisma.enrollment.findFirst({
            where: { courseId: lesson.chapter.courseId, clientId: viewer.clientId },
            select: { id: true },
          });
          if (enrolled) {
            out.push({
              type: ref.type,
              id: ref.id,
              kindLabel: "Lesson",
              title: lesson.title,
              context: `in ${lesson.chapter.course.title}`,
              href: isClient
                ? `${clientBase}/courses/${lesson.chapter.courseId}/lessons/${lesson.id}`
                : `/practitioner/courses/${lesson.chapter.courseId}/lessons/${lesson.id}`,
            });
          }
        }
      } else if (ref.type === "READING") {
        const reading = await prisma.integrativeReading.findFirst({
          where: { userId: viewer.clientId, status: "PUBLISHED" },
          select: { id: true },
        });
        if (reading) {
          out.push({
            type: ref.type,
            id: viewer.clientId,
            kindLabel: "Your reading",
            title: "What it all means to you",
            context: null,
            href: isClient ? `${clientBase}/design` : `${practBase}/design`,
          });
        }
      } else if (ref.type === "REFLECTION") {
        const entry = await prisma.logEntry.findFirst({
          where: { id: ref.id, clientId: viewer.clientId },
          select: { id: true, body: true },
        });
        if (entry) {
          out.push({
            type: ref.type,
            id: ref.id,
            kindLabel: "Reflection",
            title: entry.body.length > 60 ? `${entry.body.slice(0, 60).trimEnd()}…` : entry.body,
            context: null,
            href: isClient ? `${clientBase}/entries/${entry.id}` : `${practBase}?tab=record`,
          });
        }
      }
    } catch {
      // A broken reference simply doesn't render — never throws the thread.
    }
  }
  return out;
}

// What each party may attach, for the composer picker. Scoped by construction.
export async function referenceableFor(viewer: Viewer): Promise<
  { type: RefType; label: string; options: { id: string; label: string }[] }[]
> {
  const groups: { type: RefType; label: string; options: { id: string; label: string }[] }[] = [];

  if (viewer.role === "PRACTITIONER") {
    // She references things she's sent this client, their courses, and their reading.
    const [assignments, worksheets, courses, reading] = await Promise.all([
      prisma.assignment.findMany({
        where: { clientId: viewer.clientId },
        include: { prompt: { select: { title: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.worksheetAssignment.findMany({
        where: { clientId: viewer.clientId },
        include: { worksheet: { select: { title: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.enrollment.findMany({
        where: { clientId: viewer.clientId },
        include: { course: { select: { title: true } } },
      }),
      prisma.integrativeReading.findFirst({ where: { userId: viewer.clientId, status: "PUBLISHED" }, select: { id: true } }),
    ]);
    if (assignments.length)
      groups.push({ type: "ASSIGNMENT", label: "Prompts sent", options: assignments.map((a) => ({ id: a.id, label: a.prompt.title })) });
    if (worksheets.length)
      groups.push({ type: "WORKSHEET", label: "Worksheets sent", options: worksheets.map((w) => ({ id: w.id, label: w.worksheet.title })) });
    if (courses.length)
      groups.push({ type: "COURSE", label: "Their courses", options: courses.map((c) => ({ id: c.courseId, label: c.course.title })) });
    if (reading) groups.push({ type: "READING", label: "Their reading", options: [{ id: viewer.clientId, label: "What it all means to you" }] });
  } else {
    // The client references only their OWN material.
    const [assignments, worksheets, entries, courses, reading] = await Promise.all([
      prisma.assignment.findMany({
        where: { clientId: viewer.clientId },
        include: { prompt: { select: { title: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.worksheetAssignment.findMany({
        where: { clientId: viewer.clientId },
        include: { worksheet: { select: { title: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.logEntry.findMany({
        where: { clientId: viewer.clientId },
        orderBy: { occurredAt: "desc" },
        take: 20,
        select: { id: true, body: true },
      }),
      prisma.enrollment.findMany({
        where: { clientId: viewer.clientId },
        include: { course: { select: { title: true } } },
      }),
      prisma.integrativeReading.findFirst({ where: { userId: viewer.clientId, status: "PUBLISHED" }, select: { id: true } }),
    ]);
    if (entries.length)
      groups.push({
        type: "REFLECTION",
        label: "Your reflections",
        options: entries.map((e) => ({ id: e.id, label: e.body.length > 50 ? `${e.body.slice(0, 50).trimEnd()}…` : e.body })),
      });
    if (assignments.length)
      groups.push({ type: "ASSIGNMENT", label: "From Valentina", options: assignments.map((a) => ({ id: a.id, label: a.prompt.title })) });
    if (worksheets.length)
      groups.push({ type: "WORKSHEET", label: "Your worksheets", options: worksheets.map((w) => ({ id: w.id, label: w.worksheet.title })) });
    if (courses.length)
      groups.push({ type: "COURSE", label: "Your courses", options: courses.map((c) => ({ id: c.courseId, label: c.course.title })) });
    if (reading) groups.push({ type: "READING", label: "Your reading", options: [{ id: viewer.clientId, label: "What it all means to you" }] });
  }
  return groups;
}
