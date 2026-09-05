import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { signupCopy, resolvePublicLocale, fill } from "@/lib/signup-copy";
import { PASSWORD_MIN } from "@/lib/signup-config";
import { SignupForm } from "./SignupForm";
import { submitSignup } from "./actions";

// C23-SIGNUP §3 — the front door. One screen, phone-first, Warm Stone like the
// rest of the public surface. Reads NO data (the slug-availability probe is its
// own tiny endpoint), so the wall holds without a pragma here.
//
// Copy sells a finished portal, not a discount: §7 pricing is PROPOSED, and
// signups land on FOUNDING_COMP, which creates no Stripe objects. No figure, no
// "free", no promised future rate appears on this screen or its catalog.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Set up your practice portal",
  description: "Founding partners: set up a practice portal on its own address.",
  robots: { index: false, follow: false },
};

export default function SignupPage({
  searchParams,
}: {
  searchParams: {
    lang?: string;
    ref?: string;
    error?: string;
    name?: string;
    practiceName?: string;
    email?: string;
    slug?: string;
  };
}) {
  const locale = resolvePublicLocale(searchParams.lang, headers().get("accept-language"));
  const t = signupCopy(locale);
  const other = locale === "en" ? "es" : "en";
  const refCode = (searchParams.ref ?? "").trim().slice(0, 64) || undefined;

  const errorKey = searchParams.error ?? "";
  const errors = t.errors as Record<string, string>;
  const errorText = errorKey && errors[errorKey] ? fill(errors[errorKey], { min: PASSWORD_MIN }) : "";

  return (
    <main className="mx-auto max-w-2xl px-5 py-14 md:px-8 md:py-16">
      <div className="flex items-start justify-between gap-4">
        <Eyebrow>{t.eyebrow}</Eyebrow>
        <Link
          href={`/signup?lang=${other}${refCode ? `&ref=${encodeURIComponent(refCode)}` : ""}`}
          hrefLang={other}
          className="rounded-pill border border-mocha px-3 py-1 text-[12px] font-semibold uppercase tracking-wide text-wine transition-colors hover:bg-blush"
        >
          {other === "es" ? "Español" : "English"}
        </Link>
      </div>

      <h1 className="mt-2 font-headline text-[2.25rem] font-semibold leading-tight text-ink-strong md:text-5xl">
        {t.heading}
      </h1>
      <SignatureRule className="mt-4" />
      <p className="mt-4 max-w-lg text-lg leading-relaxed text-slate">{t.lede}</p>

      {refCode && (
        <p className="mt-5 inline-flex items-center gap-2 rounded-pill bg-blush px-4 py-1.5 text-[13px] font-medium text-wine">
          ✦ {fill(t.referredBy, { code: refCode })}
        </p>
      )}

      <section className="mt-8 rounded-card border border-line bg-surface p-6 shadow-soft">
        <h2 className="font-headline text-lg font-semibold text-ink-strong">{t.youGet.heading}</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {t.youGet.items.map((item) => (
            <li key={item} className="flex gap-2.5 text-[15px] leading-relaxed text-ink">
              <span aria-hidden className="mt-[2px] text-mocha">
                ✦
              </span>
              {item}
            </li>
          ))}
        </ul>
      </section>

      {errorText && (
        <p
          role="alert"
          className="mt-8 rounded-card bg-blush-deep px-5 py-3.5 text-[15px] font-medium text-wine"
        >
          {errorText}
        </p>
      )}

      <div className="mt-8">
        <SignupForm
          copy={{
            fields: {
              ...(t.fields as Record<string, string>),
              passwordHint: fill(t.fields.passwordHint, { min: PASSWORD_MIN }),
            },
            slugStatus: t.slugStatus as Record<string, string>,
            submit: t.submit,
            submitting: t.submitting,
            footnote: t.footnote,
            signInInstead: t.signInInstead,
          }}
          lang={locale}
          passwordMin={PASSWORD_MIN}
          action={submitSignup}
          refCode={refCode}
          initial={{
            name: searchParams.name ?? "",
            practiceName: searchParams.practiceName ?? "",
            email: searchParams.email ?? "",
            slug: searchParams.slug ?? "",
          }}
        />
      </div>

      <p className="mt-8 text-[15px] text-slate">
        <Link href="/login" className="font-medium text-wine underline decoration-mocha/60 underline-offset-4">
          {t.signInInstead}
        </Link>
      </p>
    </main>
  );
}
