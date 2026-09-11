import type { Metadata } from "next";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { getDiscoverySlots } from "@/lib/discovery";
import { SITE } from "@/content/site-content";
import { BookingFlow } from "./BookingFlow";
import { submitBooking } from "./actions";

// C18.3/.4 — the discovery funnel. Dynamic (reads live open slots) while the
// marketing home stays static. Reads ONLY free/busy times via the narrow
// lib/discovery surface — no client data crosses the wall.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Book a free discovery call",
  description:
    "Book a free, no-pressure discovery call with Valentina Vélez to see whether this work is the right fit.",
};

export default async function BookPage({ searchParams }: { searchParams: { error?: string } }) {
  const { days, timezone } = await getDiscoverySlots();

  return (
    <main className="mx-auto max-w-2xl px-5 py-16 md:px-8">
      <Eyebrow>A free discovery call</Eyebrow>
      <h1 className="mt-2 font-headline text-[2.25rem] font-semibold leading-tight text-ink-strong md:text-5xl">
        Let&apos;s find a time to talk
      </h1>
      <SignatureRule />
      <p className="mb-10 mt-4 max-w-lg text-lg leading-relaxed text-slate">{SITE.closing.body}</p>

      <BookingFlow days={days} timezone={timezone} action={submitBooking} error={searchParams.error} />
    </main>
  );
}
