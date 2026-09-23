import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth-guards";

export const dynamic = "force-dynamic";

// AMD-05 B3 — "you can ask for a copy of your information": the complete JSON
// export of the CLIENT'S OWN material. Deliberately excluded: Valentina's
// notes (the Margins), session preps, note scans, AI-extracted psyche nodes,
// edges, and extractions — her clinical thinking is not their record.
export async function GET() {
  // AMD-06 §2 exclusion 4 — data export stays the client's own act.
  const { forbidInAssist } = await import("@/lib/assist");
  await forbidInAssist("export");
  const user = await requireClient();

  const [
    account,
    consents,
    profile,
    entries,
    promptResponses,
    worksheetResponses,
    conversation,
    enrollments,
    selfNodes,
    reading,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true, email: true, locale: true, createdAt: true },
    }),
    prisma.consentGrant.findMany({
      where: { userId: user.id },
      select: { version: true, grantedAt: true },
      orderBy: { grantedAt: "asc" },
    }),
    prisma.clientProfile.findUnique({
      where: { userId: user.id },
      select: {
        preferredName: true,
        pronouns: true,
        phone: true,
        birthDate: true,
        birthTime: true,
        birthTimeUnknown: true,
        birthTimePrecision: true,
        birthPlace: true,
        birthLat: true,
        birthLng: true,
        birthTz: true,
        paymentRemindersMuted: true,
        renewalMessagesMuted: true,
        intakeCompletedAt: true,
        firstMapCompletedAt: true,
        stage: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.logEntry.findMany({
      where: { clientId: user.id },
      orderBy: { occurredAt: "asc" },
    }),
    prisma.promptResponse.findMany({
      where: { assignment: { clientId: user.id } },
      include: { assignment: { include: { prompt: { select: { title: true, body: true } } } } },
      orderBy: { completedAt: "asc" },
    }),
    prisma.worksheetResponse.findMany({
      where: { assignment: { clientId: user.id } },
      include: { assignment: { include: { worksheet: { select: { title: true } } } } },
      orderBy: { completedAt: "asc" },
    }),
    prisma.conversation.findUnique({
      where: { clientId: user.id },
      include: {
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: "asc" },
          select: { senderRole: true, body: true, createdAt: true },
        },
      },
    }),
    prisma.enrollment.findMany({
      where: { clientId: user.id },
      include: {
        course: { select: { title: true } },
        progress: { select: { lessonId: true, completedAt: true } },
      },
      orderBy: { enrolledAt: "asc" },
    }),
    prisma.psycheNode.findMany({
      where: { clientId: user.id, source: "SELF_REPORTED" },
      select: {
        kind: true,
        label: true,
        description: true,
        state: true,
        selfX: true,
        selfY: true,
        promptKey: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.integrativeReading.findUnique({
      where: { userId: user.id },
      select: { content: true, generatedAt: true },
    }),
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    about:
      "Your complete record from Veritas: everything you created or shared, plus your reading. Valentina's own working notes are hers and are not part of your record.",
    account,
    consentGrants: consents,
    profile,
    reflections: entries,
    promptResponses: promptResponses.map((r) => ({
      promptTitle: r.assignment.prompt.title,
      promptBody: r.assignment.prompt.body,
      body: r.body,
      mood: r.mood,
      completedAt: r.completedAt,
    })),
    worksheetResponses: worksheetResponses.map((r) => ({
      worksheetTitle: r.assignment.worksheet.title,
      answers: r.answers,
      completedAt: r.completedAt,
    })),
    conversation: conversation
      ? {
          startedAt: conversation.createdAt,
          messages: conversation.messages,
        }
      : null,
    courses: enrollments.map((e) => ({
      courseTitle: e.course.title,
      enrolledAt: e.enrolledAt,
      lessonsCompleted: e.progress.filter((p) => p.completedAt).length,
      progress: e.progress,
    })),
    firstMap: selfNodes,
    reading,
  };

  // Metadata only — never the content.
  console.info(`[settings] data export user=${user.id}`);

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="veritas-my-data.json"',
    },
  });
}
