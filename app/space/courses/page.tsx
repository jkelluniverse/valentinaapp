import Link from "next/link";
import type { LessonType } from "@prisma/client";
import { requireClient } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { listEnrolledCourses, getEnrolledCourse } from "@/lib/courses";

export const dynamic = "force-dynamic";

// A3 — The Growth Vault. Resources as a path, not an inventory. Three strata:
// Continue (the one next step), the trail (completed work as quiet marks), and
// For you (the latest thing from Valentina). No progress bars, no checklists.

const NEXT_BLURB: Record<LessonType, string> = {
  VIDEO: "a short watch, then a moment to notice",
  TEXT: "a short read, then a moment to notice",
  EXERCISE: "a moment to write",
};

export default async function GrowthVault() {
  const user = await requireClient();

  const enrolled = await listEnrolledCourses(user.id);
  // The next step for each active course (at most two Continue panels).
  const active = enrolled.filter((c) => c.percent < 100).slice(0, 2);
  const continues = (
    await Promise.all(active.map((c) => getEnrolledCourse(user.id, c.courseId)))
  ).filter((x): x is NonNullable<typeof x> => Boolean(x?.next));

  const completedMarks = enrolled.reduce((n, c) => n + c.completed, 0);
  const restingAhead = enrolled.reduce((n, c) => n + (c.total - c.completed), 0);

  const [pendingPrompt, pendingWorksheet, otherPending] = await Promise.all([
    prisma.assignment.findFirst({
      where: { clientId: user.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: { prompt: { select: { title: true } } },
    }),
    prisma.worksheetAssignment.findFirst({
      where: { clientId: user.id, status: "PENDING" },
      orderBy: { createdAt: "desc" },
      include: { worksheet: { select: { title: true } } },
    }),
    prisma.assignment.count({ where: { clientId: user.id, status: "PENDING" } }),
  ]);

  // The single most recent item, with any others one tap deeper.
  const forYou =
    pendingWorksheet &&
    (!pendingPrompt || pendingWorksheet.createdAt > pendingPrompt.createdAt)
      ? { title: pendingWorksheet.worksheet.title, href: `/space/worksheets/${pendingWorksheet.id}`, kind: "Worksheet" }
      : pendingPrompt
        ? { title: pendingPrompt.prompt.title, href: `/space/prompts/${pendingPrompt.id}`, kind: "From Valentina" }
        : null;
  const moreCount =
    otherPending + (pendingWorksheet ? 1 : 0) - (forYou ? 1 : 0);

  const nothing = continues.length === 0 && completedMarks === 0 && !forYou;

  return (
    <div className="flex flex-col gap-12">
      <h1 className="font-headline text-[2rem] font-medium text-ink-strong">Your path</h1>

      {nothing ? (
        <div className="rounded-card border border-line bg-surface p-8 shadow-soft">
          <p className="max-w-prose text-lg leading-relaxed text-ink">
            When Valentina lays out a course or sends you something, it appears here — one gentle
            step at a time.
          </p>
        </div>
      ) : (
        <>
          {continues.map((c) => (
            <section key={c.course.id} className="flex flex-col gap-4">
              <p className="text-eyebrow font-semibold uppercase text-mocha">{c.course.title}</p>
              <div className="h-px w-10 bg-mocha" />
              <Link
                href={`/space/courses/${c.course.id}/lessons/${c.next!.id}`}
                className="group flex flex-col gap-2 rounded-card border border-line bg-surface p-7 shadow-soft transition-all ease-settle duration-300 hover:shadow-card"
              >
                <span className="text-eyebrow font-semibold uppercase text-mocha">Continue</span>
                <span className="font-headline text-2xl font-medium text-wine">
                  {c.next!.title}
                </span>
                <span className="flex items-center justify-between text-[15px] text-slate">
                  {NEXT_BLURB[c.next!.type]}
                  <span aria-hidden className="text-wine transition-transform group-hover:translate-x-0.5">
                    →
                  </span>
                </span>
              </Link>

              {/* The trail: completed lessons as quiet marks. */}
              {c.completed > 0 && (
                <Link
                  href={`/space/courses/${c.course.id}`}
                  className="flex flex-wrap items-center gap-1.5 text-mocha"
                  title="Revisit what you've walked"
                >
                  {Array.from({ length: c.completed }).map((_, i) => (
                    <span key={i} aria-hidden className="text-sm">
                      ✦
                    </span>
                  ))}
                  <span className="ml-2 text-[13px] text-whisper">
                    {c.completed} behind you · {c.total - c.completed} resting ahead
                  </span>
                </Link>
              )}
            </section>
          ))}

          {/* Finished courses — a trail without a next step. */}
          {continues.length === 0 && completedMarks > 0 && (
            <section className="flex flex-col gap-2">
              <p className="text-eyebrow font-semibold uppercase text-mocha">The trail</p>
              <div className="flex flex-wrap items-center gap-1.5 text-mocha">
                {Array.from({ length: Math.min(completedMarks, 40) }).map((_, i) => (
                  <span key={i} aria-hidden className="text-sm">
                    ✦
                  </span>
                ))}
              </div>
              <p className="text-[13px] text-whisper">
                {completedMarks} lessons behind you
                {restingAhead > 0 ? ` · ${restingAhead} resting ahead` : ""}
              </p>
            </section>
          )}
        </>
      )}

      {forYou && (
        <section className="flex flex-col gap-3">
          <p className="text-eyebrow font-semibold uppercase text-mocha">For you</p>
          <Link
            href={forYou.href}
            className="group flex flex-col gap-1 rounded-card border border-line bg-surface p-7 shadow-soft transition-all ease-settle duration-300 hover:shadow-card"
          >
            <span className="text-eyebrow font-semibold uppercase text-mocha">{forYou.kind}</span>
            <span className="flex items-center justify-between font-headline text-xl font-medium text-wine">
              {forYou.title}
              <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
                →
              </span>
            </span>
          </Link>
          {moreCount > 0 && (
            <Link
              href="/space/prompts"
              className="text-[13px] text-whisper underline-offset-4 hover:text-wine hover:underline"
            >
              {moreCount} more waiting
            </Link>
          )}
        </section>
      )}

      <Link
        href="/space"
        className="text-[13px] text-whisper underline-offset-4 hover:text-wine hover:underline"
      >
        ← Home
      </Link>
    </div>
  );
}
