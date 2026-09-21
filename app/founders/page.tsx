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
export const dynamic = "force-dynamic";

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
  const search = qs.toString();
  redirect(search ? `/join?${search}` : "/join");
}
