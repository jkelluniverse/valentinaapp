import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { EntryForm } from "../../../EntryForm";
import { updateEntry } from "../../../actions";

export const dynamic = "force-dynamic";

export default async function EditEntryPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const user = await requireClient();

  const entry = await prisma.logEntry.findFirst({
    where: { id: params.id, clientId: user.id },
  });
  if (!entry) notFound();

  const action = updateEntry.bind(null, entry.id);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>Edit entry</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">Refine this moment</h1>
        <SignatureRule />
      </div>

      <EntryForm
        action={action}
        defaults={{
          body: entry.body,
          type: entry.type,
          mood: entry.mood,
          trigger: entry.trigger,
          tags: entry.tags,
          occurredAt: entry.occurredAt,
        }}
        submitLabel="Save changes"
        error={searchParams.error === "empty" ? "Write a little something first." : null}
      />

      <Link
        href={`/space/entries/${entry.id}`}
        className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
      >
        Cancel
      </Link>
    </div>
  );
}
