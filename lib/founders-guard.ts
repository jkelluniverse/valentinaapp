import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isPlatformHost } from "@/lib/platform-host";

/**
 * RULING 203 — the guard must run where the PAGE renders, not in the layout.
 *
 * /founders was guarded by a notFound() in app/founders/layout.tsx. On a tenant
 * host it correctly returned 404 and displayed "Not found" — and the response
 * still carried the ENTIRE founding page in its RSC flight payload: "Founding
 * Practice" eight times, every price figure, the apply CTA. A layout and its
 * page render concurrently, so refusing in the layout never stopped the page
 * from rendering, and Next serialised what had already been built.
 *
 * THE GUARD CHANGED THE STATUS WITHOUT STOPPING THE TRANSMISSION — ruling 169's
 * shape: removing a branch is not the same as removing its behaviour.
 *
 * No secret was exposed; this is public marketing copy. What was wrong is that
 * the PLATFORM's pricing was being served from a practice's own domain, which
 * is ruling 154's presentation category in a third place.
 *
 * Called as the first statement of every /founders page, this returns before
 * any JSX is constructed, so there is nothing to serialise.
 */
export function requirePlatformHost(): void {
  const h = headers();
  if (!isPlatformHost(h.get("x-forwarded-host") || h.get("host"))) notFound();
}
