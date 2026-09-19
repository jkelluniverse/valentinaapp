import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth-guards";
import { listEnrolledCourses } from "@/lib/courses";
import { Greeting } from "@/components/Greeting";
import { HintCallout, GettingStartedCard } from "@/components/discovery/Discovery";

export const dynamic = "force-dynamic";

// A1 — The Sanctuary. One question answered: arrive, feel received, take one
// step. A greeting, a single focus line (server-chosen by precedence), one
// action, and two quiet links. Everything that inventories work lives deeper.

const STANDING_LINES = [
  "Where attention goes, energy flows.",
  "The quietest moment can hold the clearest insight.",
  "What you notice, you can gently change.",
  "Nothing to fix today — only something to notice.",
  "Small honesties, kept, become a path.",
];

export default async function Sanctuary() {
  const user = await requireClient();
  const firstName = (user.name?.trim().split(/\s+/)[0]) || "there";

  const [pendingPrompt, pendingWorksheet, courses, profile] = await Promise.all([
    prisma.assignment.findFirst({
      where: { clientId: user.id, status: "PENDING" },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      include: { prompt: { select: { title: true } } },
    }),
    prisma.worksheetAssignment.findFirst({
      where: { clientId: user.id, status: "PENDING" },
      orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }],
      include: { worksheet: { select: { title: true } } },
    }),
    listEnrolledCourses(user.id),
    prisma.clientProfile.findUnique({
      where: { userId: user.id },
      select: { firstMapCompletedAt: true },
    }),
  ]);

  // Focus line, by precedence: an unanswered item → a course to continue →
  // a standing invitation. Never more than one.
  const inProgress = courses.find((c) => c.percent > 0 && c.percent < 100);
  const nextCourse = inProgress ?? courses.find((c) => c.percent < 100);

  let focus: { text: string; href?: string; kind: "item" | "course" | "still" };
  if (!profile?.firstMapCompletedAt) {
    // C16.5 — the First Map opens the work; it leads until it's made.
    focus = {
      text: "Begin with what you already know — Your First Map is waiting.",
      href: "/space/first-map",
      kind: "item",
    };
  } else if (pendingWorksheet) {
    focus = {
      text: `Valentina left you something — ${pendingWorksheet.worksheet.title}.`,
      href: `/space/worksheets/${pendingWorksheet.id}`,
      kind: "item",
    };
  } else if (pendingPrompt) {
    focus = {
      text: `Valentina left you something — ${pendingPrompt.prompt.title}.`,
      href: `/space/prompts/${pendingPrompt.id}`,
      kind: "item",
    };
  } else if (nextCourse) {
    focus = {
      text: `Your path continues — ${nextCourse.title}.`,
      href: `/space/courses/${nextCourse.courseId}`,
      kind: "course",
    };
  } else {
    const line = STANDING_LINES[new Date().getDate() % STANDING_LINES.length];
    focus = { text: line, kind: "still" };
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-[600px] flex-col items-center justify-center gap-10 py-8 text-center">
      <div className="flex flex-col items-center gap-6">
        <Greeting name={firstName} />

        {focus.href ? (
          <Link
            href={focus.href}
            className="max-w-[46ch] font-headline text-xl italic leading-relaxed text-mocha underline-offset-8 transition-colors hover:text-wine hover:underline"
          >
            {focus.text}
          </Link>
        ) : (
          <p className="max-w-[46ch] font-headline text-xl italic leading-relaxed text-mocha">
            {focus.kind === "still" ? `“${focus.text}”` : focus.text}
          </p>
        )}
      </div>

      <Link
        href="/space/new"
        className="rounded-lg bg-wine px-8 py-4 text-base font-medium text-white shadow-soft transition-all ease-settle duration-300 hover:bg-wine-dark hover:shadow-card focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine"
      >
        Begin a reflection
      </Link>

      <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-[15px]">
        <Link href="/space/first-map" className="text-slate underline-offset-4 hover:text-wine hover:underline">
          Your map
        </Link>
        <span className="text-line">·</span>
        <Link href="/space/courses" className="text-slate underline-offset-4 hover:text-wine hover:underline">
          Your path
        </Link>
        <span className="text-line">·</span>
        <Link href="/space/journey" className="text-slate underline-offset-4 hover:text-wine hover:underline">
          Your journey
        </Link>
      </div>

      {/* CLIENT-ONBOARDING §6.2/§6.3 — discovery, engine-onboarded clients
          only. Both components render null (no wrapper element here) for
          everyone else, so this screen stays byte-identical for existing
          clients (Rule 0.1). */}
      <HintCallout clientId={user.id} surface="home" path="/space" className="w-full max-w-[440px] text-left" />
      <GettingStartedCard clientId={user.id} path="/space" className="w-full max-w-[440px] text-left" />
    </div>
  );
}
