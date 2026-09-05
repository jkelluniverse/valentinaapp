import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { captureCopy, resolvePublicLocale, fill } from "@/lib/capture-copy";
import { CAPS, DEFAULT_SOURCE } from "@/lib/capture-config";
import { submitCapture } from "./actions";

// C23-CAPTURE §1 — the event floor. One screen, phone-first, thumb-reachable.
//
// MINIMAL JAVASCRIPT ON PURPOSE (§1): this is a plain server-rendered form
// posting to a server action. There is no client component in this route, so
// it submits on a saturated conference network before any bundle has finished
// arriving — nothing here waits on hydration. The time-trap timestamp is
// stamped at RENDER time on the server for the same reason.
//
// Reads no data, so the wall (C18 §2) holds here without a pragma; only the
// action carries one.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Leave us your name",
  description: "Founding partners: leave your name and we will be in touch about a practice portal.",
  // Same posture as /signup (Architect ruling #4): a pre-launch acquisition
  // surface is not indexed by accident.
  robots: { index: false, follow: false },
};

export default function JoinPage({
  searchParams,
}: {
  searchParams: {
    lang?: string;
    ref?: string;
    src?: string;
    error?: string;
    name?: string;
    email?: string;
    phone?: string;
    practiceName?: string;
    note?: string;
  };
}) {
  const locale = resolvePublicLocale(searchParams.lang, headers().get("accept-language"));
  const t = captureCopy(locale);
  const other = locale === "en" ? "es" : "en";

  // Derived, never asked for: the printed QR's `?src=`, and the referral code
  // of whoever handed them the link.
  const refCode = (searchParams.ref ?? "").trim().slice(0, CAPS.referredByCode);
  const src = (searchParams.src ?? "").trim().slice(0, CAPS.source) || DEFAULT_SOURCE;

  const carry = new URLSearchParams();
  if (refCode) carry.set("ref", refCode);
  if (src) carry.set("src", src);
  const langHref = (l: string) => {
    const qs = new URLSearchParams(carry);
    qs.set("lang", l);
    return `/join?${qs.toString()}`;
  };
  const signupQs = new URLSearchParams(carry);
  if (locale === "es") signupQs.set("lang", "es");

  const errorKey = searchParams.error ?? "";
  const errors = t.errors as Record<string, string>;
  const errorText = errorKey && errors[errorKey] ? errors[errorKey] : "";

  const field =
    "w-full rounded-lg border border-line bg-surface px-4 py-3 text-[16px] text-ink outline-none transition-colors focus:border-wine focus:ring-2 focus:ring-wine/20";
  const label = "flex flex-col gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-mocha";
  const hint = "text-[13px] leading-relaxed text-slate";

  return (
    <main className="mx-auto max-w-xl px-5 py-12 md:px-8 md:py-16">
      <div className="flex items-start justify-between gap-4">
        <Eyebrow>{t.eyebrow}</Eyebrow>
        <Link
          href={langHref(other)}
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
      <p className="mt-4 text-lg leading-relaxed text-slate">{t.lede}</p>

      {refCode && (
        <p className="mt-5 inline-flex items-center gap-2 rounded-pill bg-blush px-4 py-1.5 text-[13px] font-medium text-wine">
          ✦ {fill(t.referredBy, { code: refCode })}
        </p>
      )}

      {errorText && (
        <p role="alert" className="mt-7 rounded-card bg-blush-deep px-5 py-3.5 text-[15px] font-medium text-wine">
          {errorText}
        </p>
      )}

      <form action={submitCapture} className="mt-8 flex flex-col gap-6">
        <input type="hidden" name="lang" value={locale} />
        <input type="hidden" name="ref" value={refCode} />
        <input type="hidden" name="src" value={src} />
        {/* Stamped on the SERVER at render time — no client clock, no hydration. */}
        <input type="hidden" name="t" value={Date.now()} />
        {/* honeypot — hidden from humans and assistive tech alike */}
        <div aria-hidden className="absolute h-0 w-0 overflow-hidden opacity-0">
          <label>
            Company
            <input name="company" tabIndex={-1} autoComplete="off" />
          </label>
        </div>

        <label className={label}>
          {t.fields.name}
          <input
            name="name"
            required
            autoComplete="name"
            maxLength={CAPS.name}
            defaultValue={searchParams.name ?? ""}
            placeholder={t.fields.namePlaceholder}
            className={field}
          />
        </label>

        <label className={label}>
          {t.fields.email}
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            maxLength={CAPS.email}
            defaultValue={searchParams.email ?? ""}
            placeholder={t.fields.emailPlaceholder}
            className={field}
          />
        </label>

        <p className="text-[13px] font-semibold uppercase tracking-wide text-whisper">{t.fields.optional}</p>

        <label className={label}>
          {t.fields.practiceName}
          <input
            name="practiceName"
            autoComplete="organization"
            maxLength={CAPS.practiceName}
            defaultValue={searchParams.practiceName ?? ""}
            placeholder={t.fields.practiceNamePlaceholder}
            className={field}
          />
        </label>

        <label className={label}>
          {t.fields.phone}
          <input
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            maxLength={CAPS.phone}
            defaultValue={searchParams.phone ?? ""}
            placeholder={t.fields.phonePlaceholder}
            className={field}
          />
        </label>

        <label className={label}>
          {t.fields.note}
          <textarea
            name="note"
            rows={3}
            maxLength={CAPS.note}
            defaultValue={searchParams.note ?? ""}
            placeholder={t.fields.notePlaceholder}
            className={field}
          />
        </label>

        <button
          type="submit"
          className="mt-1 rounded-pill bg-wine px-7 py-4 text-[16px] font-semibold text-white shadow-soft transition-colors hover:bg-wine-dark"
        >
          {t.submit}
        </button>
        <p className={hint}>{t.honest}</p>
        <p className={hint}>{t.footnote}</p>
      </form>

      {/* §1 — the visitor who arrived already wanting an account. ?ref= and
          ?src= travel with them so attribution survives the handoff. */}
      <p className="mt-8 text-[15px] text-slate">
        <Link
          href={`/signup${signupQs.toString() ? `?${signupQs.toString()}` : ""}`}
          className="font-medium text-wine underline decoration-mocha/60 underline-offset-4"
        >
          {t.signupInstead}
        </Link>
      </p>
    </main>
  );
}
