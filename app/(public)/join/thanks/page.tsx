import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { captureCopy, resolvePublicLocale, fill } from "@/lib/capture-copy";
import { getBaseUrl } from "@/lib/base-url";

// C23-CAPTURE §1 — the success state. It renders the person's OWN referral
// code and a one-tap way to pass it on, because this is the moment they are
// most willing to share and they do not have an account to share from.
//
// Sharing is plain `mailto:` / `sms:` hrefs on purpose: no clipboard API, no
// Web Share API, no hydration. One tap opens the app they already have, with
// the message written. The link itself is printed in full underneath, because
// a share sheet that fails leaves the link, and a link that fails leaves
// nothing.
//
// Reads no data — the action passes what it just created.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "You are on the list",
  robots: { index: false, follow: false },
};

export default function JoinThanksPage({
  searchParams,
}: {
  searchParams: { code?: string; lang?: string };
}) {
  const locale = resolvePublicLocale(searchParams.lang, headers().get("accept-language"));
  const t = captureCopy(locale).thanks;
  const code = (searchParams.code ?? "").trim().slice(0, 32);

  const shareUrl = `${getBaseUrl()}/join${code ? `?ref=${encodeURIComponent(code)}` : ""}`;
  const body = fill(t.shareBody, { code, url: shareUrl });
  const mailto = `mailto:?subject=${encodeURIComponent(t.shareSubject)}&body=${encodeURIComponent(body)}`;
  const sms = `sms:?&body=${encodeURIComponent(body)}`;

  const card = "rounded-card border border-line bg-surface p-6 shadow-soft";
  const dt = "text-[13px] font-semibold uppercase tracking-wide text-mocha";

  return (
    <main className="mx-auto max-w-xl px-5 py-14 md:px-8 md:py-16">
      <Eyebrow>{t.eyebrow}</Eyebrow>
      <h1 className="mt-2 font-headline text-[2.25rem] font-semibold leading-tight text-ink-strong md:text-5xl">
        {t.heading}
      </h1>
      <SignatureRule className="mt-4" />
      <p className="mt-4 text-lg leading-relaxed text-slate">{t.body}</p>

      {code && (
        <div className="mt-9 rounded-card border border-mocha bg-blush p-6">
          <p className={dt}>{t.codeLabel}</p>
          <p className="mt-1.5 font-mono text-3xl font-semibold tracking-[0.18em] text-wine">{code}</p>
          <p className="mt-3 text-[15px] leading-relaxed text-slate">{t.codeNote}</p>
        </div>
      )}

      <section className={`mt-6 ${card}`}>
        <h2 className="font-headline text-lg font-semibold text-ink-strong">{t.shareHeading}</h2>
        <div className="mt-4 flex flex-wrap gap-3">
          <a
            href={mailto}
            className="inline-flex items-center justify-center rounded-pill bg-wine px-6 py-3.5 text-[15px] font-semibold text-white shadow-soft transition-colors hover:bg-wine-dark"
          >
            {t.shareEmail}
          </a>
          <a
            href={sms}
            className="inline-flex items-center justify-center rounded-pill border border-mocha px-6 py-3.5 text-[15px] font-semibold text-wine transition-colors hover:bg-blush"
          >
            {t.shareSms}
          </a>
        </div>
        <p className="mt-4 text-[13px] font-semibold uppercase tracking-wide text-mocha">{t.linkLabel}</p>
        <p className="mt-1 break-all font-mono text-[14px] text-ink">{shareUrl}</p>
      </section>

      <div className="mt-9 flex flex-col items-start gap-3">
        <Link
          href={`/signup${locale === "es" ? "?lang=es" : ""}`}
          className="font-medium text-wine underline decoration-mocha/60 underline-offset-4"
        >
          {t.signupNow}
        </Link>
        <p className="text-[13px] text-whisper">{t.keepThis}</p>
      </div>
    </main>
  );
}
