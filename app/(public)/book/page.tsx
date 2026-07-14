import Link from "next/link";
import type { Metadata } from "next";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { SITE } from "@/content/site-content";

// C18.3 placeholder — the discovery funnel (slots → form → confirm) lands here
// next. Kept graceful so the site's primary CTA never dead-ends in the interim.
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "Book a free discovery call",
  description:
    "Book a free, no-pressure discovery call with Valentina Vélez to see whether this work is the right fit.",
};

export default function BookPage() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col items-center gap-6 px-5 py-24 text-center md:px-8">
      <Eyebrow>A free discovery call</Eyebrow>
      <h1 className="font-headline text-[2.25rem] font-semibold leading-tight text-ink-strong md:text-5xl">
        Let&apos;s find a time to talk
      </h1>
      <SignatureRule />
      <p className="max-w-lg text-lg leading-relaxed text-slate">
        {SITE.closing.body}
      </p>
      <p className="rounded-card border border-line bg-surface px-6 py-5 text-[15px] text-ink shadow-soft">
        Online booking opens here shortly. In the meantime, reach out and Valentina will find a
        time with you.
      </p>
      <Link
        href="/"
        className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
      >
        ← Back to home
      </Link>
    </main>
  );
}
