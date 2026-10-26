import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isPlatformHost, PLATFORM_NAME } from "@/lib/platform-host";

// ============================================================================
// P2.2 — PLACEHOLDER. REPLACED WHOLESALE, NOT EDITED.
//
// Jacob is producing the platform's content — copy, pricing, design — in
// separate files. When they land, this page is DELETED and replaced; it is not
// a foundation to build on and nothing here is a design decision.
//
// Its single job: stop the platform's own domain serving tenant #1's marketing
// page under the platform's name (the V8 finding — psychefolio.com was
// publicly showing her title and 35 "valentina" occurrences).
//
// DELIBERATELY ABSENT, and must stay absent until Jacob's files arrive:
// marketing copy, any pricing, any dollar figure, the word "free" (law 2 — §7
// pricing is unratified). The two links are the ones that must work, not an
// invitation to grow a landing page.
//
// Reached by a middleware REWRITE of "/" on the platform host, so the visitor's
// URL stays psychefolio.com/. The host guard below makes the route 404 anywhere
// else, so a practice's domain can never serve the platform's placeholder.
// ============================================================================

export const dynamic = "force-dynamic";

export default function PlatformPlaceholder() {
  const h = headers();
  if (!isPlatformHost(h.get("x-forwarded-host") || h.get("host"))) notFound();

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-2xl flex-col justify-center px-5 py-20 md:px-8">
      <h1 className="font-headline text-4xl font-semibold" style={{ color: "#2E2749" }}>
        {PLATFORM_NAME}
      </h1>
      <p className="mt-4 text-base" style={{ color: "#5A5B66" }}>
        The public site is in preparation.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-5 text-sm">
        <Link href="/signup" className="font-medium underline underline-offset-4" style={{ color: "#2E2749" }}>
          Practitioner sign-up
        </Link>
        <Link href="/login" className="font-medium underline underline-offset-4" style={{ color: "#2E2749" }}>
          Log in
        </Link>
      </div>
    </main>
  );
}
