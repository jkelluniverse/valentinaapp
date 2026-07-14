import Link from "next/link";
import type { Metadata } from "next";
import { SITE } from "@/content/site-content";
import { Img } from "@/components/public/Img";

// C18.2 — the one-pager, redesigned to her brand mock (banded editorial layout,
// her real assets). STATIC (no session, no data reads) so it renders instantly
// and scores green on Core Web Vitals — it's the ad.
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: SITE.hero.headline,
  description: SITE.hero.subhead,
};

function PrimaryCta({ light = false, children }: { light?: boolean; children: React.ReactNode }) {
  return (
    <Link
      href="/book"
      className={`inline-flex items-center justify-center rounded-pill px-7 py-3.5 text-[15px] font-semibold shadow-soft transition-all hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
        light
          ? "bg-cream text-wine hover:bg-white focus-visible:outline-cream"
          : "bg-wine text-white hover:bg-wine-dark focus-visible:outline-wine"
      }`}
    >
      {children}
    </Link>
  );
}

export default function MarketingHome() {
  return (
    <main>
      {/* HERO — cream, brain motif whispering behind the words */}
      <section className="relative overflow-hidden bg-gradient-to-b from-canvas to-blush/40 px-5 pb-24 pt-20 text-center md:px-8 md:pt-28">
        <Img
          src="/brain-motif.webp"
          alt=""
          className="pointer-events-none absolute -right-16 -top-10 z-0 w-[520px] max-w-[58%] opacity-10"
          loading="eager"
          fallback={null}
        />
        <div className="relative z-10 mx-auto max-w-5xl">
          <p className="text-eyebrow font-semibold uppercase tracking-[0.18em] text-mocha">
            {SITE.credential}
          </p>
          <h1 className="mx-auto mt-6 max-w-[15ch] font-headline text-[2.5rem] font-medium leading-[1.08] text-ink-strong md:text-[4.25rem]">
            Rewrite your subconscious, <em className="italic text-wine">transform your life.</em>
          </h1>
          <p className="mx-auto mt-7 max-w-[52ch] text-lg leading-relaxed text-ink md:text-xl">
            {SITE.hero.subhead}
          </p>
          <div className="mt-9">
            <PrimaryCta>{SITE.hero.cta}</PrimaryCta>
          </div>
          <p className="mt-4 font-headline text-sm italic text-whisper">{SITE.hero.reassure}</p>
        </div>
      </section>

      {/* MEET — white band, two columns, her portrait */}
      <section className="bg-surface px-5 py-20 md:px-8 md:py-24">
        <div className="mx-auto grid max-w-5xl items-center gap-10 md:grid-cols-[0.85fr_1.15fr] md:gap-14">
          <div className="mx-auto aspect-[4/5] w-full max-w-[340px] overflow-hidden rounded-[20px] bg-gradient-to-br from-blush to-mocha/30 shadow-[0_20px_50px_rgba(88,12,34,0.12)] md:mx-0">
            <Img
              src="/valentina-portrait.jpg"
              alt={`${SITE.practitioner}, ${SITE.credential}`}
              className="h-full w-full object-cover"
              width={800}
              height={1000}
              fallback={
                <span className="flex h-full w-full items-center justify-center font-headline text-2xl italic text-wine/50">
                  Valentina
                </span>
              }
            />
          </div>
          <div>
            <p className="text-eyebrow font-semibold uppercase tracking-[0.18em] text-mocha">
              {SITE.about.eyebrow}
            </p>
            <h2 className="mt-3 font-headline text-3xl font-medium text-ink-strong md:text-4xl">
              {SITE.about.heading}
            </h2>
            <div className="mt-5 flex flex-col gap-4 text-lg leading-relaxed text-ink">
              {SITE.about.body.map((p) => (
                <p key={p.slice(0, 24)}>{p}</p>
              ))}
            </div>
            <span className="mt-6 inline-flex items-center gap-2 rounded-pill bg-blush px-4 py-2 text-[13px] font-medium text-wine">
              ✦ {SITE.about.credentialChip}
            </span>
          </div>
        </div>
      </section>

      {/* THREE PHASE — wine band, floating cards */}
      <section className="bg-gradient-to-b from-wine to-wine-dark px-5 py-24 text-cream md:px-8 md:py-28">
        <div className="mx-auto max-w-5xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-eyebrow font-semibold uppercase tracking-[0.18em] text-mocha">
              {SITE.program.eyebrow}
            </p>
            <h2 className="mt-4 font-headline text-3xl font-medium text-white md:text-[2.6rem]">
              {SITE.program.heading}
            </h2>
            <p className="mt-4 leading-relaxed text-cream/90">{SITE.program.intro}</p>
          </div>
          <ol className="mt-14 grid gap-5 md:grid-cols-3">
            {SITE.program.phases.map((phase, i) => (
              <li
                key={phase.name}
                className="rounded-[20px] bg-surface p-8 text-ink shadow-[0_16px_40px_rgba(0,0,0,0.18)] transition-transform hover:-translate-y-1.5"
              >
                <span className="font-headline text-[2.75rem] font-medium leading-none text-mocha">
                  0{i + 1}
                </span>
                <h3 className="mt-3 font-headline text-xl font-semibold text-ink-strong">{phase.name}</h3>
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-wine">
                  {phase.focus}
                </p>
                <p className="mt-3 text-[15px] leading-relaxed text-slate">{phase.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* PROCESS — cream band, numbered steps */}
      <section className="bg-canvas px-5 py-20 md:px-8 md:py-24">
        <div className="mx-auto max-w-3xl">
          <div className="text-center">
            <p className="text-eyebrow font-semibold uppercase tracking-[0.18em] text-mocha">
              {SITE.process.eyebrow}
            </p>
            <h2 className="mt-4 font-headline text-3xl font-medium text-ink-strong md:text-4xl">
              {SITE.process.heading}
            </h2>
          </div>
          <ul className="mt-10 flex flex-col divide-y divide-line">
            {SITE.process.steps.map((step, i) => (
              <li key={step.name} className="flex items-start gap-6 py-7">
                <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-wine font-headline text-2xl text-white shadow-[0_6px_18px_rgba(88,12,34,0.25)]">
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-headline text-xl font-semibold text-ink-strong">{step.name}</h3>
                  <p className="mt-1.5 leading-relaxed text-ink">{step.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* TESTIMONIALS — blush band */}
      <section className="bg-gradient-to-b from-blush to-blush/60 px-5 py-20 md:px-8 md:py-24">
        <div className="mx-auto max-w-4xl">
          <div className="text-center">
            <p className="text-eyebrow font-semibold uppercase tracking-[0.18em] text-mocha">
              {SITE.testimonialsHead.eyebrow}
            </p>
            <h2 className="mt-4 font-headline text-3xl font-medium text-ink-strong md:text-4xl">
              {SITE.testimonialsHead.heading}
            </h2>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {SITE.testimonials.map((t) => (
              <figure
                key={t.attribution}
                className="relative rounded-[20px] bg-surface p-8 shadow-[0_10px_34px_rgba(88,12,34,0.08)]"
              >
                <span className="absolute left-6 top-4 font-headline text-6xl leading-none text-mocha/40">
                  “
                </span>
                <blockquote className="relative mt-6 font-headline text-lg italic leading-relaxed text-ink-strong">
                  {t.quote}
                </blockquote>
                <figcaption className="mt-5 text-sm font-semibold text-wine">
                  {t.attribution} <span className="font-normal text-whisper">· {t.location}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA — wine band */}
      <section className="bg-gradient-to-b from-wine to-wine-dark px-5 py-24 text-center text-cream md:px-8 md:py-28">
        <div className="mx-auto max-w-xl">
          <h2 className="font-headline text-3xl font-medium text-white md:text-[3rem]">
            {SITE.closing.heading}
          </h2>
          <p className="mx-auto mt-5 max-w-[44ch] text-lg leading-relaxed text-cream/90">
            {SITE.closing.body}
          </p>
          <div className="mt-9">
            <PrimaryCta light>{SITE.closing.cta}</PrimaryCta>
          </div>
        </div>
      </section>
    </main>
  );
}
