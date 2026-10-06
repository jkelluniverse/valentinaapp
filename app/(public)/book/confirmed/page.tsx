import Link from "next/link";
import type { Metadata } from "next";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { AddToCalendar } from "@/components/AddToCalendar";
import { getDiscoveryInvite } from "@/lib/discovery";
import { headers } from "next/headers";
import { bookCopy, resolvePublicLocale, fill } from "@/lib/book-copy";

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
  searchParams: { t?: string; lang?: string };
}) {
  const invite = searchParams.t ? await getDiscoveryInvite(searchParams.t) : null;
  const c = bookCopy(resolvePublicLocale(searchParams.lang, headers().get("accept-language")));
  // RULING 224 — a REQUEST is not booked, and this page must not say it is.
  const v = invite?.requested ? c.requested : c.confirmed;

  return (
    <main className="mx-auto flex max-w-xl flex-col items-center gap-6 px-5 py-24 text-center md:px-8">
      <Eyebrow>{v.eyebrow}</Eyebrow>
      <h1 data-c40={invite?.requested ? "requested" : "confirmed"} className="font-headline text-[2.25rem] font-semibold leading-tight text-ink-strong md:text-5xl">
        {v.title}
      </h1>
      <SignatureRule />
      <p className="max-w-md text-lg leading-relaxed text-slate">{fill(v.lede, { practitioner: "Valentina" })}</p>
      {invite && !invite.cancelled && !invite.requested && (
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
