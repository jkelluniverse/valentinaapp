import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { signupCopy, resolvePublicLocale } from "@/lib/signup-copy";
import { portalHostFor } from "@/lib/signup-config";

// C23-SIGNUP §4.5 — the confirmation screen. It names the portal address and
// the referral code, and it is SUFFICIENT ON ITS OWN: the welcome email is a
// courtesy, so a practitioner on conference wifi with no inbox access still
// leaves knowing where to sign in. Reads no data — the action passes what it
// just created.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your portal is live",
  robots: { index: false, follow: false },
};

export default function SignupWelcomePage({
  searchParams,
}: {
  searchParams: { slug?: string; email?: string; code?: string; lang?: string };
}) {
  const locale = resolvePublicLocale(searchParams.lang, headers().get("accept-language"));
  const t = signupCopy(locale).welcome;
  const slug = (searchParams.slug ?? "").trim().toLowerCase().slice(0, 40);
  const email = (searchParams.email ?? "").trim().slice(0, 200);
  const code = (searchParams.code ?? "").trim().slice(0, 32);
  const host = slug ? portalHostFor(slug) : "";

  return (
    <main className="mx-auto max-w-2xl px-5 py-16 md:px-8">
      <Eyebrow>{t.eyebrow}</Eyebrow>
      <h1 className="mt-2 font-headline text-[2.25rem] font-semibold leading-tight text-ink-strong md:text-5xl">
        {t.heading}
      </h1>
      <SignatureRule className="mt-4" />

      <dl className="mt-9 flex flex-col gap-5">
        <div className="rounded-card border border-mocha bg-blush p-6">
          <dt className="text-[13px] font-semibold uppercase tracking-wide text-mocha">{t.portalLabel}</dt>
          <dd className="mt-1.5 break-all font-headline text-2xl font-semibold text-wine">{host}</dd>
        </div>
        <div className="rounded-card border border-line bg-surface p-6 shadow-soft">
          <dt className="text-[13px] font-semibold uppercase tracking-wide text-mocha">{t.signInLabel}</dt>
          <dd className="mt-1.5 break-all text-lg font-medium text-ink-strong">{email}</dd>
          <p className="mt-3 text-[15px] leading-relaxed text-slate">{t.passwordNote}</p>
        </div>
        <div className="rounded-card border border-line bg-surface p-6 shadow-soft">
          <dt className="text-[13px] font-semibold uppercase tracking-wide text-mocha">{t.codeLabel}</dt>
          <dd className="mt-1.5 font-mono text-2xl font-semibold tracking-[0.18em] text-wine">{code}</dd>
          <p className="mt-3 text-[15px] leading-relaxed text-slate">{t.codeNote}</p>
        </div>
      </dl>

      <div className="mt-9 flex flex-col items-start gap-3">
        <Link
          href="/login"
          className="inline-flex items-center justify-center rounded-pill bg-wine px-7 py-3.5 text-[15px] font-semibold text-white shadow-soft transition-colors hover:bg-wine-dark"
        >
          {t.next}
        </Link>
        <p className="text-[13px] text-whisper">{t.keepThis}</p>
      </div>
    </main>
  );
}
