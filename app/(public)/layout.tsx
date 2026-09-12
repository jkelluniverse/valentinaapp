import type { Metadata } from "next";
import { PublicHeader, PublicFooter } from "@/components/public/PublicChrome";
import { SITE } from "@/content/site-content";

// C18 §2 — the public route group. Its own chrome, no auth, no portal imports.
// Warm Stone in daylight only (no Dusk here — the front door is always warm).
// The structural wall: nothing under app/(public)/** may import a data-reading
// lib. Enforced by scripts/check-public-wall.mjs (npm run lint:wall).

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.practitioner} — ${SITE.credential}`,
    template: `%s · ${SITE.practitioner}`,
  },
  description: SITE.hero.subhead,
  openGraph: {
    type: "website",
    siteName: SITE.practitioner,
    title: `${SITE.practitioner} — ${SITE.credential}`,
    description: SITE.hero.subhead,
    url: SITE.url,
  },
  twitter: { card: "summary_large_image", title: SITE.practitioner, description: SITE.hero.subhead },
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
};

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  // C26-FAIL-CLOSED-TENANCY §3 — if this request's HOST cannot be resolved to
  // a tenant (the lookup errored, nothing cached), no public page may render
  // under anyone's identity, and no form may be offered that cannot be safely
  // submitted. The visitor gets the neutral 503 instead; the data layer
  // refuses scoped access independently (lib/prisma.ts), so this is the
  // honest face on a refusal that happens regardless.
  const { getTenantResolution } = await import("@/lib/tenancy");
  const { redirect } = await import("next/navigation");
  if ((await getTenantResolution()).kind === "unresolved") redirect("/unavailable");
  return (
    <div data-portal="public" className="flex min-h-dvh flex-col bg-canvas text-ink">
      <PublicHeader />
      <div className="flex-1">{children}</div>
      <PublicFooter />
    </div>
  );
}
