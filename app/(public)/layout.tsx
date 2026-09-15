import type { Metadata } from "next";
import { PublicHeader, PublicFooter } from "@/components/public/PublicChrome";
import { SITE } from "@/content/site-content";

// C18 §2 — the public route group. Its own chrome, no auth, no portal imports.
// Warm Stone in daylight only (no Dusk here — the front door is always warm).
// The structural wall: nothing under app/(public)/** may import a data-reading
// lib. Enforced by scripts/check-public-wall.mjs (npm run lint:wall).

// C31 — HER metadata (name, credential, og/twitter/canonical pointing at her
// site) renders only where the request resolves HER tenant — which includes
// build time for the static routes, exactly as the body's resolution call has
// always behaved, so the default output is byte-identical. A NON-default
// practice's public pages carry that practice's name and NOTHING of hers: no
// og/twitter/canonical is invented for a practice (that is brand-web's to
// design); the title template resolves so every public page's tab suffix is
// the practice's own. Unresolved renders nothing (the layout redirects).
const DEFAULT_METADATA: Metadata = {
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

export async function generateMetadata(): Promise<Metadata> {
  const { getTenantResolution } = await import("@/lib/tenancy");
  const { DEFAULT_TENANT_ID } = await import("@/lib/tenancy/scope");
  const r = await getTenantResolution();
  if (r.kind === "unresolved") return {};
  if (r.kind === "tenant" && r.tenant.id !== DEFAULT_TENANT_ID) {
    const name = r.tenant.displayName || r.tenant.slug;
    return {
      title: { default: name, template: `%s · ${name}` },
      robots: { index: true, follow: true },
    };
  }
  return DEFAULT_METADATA;
}

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  // C26-FAIL-CLOSED-TENANCY §3 — if this request's HOST cannot be resolved to
  // a tenant (the lookup errored, nothing cached), no public page may render
  // under anyone's identity, and no form may be offered that cannot be safely
  // submitted. The visitor gets the neutral 503 instead; the data layer
  // refuses scoped access independently (lib/prisma.ts), so this is the
  // honest face on a refusal that happens regardless.
  const { getTenantResolution } = await import("@/lib/tenancy");
  const { DEFAULT_TENANT_ID } = await import("@/lib/tenancy/scope");
  const { redirect } = await import("next/navigation");
  const r = await getTenantResolution();
  if (r.kind === "unresolved") redirect("/unavailable");
  // C31 — the public chrome (header/footer wordmark, © line) is the resolved
  // practice's, passed as a plain string so components/public stays behind the
  // wall (no data imports there). null = the default tenant's original chrome,
  // byte-for-byte — hers, including unknown-slug hosts (V6 unchanged) and
  // build-time renders of the static routes.
  const practice = r.kind === "tenant" && r.tenant.id !== DEFAULT_TENANT_ID ? r.tenant.displayName || r.tenant.slug : null;
  return (
    <div data-portal="public" className="flex min-h-dvh flex-col bg-canvas text-ink">
      <PublicHeader practice={practice} />
      <div className="flex-1">{children}</div>
      <PublicFooter practice={practice} />
    </div>
  );
}
