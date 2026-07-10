import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { parseFields, answerableFields } from "@/lib/worksheet-meta";
import { duplicateWorksheet, setWorksheetActive } from "./actions";

export const dynamic = "force-dynamic";

export default async function WorksheetsPage() {
  await requirePractitioner();

  const worksheets = await prisma.worksheet.findMany({
    orderBy: [{ active: "desc" }, { updatedAt: "desc" }],
    include: { _count: { select: { assignments: true } } },
  });

  const active = worksheets.filter((w) => w.active);
  const archived = worksheets.filter((w) => !w.active);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>Between sessions</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">Your worksheets</h1>
        <SignatureRule />
        <p className="max-w-prose text-ink">
          Structured, fillable worksheets in your voice. Draft one with a little AI help, or
          build it by hand — then send it from a client&apos;s page.
        </p>
      </div>

      <Link
        href="/practitioner/worksheets/new"
        className="self-start rounded-md bg-wine px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-wine-dark"
      >
        New worksheet
      </Link>

      <section className="flex flex-col gap-3">
        {active.length === 0 ? (
          <p className="text-ink">Nothing here yet — create your first worksheet above.</p>
        ) : (
          active.map((w) => {
            const questions = answerableFields(parseFields(w.schema)).length;
            return (
              <div
                key={w.id}
                className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white p-5 shadow-soft"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/practitioner/worksheets/${w.id}`}
                    className="font-medium text-ink-strong underline-offset-4 hover:text-wine hover:underline"
                  >
                    {w.title}
                  </Link>
                  <p className="text-sm text-slate">
                    {questions} questions · sent {w._count.assignments} times
                  </p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <Link
                    href={`/practitioner/worksheets/${w.id}`}
                    className="font-medium text-wine underline-offset-4 hover:underline"
                  >
                    Edit
                  </Link>
                  <form action={duplicateWorksheet.bind(null, w.id)}>
                    <button className="text-slate underline-offset-4 hover:text-wine hover:underline">
                      Duplicate
                    </button>
                  </form>
                  <form action={setWorksheetActive.bind(null, w.id, false)}>
                    <button className="text-slate underline-offset-4 hover:text-wine hover:underline">
                      Archive
                    </button>
                  </form>
                </div>
              </div>
            );
          })
        )}
      </section>

      {archived.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xl font-semibold text-slate">Archived</h2>
          {archived.map((w) => (
            <div key={w.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white/60 p-4">
              <p className="text-sm text-slate">{w.title}</p>
              <form action={setWorksheetActive.bind(null, w.id, true)} className="ml-auto">
                <button className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline">
                  Restore
                </button>
              </form>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
