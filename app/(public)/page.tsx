import Link from "next/link";
import type { Metadata } from "next";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { SITE } from "@/content/site-content";

// C18.2 — the one-pager. Mirrors her live site's content and section order,
// rebuilt in Warm Stone. STATIC by construction (no session, no data reads) so
// it renders instantly and scores green on Core Web Vitals — it's the ad.
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: SITE.hero.headline,
  description: SITE.hero.subhead,
};

function CtaButton({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <Link
      href="/book"
      className={`inline-flex items-center justify-center rounded-pill bg-wine px-7 py-3 text-[15px] font-medium text-white shadow-soft transition-colors hover:bg-wine-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine ${className}`}
    >
      {children}
    </Link>
  );
}

export default function MarketingHome() {
  return (
    <main className="mx-auto max-w-5xl px-5 md:px-8">
      {/* Hero */}
      <section className="flex flex-col items-center gap-6 pb-14 pt-16 text-center md:pt-24">
        <Eyebrow>{SITE.credential}</Eyebrow>
        <h1 className="max-w-3xl font-headline text-[2.5rem] font-semibold leading-[1.08] text-ink-strong md:text-[3.75rem]">
          {SITE.hero.headline}
        </h1>
        <p className="max-w-2xl text-lg leading-relaxed text-slate md:text-xl">{SITE.hero.subhead}</p>
        <CtaButton className="mt-2">{SITE.hero.cta}</CtaButton>
      </section>

      {/* About */}
      <section className="mx-auto max-w-3xl border-t border-line py-16 md:py-20">
        <Eyebrow>{SITE.about.eyebrow}</Eyebrow>
        <h2 className="mt-2 font-headline text-3xl font-medium text-ink-strong md:text-4xl">
          {SITE.about.heading}
        </h2>
        <SignatureRule />
        <div className="mt-4 flex flex-col gap-4 text-lg leading-relaxed text-ink">
          {SITE.about.body.map((p) => (
            <p key={p.slice(0, 24)}>{p}</p>
          ))}
        </div>
      </section>

      {/* Program — three phases */}
      <section className="border-t border-line py-16 md:py-20">
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow>{SITE.program.eyebrow}</Eyebrow>
          <h2 className="mt-2 font-headline text-3xl font-medium text-ink-strong md:text-4xl">
            {SITE.program.heading}
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-slate">{SITE.program.intro}</p>
        </div>
        <ol className="mt-12 grid gap-5 md:grid-cols-3">
          {SITE.program.phases.map((phase, i) => (
            <li
              key={phase.name}
              className="flex flex-col gap-3 rounded-card border border-line bg-surface p-6 shadow-soft"
            >
              <span className="font-headline text-2xl font-semibold text-mocha">0{i + 1}</span>
              <h3 className="font-headline text-xl font-medium text-ink-strong">{phase.name}</h3>
              <p className="text-sm font-medium uppercase tracking-wide text-wine">{phase.focus}</p>
              <p className="text-[15px] leading-relaxed text-slate">{phase.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Core process */}
      <section className="border-t border-line py-16 md:py-20">
        <div className="mx-auto max-w-3xl">
          <div className="text-center">
            <Eyebrow>{SITE.process.eyebrow}</Eyebrow>
            <h2 className="mt-2 font-headline text-3xl font-medium text-ink-strong md:text-4xl">
              {SITE.process.heading}
            </h2>
          </div>
          <ul className="mt-10 flex flex-col divide-y divide-line">
            {SITE.process.steps.map((step, i) => (
              <li key={step.name} className="flex gap-5 py-6">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blush text-sm font-semibold text-wine ring-1 ring-line">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-headline text-xl font-medium text-ink-strong">{step.name}</h3>
                  <p className="mt-1 text-[15px] leading-relaxed text-slate">{step.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Testimonials */}
      <section className="border-t border-line py-16 md:py-20">
        <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-2">
          {SITE.testimonials.map((t) => (
            <figure
              key={t.attribution}
              className="flex flex-col gap-4 rounded-card border border-line bg-surface p-7 shadow-soft"
            >
              <blockquote className="font-headline text-lg italic leading-relaxed text-ink">
                “{t.quote}”
              </blockquote>
              <figcaption className="text-sm text-slate">
                <span className="font-semibold text-ink-strong">{t.attribution}</span> · {t.location}
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="border-t border-line py-20 text-center">
        <h2 className="mx-auto max-w-2xl font-headline text-3xl font-semibold text-ink-strong md:text-[2.75rem]">
          {SITE.closing.heading}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-slate">{SITE.closing.body}</p>
        <CtaButton className="mt-8">{SITE.closing.cta}</CtaButton>
      </section>
    </main>
  );
}
