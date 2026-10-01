// wall-allow: writes only PractitionerProspect.unsubscribedAt (platform prospect ledger); reads and writes no client data
import type { Metadata } from "next";
import { headers } from "next/headers";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { resolvePublicLocale } from "@/lib/signup-copy";
import { engageCatalog } from "@/lib/engage-templates";
import { prospectIdFromToken } from "@/lib/engage-config";
import { unsubscribeProspect } from "@/lib/engage";

// C23-ENGAGE §6 — one click, no login, no confirmation step. The click IS the
// request: nobody should have to prove they meant it in order to be left
// alone, and a consent withdrawal behind an extra button is a consent
// withdrawal we made harder on purpose.
//
// Server-side and permanent: the write happens here, before any sequence can
// look at this prospect again (lib/engage.ts checks `unsubscribedAt` first,
// ahead of the gate, the pause and the transport). Idempotent — a second click
// changes nothing and says so.
//
// A forged or unknown token unsubscribes nobody and renders a plain page: no
// 500, no stack trace, and no confirmation that some other id exists.
//
// The token is DERIVED (HMAC over AUTH_SECRET, domain-separated), so there is
// no token column to leak and no expiry to strand someone with a dead link.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Unsubscribe",
  // Same posture as the other public acquisition surfaces (ruling 4).
  robots: { index: false, follow: false },
};

export default async function UnsubscribePage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { lang?: string };
}) {
  const locale = resolvePublicLocale(searchParams.lang, headers().get("accept-language"));
  const t = engageCatalog(locale).page;

  const prospectId = prospectIdFromToken(params.token);
  const outcome = await unsubscribeProspect(prospectId);

  const copy =
    outcome === "done"
      ? { heading: t.doneHeading, body: t.doneBody }
      : outcome === "already"
        ? { heading: t.alreadyHeading, body: t.alreadyBody }
        : { heading: t.invalidHeading, body: t.invalidBody };

  return (
    <main className="mx-auto max-w-xl px-5 py-16 md:px-8 md:py-24">
      <Eyebrow>{t.eyebrow}</Eyebrow>
      <h1
        data-outcome={outcome}
        className="mt-2 font-headline text-[2rem] font-semibold leading-tight text-ink-strong md:text-4xl"
      >
        {copy.heading}
      </h1>
      <SignatureRule className="mt-4" />
      <p className="mt-5 text-lg leading-relaxed text-slate">{copy.body}</p>
      <p className="mt-8 text-[13px] leading-relaxed text-whisper">{t.footnote}</p>
    </main>
  );
}
