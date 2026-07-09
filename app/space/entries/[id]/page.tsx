import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { TypePill, MoodDots, TagChips, formatDay, formatTime } from "@/components/entries";
import { DeleteEntryButton } from "./DeleteEntryButton";

export const dynamic = "force-dynamic";

export default async function EntryPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { saved?: string };
}) {
  const user = await requireClient();

  // Scoped to the session user: probing someone else's entry id is a plain 404.
  const entry = await prisma.logEntry.findFirst({
    where: { id: params.id, clientId: user.id },
  });
  if (!entry) notFound();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>{formatDay(entry.occurredAt)}</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">Your entry</h1>
        <SignatureRule />
      </div>

      {searchParams.saved && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">Entry saved.</p>
      )}

      <article className="flex flex-col gap-4 rounded-lg border border-line bg-white p-6 shadow-soft">
        <div className="flex flex-wrap items-center gap-3">
          <TypePill type={entry.type} />
          <MoodDots mood={entry.mood} />
          <span className="ml-auto text-xs text-slate">{formatTime(entry.occurredAt)}</span>
        </div>
        <p className="whitespace-pre-wrap text-lg leading-relaxed text-ink">{entry.body}</p>
        {entry.trigger && (
          <p className="text-sm text-slate">
            <span className="font-medium text-mocha">Prompted by:</span> {entry.trigger}
          </p>
        )}
        <TagChips tags={entry.tags} />
      </article>

      <div className="flex items-center gap-6">
        <Link
          href={`/space/entries/${entry.id}/edit`}
          className="text-sm font-medium text-wine underline-offset-4 hover:underline"
        >
          Edit
        </Link>
        <DeleteEntryButton entryId={entry.id} />
        <Link
          href="/space"
          className="ml-auto text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
        >
          Back to your timeline
        </Link>
      </div>
    </div>
  );
}
