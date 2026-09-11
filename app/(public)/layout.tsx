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

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-portal="public" className="flex min-h-dvh flex-col bg-canvas text-ink">
      <PublicHeader />
      <div className="flex-1">{children}</div>
      <PublicFooter />
    </div>
  );
}
