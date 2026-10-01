import Link from "next/link";
import { requirePractitioner } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { PendingButton } from "@/components/PendingButton";
import { REFERENCE_ERRORS } from "@/lib/reference-input";
import { draftPromptWithAi } from "../actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  empty: "Describe the item or add a reference first.",
  config: "The AI service isn't configured — add ANTHROPIC_API_KEY to the app service.",
  api: "Drafting hit a problem. Nothing was saved — try again in a moment.",
  ...REFERENCE_ERRORS,
};

// AI drafting for prompts / exercises / check-ins — the library's studio.
export default async function LibraryStudioPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  await requirePractitioner();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>Library studio</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">Draft with a little help</h1>
        <SignatureRule />
        <p className="max-w-prose text-ink">
          Tell it what you want — or hand it something you found — and you&apos;ll get a prompt,
          exercise, or check-in in your voice, ready to refine.
        </p>
      </div>

      {searchParams.error && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          {ERRORS[searchParams.error] ?? ERRORS.api}
        </p>
      )}

      <form action={draftPromptWithAi} className="flex flex-col gap-5 rounded-lg border border-line bg-white p-6 shadow-soft">
        <label className="flex flex-col gap-1.5">
          <span className="text-label font-semibold uppercase tracking-wide text-mocha">
            What should it do?
          </span>
          <textarea
            name="description"
            rows={3}
            autoFocus
            placeholder="e.g. A gentle exercise for noticing tension before a difficult conversation."
            className="rounded-md border border-line bg-white px-3 py-2.5 text-base leading-relaxed text-ink outline-none placeholder:text-slate focus:border-wine focus:ring-2 focus:ring-wine/20"
          />
        </label>

        <div className="flex flex-col gap-4 rounded-md border border-line bg-cream/50 p-4">
          <p className="text-label font-semibold uppercase tracking-wide text-mocha">
            Inspiration <span className="normal-case tracking-normal text-slate">(optional — any of these)</span>
          </p>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ink">Paste text</span>
            <textarea
              name="reference"
              rows={3}
              placeholder="Paste a post, an idea, or notes…"
              className="rounded-md border border-line bg-white px-3 py-2.5 text-sm leading-relaxed text-ink outline-none placeholder:text-slate focus:border-wine focus:ring-2 focus:ring-wine/20"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ink">Or a web link</span>
            <input
              type="url"
              name="referenceUrl"
              placeholder="https://…  (articles work best; social posts often block this — screenshot those instead)"
              className="rounded-md border border-line bg-white px-3 py-2.5 text-sm text-ink outline-none placeholder:text-slate focus:border-wine focus:ring-2 focus:ring-wine/20"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-ink">Or upload a file — PDF or image (a screenshot is perfect)</span>
            <input
              type="file"
              name="referenceFile"
              accept="application/pdf,image/jpeg,image/png,image/webp,image/gif"
              className="text-sm text-ink file:mr-3 file:rounded-md file:border file:border-mocha file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium file:text-wine hover:file:bg-blush"
            />
          </label>
          <p className="text-xs text-slate">
            Use references for ideas, not wording. Make sure you&apos;re entitled to adapt any
            specific source.
          </p>
        </div>

        <PendingButton className="self-start rounded-md bg-wine px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-wine-dark">
          Draft it for me
        </PendingButton>
      </form>

      <Link href="/practitioner/library" className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline">
        Back to the library
      </Link>
    </div>
  );
}
