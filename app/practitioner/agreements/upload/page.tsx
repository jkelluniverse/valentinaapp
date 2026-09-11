import Link from "next/link";
import { requirePractitioner } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { PendingButton } from "@/components/PendingButton";
import { uploadRequestAction } from "../actions";
import { fieldCls } from "../ui";

// C22.2 — one door, one job: upload a document for signing. Nothing
// saves or sends here — the next screen is the visual preview, where the
// document is released (or discarded).

export const dynamic = "force-dynamic";

export default async function UploadPage({ searchParams }: { searchParams: { error?: string } }) {
  await requirePractitioner();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Eyebrow>Agreements · upload</Eyebrow>
        <h1 className="font-headline text-[1.8rem] font-medium text-ink-strong">Upload a document for signing</h1>
        <SignatureRule />
        <p className="max-w-prose text-[14px] leading-relaxed text-slate">
          Upload a Word document (.docx) and it becomes a fillable signing page — blank lines like{" "}
          <code className="rounded bg-white px-1 font-mono text-[12px]">______</code> turn into fields automatically (you can also
          write <code className="rounded bg-white px-1 font-mono text-[12px]">[[text: Full legal name]]</code>). A PDF attaches
          as-is for review and signature. <strong className="text-ink">Nothing saves or sends yet</strong> — next you&apos;ll see the
          document exactly as your signer will, with every field shown in place, and release it from there.
        </p>
      </div>

      {searchParams.error && <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">REFUSED: {searchParams.error}</p>}

      <form action={uploadRequestAction} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
            Document title
            <input name="title" required className={fieldCls} placeholder="e.g. Vendor NDA" />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
            File(s)
            <input name="files" type="file" multiple required accept=".pdf,.docx,.png,.jpg,.jpeg" className="text-sm" />
          </label>
          <label className="flex items-center gap-2 pb-2 text-[13px] text-slate">
            <input type="checkbox" name="requiresCountersign" className="h-4 w-4 rounded border-line text-wine" />
            I countersign after they sign
          </label>
          <PendingButton className="rounded-lg bg-wine px-5 py-2.5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-wine-dark">
            Preview it →
          </PendingButton>
        </div>
      </form>

      <Link href="/practitioner/agreements" className="text-[13px] text-whisper hover:text-wine">
        ← back to agreements
      </Link>
    </div>
  );
}
