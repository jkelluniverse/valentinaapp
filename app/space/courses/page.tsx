import Link from "next/link";
import { requireClient } from "@/lib/auth-guards";
import { listEnrolledCourses } from "@/lib/courses";
import { SignatureRule, Eyebrow } from "@/components/brand";

export const dynamic = "force-dynamic";

export default async function ClientCoursesPage() {
  const user = await requireClient();
  const courses = await listEnrolledCourses(user.id);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>Learning</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">Your courses</h1>
        <SignatureRule />
      </div>

      {courses.length === 0 ? (
        <div className="rounded-lg border border-line bg-white p-8 shadow-soft">
          <p className="max-w-prose text-lg leading-relaxed text-ink">
            Nothing here yet. When Valentina enrolls you in a course, it appears here, ready
            whenever you are.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {courses.map((c) => (
            <li key={c.courseId}>
              <Link
                href={`/space/courses/${c.courseId}`}
                className="flex flex-col gap-2 rounded-lg border border-line bg-white p-5 shadow-soft transition-colors hover:bg-blush"
              >
                <div className="flex flex-wrap items-baseline gap-3">
                  <span className="font-headline text-xl font-semibold text-wine">{c.title}</span>
                  <span className="ml-auto text-sm text-slate">{c.percent}% complete</span>
                </div>
                {c.description && <p className="text-sm text-ink">{c.description}</p>}
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-cream">
                  <div className="h-full rounded-full bg-mocha" style={{ width: `${c.percent}%` }} />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      <Link href="/space" className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline">
        Back to your space
      </Link>
    </div>
  );
}
