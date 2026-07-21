import { requireClient } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { ReadingProse } from "@/components/ReadingProse";
import { getConsentText, hasConsent } from "@/lib/consent";
import { redirect } from "next/navigation";
import { grantConsent } from "./actions";
import { PendingButton } from "@/components/PendingButton";

export const dynamic = "force-dynamic";

// AMENDMENT-01 §5 — shown once to a returning client who accepted an earlier
// version, framed as a clarification, not a new hurdle. After they agree it
// never appears again. New clients meet this same text at invite acceptance.
export default async function ConsentPage({ searchParams }: { searchParams: { error?: string } }) {
  const user = await requireClient();
  if (await hasConsent(user.id)) redirect("/space");
  const consentText = getConsentText();

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Eyebrow>A quick, one-time note</Eyebrow>
        <h1 className="font-headline text-[2.125rem] font-medium text-ink-strong">
          We&apos;ve made how this space works clearer
        </h1>
        <SignatureRule />
        <p className="max-w-prose text-[15px] text-slate">
          Nothing about your space has changed — we&apos;ve just written the whole picture out
          plainly, in one place. Have a read, and we&apos;ll carry on.
        </p>
      </div>

      <div className="rounded-card border border-line bg-surface p-6 shadow-soft">
        <ReadingProse content={consentText} />
      </div>

      <form action={grantConsent} className="flex flex-col gap-4">
        <label className="flex items-start gap-3 text-sm text-ink">
          <input
            name="consent"
            type="checkbox"
            required
            className="mt-1 h-4 w-4 rounded border-line text-wine focus:ring-wine/20"
          />
          <span>I understand and agree — let&apos;s begin.</span>
        </label>
        {searchParams.error && (
          <p className="text-sm text-rose">Please check the box to continue.</p>
        )}
        <PendingButton className="self-start rounded-lg bg-wine px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wine-dark">
          Continue to my space
        </PendingButton>
      </form>
    </div>
  );
}
