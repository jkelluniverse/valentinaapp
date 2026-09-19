import type { Metadata, Viewport } from "next";
import { Crimson_Pro, Inter } from "next/font/google";
import "./globals.css";
// PLATFORM Layer 2 — all skin files are statically imported; data-skin on
// <html> selects which one's tokens apply.
import "../styles/skins/warm-clay.css";
import "../styles/skins/clinical-light.css";
import "../styles/skins/celestial-dark.css";
import { RegisterSW } from "@/components/mobile/RegisterSW";
import { PwaHint } from "@/components/mobile/PwaHint";

const crimson = Crimson_Pro({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  variable: "--font-headline",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

// C31 — the tab identity resolves from the request's tenant, the same
// expression the portal shells and C29's auth metadata use. The default
// tenant's portalTitle "veritas" capitalizes to exactly the "Veritas" this
// layout has always emitted — byte-identical for her, including at build time
// for static routes (no host resolves the default tenant, as the body's
// getTenant call has always done). Under C26's `unresolved` the tab carries NO
// identity (C29's principle: never a borrowed name on an unresolvable host);
// description, manifest and icons are generic and merge through untouched.
const METADATA_BASE: Metadata = {
  description: "A private space for reflection and progress between sessions.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg",
    apple: "/apple-touch-icon.png",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const { getTenantResolution, staticSiteTenant } = await import("@/lib/tenancy");
  // P2.2/P2.3 — on the PLATFORM's own host the app identity is the platform's.
  // Without this the apex emitted `application-name: Veritas` and an Apple
  // web-app title to match: tenant #1's internal product name installed as the
  // platform's PWA. Same read as the (public) layout, same build-time-safe
  // fallback (headers() throws outside a request → not the platform host →
  // her output stays byte-identical).
  try {
    const { headers } = await import("next/headers");
    const { isPlatformHost, PLATFORM_NAME } = await import("@/lib/platform-host");
    const h = headers();
    if (isPlatformHost(h.get("x-forwarded-host") || h.get("host"))) {
      return {
        ...METADATA_BASE,
        title: PLATFORM_NAME,
        applicationName: PLATFORM_NAME,
        appleWebApp: { capable: true, title: PLATFORM_NAME, statusBarStyle: "default" },
      };
    }
  } catch {
    /* outside a request (build-time static render) — not the platform host */
  }
  const r = await getTenantResolution();
  // P3.3 — a BUILD has no host, so resolution is `unresolved` and this used to
  // drop her PWA identity out of the pre-rendered shell. staticSiteTenant()
  // states whose static site is being built; no REQUEST can reach it.
  const built = r.kind === "unresolved" ? await staticSiteTenant() : r.tenant;
  if (!built) return METADATA_BASE;
  const raw = (built.branding ?? {}).portalTitle || "veritas";
  const name = raw.charAt(0).toUpperCase() + raw.slice(1);
  return {
    ...METADATA_BASE,
    title: name,
    applicationName: name,
    appleWebApp: {
      capable: true,
      title: name,
      statusBarStyle: "default",
    },
  };
}

// AMENDMENT-02 §2/§4 — viewport-fit=cover lets the app paint into the notch and
// home-indicator areas (the shells then pad with env(safe-area-inset-*)).
// theme_color follows Warm Stone: cream by day, deep plum at dusk.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // AMENDMENT-04 §2b — the keyboard resizes the layout viewport, so a pinned
  // composer rides directly above it.
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FEF4EA" },
    { media: "(prefers-color-scheme: dark)", color: "#191114" },
  ],
};

// Applies the saved theme choice before first paint so there's no flash of the
// wrong theme. Runs synchronously; falls back to the system preference.
const THEME_INIT = `(function(){try{var t=localStorage.getItem('veritas-theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // PLATFORM Layer 2 — the tenant's skin selects the token set. Cached 60s;
  // falls back to warm-clay so her portal can never break on a config read.
  const { getTenantResolution, staticSiteTenant } = await import("@/lib/tenancy");
  // Same build-time statement as generateMetadata above: the pre-rendered shell
  // is tenant #1's. A request that cannot be placed still gets the unresolved
  // shell's skin, which is what C26 renders around its 503.
  const res = await getTenantResolution();
  const tenant = (res.kind === "unresolved" ? await staticSiteTenant() : res.tenant) ?? { skinKey: "warm-clay" };
  return (
    <html lang="en" data-skin={tenant.skinKey} className={`${crimson.variable} ${inter.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-dvh bg-cream font-body text-ink antialiased">
        {children}
        <RegisterSW />
        <PwaHint />
      </body>
    </html>
  );
}
