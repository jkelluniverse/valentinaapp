import Link from "next/link";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { EntryForm } from "../EntryForm";
import { createEntry } from "../actions";

export default function NewEntryPage({ searchParams }: { searchParams: { error?: string } }) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>New entry</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">What&apos;s here right now?</h1>
        <SignatureRule />
      </div>

      <EntryForm
        action={createEntry}
        error={searchParams.error === "empty" ? "Write a little something first." : null}
      />

      <Link href="/space" className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline">
        Back to your timeline
      </Link>
    </div>
  );
}
