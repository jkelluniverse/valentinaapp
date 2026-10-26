import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { PendingButton } from "@/components/PendingButton";
import { createCourse } from "./actions";

export const dynamic = "force-dynamic";

export default async function CoursesPage() {
  await requirePractitioner();

  const courses = await prisma.course.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      chapters: { select: { _count: { select: { lessons: true } } } },
      _count: { select: { enrollments: true } },
    },
  });

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>Programs</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">Your courses</h1>
        <SignatureRule />
      </div>

      <form action={createCourse}>
        <PendingButton className="rounded-md bg-wine px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-wine-dark">
          New course
        </PendingButton>
      </form>

      {courses.length === 0 ? (
        <div className="rounded-lg border border-line bg-white p-8 shadow-soft">
          <p className="max-w-prose text-lg leading-relaxed text-ink">
            Build your first course — a title is all it takes to get started, and everything
            saves as you go.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {courses.map((c) => {
            const lessons = c.chapters.reduce((n, ch) => n + ch._count.lessons, 0);
            return (
              <li key={c.id}>
                <Link
                  href={`/practitioner/courses/${c.id}`}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white p-5 shadow-soft transition-colors hover:bg-blush"
                >
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      c.status === "PUBLISHED" ? "bg-wine text-white" : "bg-line/50 text-slate"
                    }`}
                  >
                    {c.status === "PUBLISHED" ? "Published" : "Draft"}
                  </span>
                  <span className="font-medium text-ink-strong">{c.title}</span>
                  <span className="ml-auto text-sm text-slate">
                    {c.chapters.length} chapters · {lessons} lessons · {c._count.enrollments} enrolled
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
