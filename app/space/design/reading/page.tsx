import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth-guards";
import { ReadingProse } from "@/components/ReadingProse";
import { PrintButton } from "./PrintButton";

export const dynamic = "force-dynamic";

// A clean, print-friendly full-page view of the client's own reading — the
// keepsake "save as PDF" surface. Their own reading only.
export default async function ReadingPrintPage() {
  const user = await requireClient();
  const reading = await prisma.integrativeReading.findUnique({ where: { userId: user.id } });

  if (!reading || reading.status !== "PUBLISHED") {
    return (
      <div className="mx-auto max-w-[640px] py-8">
        <p className="text-ink">Your reading isn&apos;t ready to save yet.</p>
        <Link href="/space/design" className="mt-4 inline-block text-sm text-wine underline-offset-4 hover:underline">
          ← Back to your design
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[680px] flex-col gap-8 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href="/space/design" className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline">
          ← Back to your design
        </Link>
        <div className="flex items-center gap-4">
          <a
            href={`/api/reading/${user.id}/pdf`}
            className="rounded-md border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush"
          >
            Download PDF
          </a>
          <PrintButton />
        </div>
      </div>

      <header className="flex flex-col gap-1">
        <p className="font-headline text-sm italic text-mocha">Veritas · a reading of your design</p>
        <h1 className="font-headline text-[2.25rem] font-medium text-wine">What it all means to you</h1>
      </header>

      <ReadingProse content={reading.content} />

      <p className="border-t border-line pt-4 text-[13px] text-whisper">
        A generated reflection drawn from your Human Design, Gene Keys, and values maps — a mirror to
        explore, not a verdict. {reading.generatedAt.toISOString().slice(0, 10)}.
      </p>
    </div>
  );
}
