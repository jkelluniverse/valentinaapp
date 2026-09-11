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

export const metadata: Metadata = {
  title: "Veritas",
  description: "A private space for reflection and progress between sessions.",
  manifest: "/manifest.webmanifest",
  applicationName: "Veritas",
  appleWebApp: {
    capable: true,
    title: "Veritas",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/apple-touch-icon.png",
  },
};

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
  const { getTenant } = await import("@/lib/tenancy");
  const tenant = await getTenant();
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
