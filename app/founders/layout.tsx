import type { Metadata } from "next";
import { Lora, Poppins } from "next/font/google";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { isPlatformHost, PLATFORM_NAME } from "@/lib/platform-host";

// C35-FOUNDERS-EVENT — the founding page's own shell.
//
// WHY A SCOPED LAYOUT AND NOT THE ROOT ONE (A4 + ruling 178). The brief asks
// for Lora and Poppins. The root layout loads Crimson Pro and Inter, and adding
// two more families THERE would change the bytes of every existing route —
// including her marketing root, whose 35/6 at 37295 bytes is a pinned baseline.
// Loading them in this subtree instead means /founders gets its typography and
// NOTHING ELSE MOVES. Ruling 178 holds: this file is new, and no existing
// layout or component is touched.
//
// The palette is scoped the same way — CSS variables on this wrapper, not in
// globals.css, so the founding page's indigo and gold cannot leak into the
// practitioner portal or a practice's public site.
//
// HOST GUARD LIVES HERE so it covers /founders AND /founders/apply from one
// place. A practice's own domain has no founding funnel.

const lora = Lora({ subsets: ["latin"], weight: ["400", "600"], display: "swap", variable: "--pf-font-display" });
const poppins = Poppins({ subsets: ["latin"], weight: ["400", "500", "600"], display: "swap", variable: "--pf-font-body" });

export const metadata: Metadata = {
  title: `Founding Practice · ${PLATFORM_NAME}`,
  description:
    "Join Psychefolio's first practitioner cohort. Practice-level access at the Solo price, guided onboarding, and a voice in what gets built next.",
  robots: { index: true, follow: true },
};

export default function FoundersLayout({ children }: { children: React.ReactNode }) {
  const h = headers();
  if (!isPlatformHost(h.get("x-forwarded-host") || h.get("host"))) notFound();

  return (
    <div className={`${lora.variable} ${poppins.variable} pf-root`}>
      <style>{`
        .pf-root {
          --pf-indigo: #2E2749; --pf-ink: #141A2E; --pf-gold: #D8A441;
          --pf-gold-soft: #E8B85C; --pf-sage: #7FA99B; --pf-cream: #FAF0EF;
          --pf-ivory: #F5F0E6; --pf-slate: #5A5B66; --pf-card: #FFFFFF;
          --pf-text: #2A2733; --pf-muted: #8A8597;
          font-family: var(--pf-font-body), system-ui, sans-serif;
          color: var(--pf-text); background: var(--pf-card);
        }
        .pf-root h1, .pf-root h2, .pf-root h3, .pf-root .pf-display {
          font-family: var(--pf-font-display), Georgia, serif; font-weight: 600;
        }
        .pf-root *, .pf-root *::before, .pf-root *::after { box-sizing: border-box; }
        .pf-wrap { max-width: 1280px; margin: 0 auto; padding: 0 24px; }
        .pf-eyebrow {
          font-size: .7rem; font-weight: 600; text-transform: uppercase;
          letter-spacing: .12em; line-height: 1.4;
        }
        /* Pill, gold fill, deep ink text (brief §3). 44px min target — V6. */
        .pf-cta {
          display: inline-flex; align-items: center; justify-content: center;
          min-height: 48px; padding: 0 28px; border-radius: 9999px;
          background: var(--pf-gold); color: var(--pf-ink);
          font-weight: 600; font-size: 1rem; text-decoration: none; border: 0;
          cursor: pointer; transition: background .15s ease;
        }
        .pf-cta:hover { background: var(--pf-gold-soft); }
        .pf-cta:focus-visible, .pf-root a:focus-visible, .pf-root summary:focus-visible,
        .pf-root button:focus-visible, .pf-root input:focus-visible,
        .pf-root select:focus-visible, .pf-root textarea:focus-visible {
          outline: 3px solid var(--pf-gold); outline-offset: 2px;
        }
        .pf-card {
          background: var(--pf-card); border: 1px solid rgba(46,39,73,.14);
          border-radius: 14px; box-shadow: 0 1px 2px rgba(20,26,46,.04), 0 8px 24px rgba(20,26,46,.06);
        }
        .pf-section { padding: 96px 0; }
        .pf-h2 { font-size: clamp(2rem, 4vw, 3.5rem); line-height: 1.1; margin: 0; }
        .pf-lede { font-size: 1.125rem; line-height: 1.7; }
        @media (max-width: 760px) {
          .pf-section { padding: 56px 0; }
          .pf-wrap { padding: 0 16px; }
        }
      `}</style>
      {children}
    </div>
  );
}
