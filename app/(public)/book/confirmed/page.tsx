import Link from "next/link";
import type { Metadata } from "next";
import { SignatureRule, Eyebrow } from "@/components/brand";

// C18 §4 — the calm landing after booking. The real confirmation is the email
// (with the .ics and the reschedule link); this page just reassures.
export const dynamic = "force-static";

export const metadata: Metadata = {
  title: "You're booked",
  robots: { index: false, follow: false },
};

export default function ConfirmedPage() {
  return (
    <main className="mx-auto flex max-w-xl flex-col items-center gap-6 px-5 py-24 text-center md:px-8">
      <Eyebrow>Confirmed</Eyebrow>
      <h1 className="font-headline text-[2.25rem] font-semibold leading-tight text-ink-strong md:text-5xl">
        Your call is booked
      </h1>
      <SignatureRule />
      <p className="max-w-md text-lg leading-relaxed text-slate">
        A confirmation is on its way to your inbox, with a calendar invite and a link to reschedule
        if you need to. Valentina looks forward to speaking with you.
      </p>
      <Link href="/" className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline">
        ← Back to home
      </Link>
    </main>
  );
}
