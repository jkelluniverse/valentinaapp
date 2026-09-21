import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { isPlatformHost } from "@/lib/platform-host";

// C35-FOUNDERS-EVENT — STAGE 1. THE CARDS ARE ALREADY PRINTED (ruling 174: a
// printed URL is a permanent dependency). This route exists so /founders stops
// 404ing for anyone holding one, WEEKS before the real page is built. Stage 2
// replaces this file with the page itself.
//
// PLATFORM HOST ONLY. A practice's own domain has no founding funnel, so
// /founders there keeps 404ing exactly as it does today — notFound() renders
// app/not-found.tsx inside the same root layout as any unknown path, so the
// visitor sees no change at all.
//
// RULING 172 — THE REDIRECT IS RELATIVE AND THAT IS THE WHOLE POINT.
// req.nextUrl.origin inside this container is the INTERNAL origin; building a
// redirect from it has caused three production defects (C32 §2, P2.2, the auth
// handler). A relative Location is same-origin by construction: there is no
// origin to get wrong, so this route needs neither publicOrigin() nor a
// nexturl-allow pragma. `searchParams` is a page prop — nextUrl is never
// touched here at any depth.
//
// THE QUERY STRING SURVIVES THE HOP, deliberately: the printed cards carry
// ?source=… and that attribution is the only way to tell an event lead from a
// walk-in. Dropping it would silently destroy the thing the cards are for.
//
// RULING 179 / 181 — AND SURVIVING THE HOP WAS NOT ENOUGH. Stage 1 shipped
// preserving `?source=` faithfully, and /join IGNORED IT: it reads `?src=`
// (join/page.tsx:53) and falls back to DEFAULT_SOURCE="web", so every card scan
// stored as a walk-in. The parameter arrived; nothing on the far side read it.
// Verifying a value crosses a boundary proves nothing about whether anything
// reads it there — follow a value to where it is STORED.
//
// THE MAPPING, and its edges are the interesting part:
//   1. the incoming query string is still preserved VERBATIM;
//   2. the known card `source` — and ONLY that one — maps to the tag Jacob
//      ratified (ruling 181). The `event-` prefix is load-bearing beyond
//      tidiness: engage's event-lead audience is `source.startsWith("event-")`
//      (lib/engage-sequences.ts:41,50), so the prefix is what makes a card lead
//      ELIGIBLE for the follow-up at all. The gate stays closed regardless;
//      eligibility is not a send;
//   3. ANY OTHER `source`, or none, adds NOTHING and /join's own default
//      applies. THIS ROUTE INVENTS NO TAGS — a made-up tag is worse than "web",
//      because "web" is honestly unknown while an invented one looks deliberate;
//   4. an explicit incoming `?src=` ALWAYS WINS and is never overwritten, so a
//      future card or campaign can state its own tag directly and this mapping
//      cannot silently override it.
// Matching is trimmed and case-insensitive: a QR scan is verbatim, but a
// hand-typed URL is not, and a capitalised card value is the same lead.
export const dynamic = "force-dynamic";

/** The value printed on the PSYCH-K® FTL 2026 cards. */
const CARD_SOURCE = "psychk-health-wellbeing-ftl-2026";
/** Ruling 181 — what a card-scanned lead is STORED as. */
const CARD_TAG = "event-psychk-ftl-2026";

export default function FoundersEntry({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const h = headers();
  if (!isPlatformHost(h.get("x-forwarded-host") || h.get("host"))) notFound();

  // Rebuilt rather than passed through, so a repeated key (?source=a&source=b)
  // keeps BOTH values instead of silently collapsing to one.
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (Array.isArray(value)) for (const v of value) qs.append(key, v);
    else if (value !== undefined) qs.append(key, value);
  }
  // Ruling 181's mapping — see the rule and its edges in the header above.
  const incomingSource = (qs.get("source") ?? "").trim().toLowerCase();
  if (!qs.has("src") && incomingSource === CARD_SOURCE) qs.set("src", CARD_TAG);

  const search = qs.toString();
  redirect(search ? `/join?${search}` : "/join");
}
