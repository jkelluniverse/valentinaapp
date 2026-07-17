import Link from "next/link";
import type { Metadata } from "next";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { AddToCalendar } from "@/components/AddToCalendar";
import { getDiscoveryInvite } from "@/lib/discovery";

// C18 §4 — the calm landing after booking. The email carries the same invite;
// this page offers add-to-calendar right away (phones especially).
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "You're booked",
  robots: { index: false, follow: false },
};

export default async function ConfirmedPage({
  searchParams,
}: {
  searchParams: { t?: string };
}) {
  const invite = searchParams.t ? await getDiscoveryInvite(searchParams.t) : null;

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
      {invite && !invite.cancelled && (
        <AddToCalendar
          event={{
            title: "Discovery call · Valentina Vélez",
            start: invite.startAt,
            end: invite.endAt,
            description: invite.videoUrl ? `Join here at the time: ${invite.videoUrl}` : null,
            location: invite.videoUrl ?? "Virtual",
          }}
          icsHref={`/discovery/${searchParams.t}/invite.ics`}
          className="justify-center"
        />
      )}
      <Link href="/" className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline">
        ← Back to home
      </Link>
    </main>
  );
}
