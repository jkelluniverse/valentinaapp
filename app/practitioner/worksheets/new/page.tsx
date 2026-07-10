import { requirePractitioner } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { draftFromStudio, createBlankWorksheet } from "../actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  empty: "Describe the worksheet or paste a reference first.",
  config: "The AI service isn't configured — add ANTHROPIC_API_KEY to the app service.",
  api: "Drafting hit a problem. Nothing was saved — try again in a moment.",
};

// The studio (C9 spec §3): describe it or paste a reference, get a draft in
// Valentina's voice, then refine it in the builder.
export default async function WorksheetStudioPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  await requirePractitioner();

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>Worksheet studio</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">Start a worksheet</h1>
        <SignatureRule />
        <p className="max-w-prose text-ink">
          Tell it what you want, or paste a reference — you&apos;ll get a fresh draft in your
          voice to shape from there.
        </p>
      </div>

      {searchParams.error && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          {ERRORS[searchParams.error] ?? ERRORS.api}
        </p>
      )}

      <form action={draftFromStudio} className="flex flex-col gap-5 rounded-lg border border-line bg-white p-6 shadow-soft">
        <label className="flex flex-col gap-1.5">
          <span className="text-label font-semibold uppercase tracking-wide text-mocha">
            What do you want this worksheet to do?
          </span>
          <textarea
            name="description"
            rows={3}
            autoFocus
            placeholder="e.g. A values-clarification worksheet — help a client name what matters most and spot one place life isn't aligned with it."
            className="rounded-md border border-line bg-white px-3 py-2.5 text-base leading-relaxed text-ink outline-none placeholder:text-slate focus:border-wine focus:ring-2 focus:ring-wine/20"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-label font-semibold uppercase tracking-wide text-mocha">
            Reference material <span className="normal-case tracking-normal text-slate">(optional — paste text)</span>
          </span>
          <textarea
            name="reference"
            rows={6}
            placeholder="Paste a worksheet or notes you'd like to draw the concept and structure from…"
            className="rounded-md border border-line bg-white px-3 py-2.5 text-sm leading-relaxed text-ink outline-none placeholder:text-slate focus:border-wine focus:ring-2 focus:ring-wine/20"
          />
          <p className="text-xs text-slate">
            Use references for ideas, not wording. Make sure you&apos;re entitled to adapt any
            specific source.
          </p>
        </label>

        <button className="self-start rounded-md bg-wine px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-wine-dark">
          Draft it for me
        </button>
      </form>

      <form action={createBlankWorksheet}>
        <button className="text-sm font-medium text-wine underline-offset-4 hover:underline">
          Or start from a blank worksheet →
        </button>
      </form>
    </div>
  );
}
