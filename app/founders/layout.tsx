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
        /* THE DEFECT THAT SHIPPED, AND ITS FIX (ruling 190).
           app/globals.css:43-48 sets h1,h2,h3,h4 with color rgb(var(--c-wine))
           — Veritas wine. This rule used to set font-family ONLY and leave
           colour to inherit from the section, and INHERITANCE LOSES TO ANY
           DIRECT SELECTOR. So every heading on this page rendered wine: 1.01:1
           against the indigo hero, which is invisible, and the textual gate
           passed 19/19 on it. Colour is now stated here, not inherited. */
        .pf-root h1, .pf-root h2, .pf-root h3, .pf-root h4, .pf-root .pf-display {
          font-family: var(--pf-font-display), Georgia, serif; font-weight: 600;
          color: var(--pf-indigo);
        }
        /* On the dark fields the headings are cream. Stated on the SECTION so a
           new dark section inherits it rather than needing to remember. */
        .pf-dark h1, .pf-dark h2, .pf-dark h3, .pf-dark h4, .pf-dark .pf-display { color: var(--pf-cream); }
        .pf-dark { background: var(--pf-indigo); color: var(--pf-cream); }
        /* A CARD IS A LIGHT ISLAND INSIDE A DARK SECTION, and the rule above is
           a DESCENDANT selector, so without this it reached into the cards and
           painted "$99" cream on white: 1.12:1. The visual gate caught it on the
           first run after the heading fix — the same class of bug as the one it
           was built to catch, introduced by the fix for it. Declared here so any
           future card inherits the reset rather than needing to remember.
           Ordered after .pf-dark: equal specificity, later wins. */
        .pf-card h1, .pf-card h2, .pf-card h3, .pf-card h4, .pf-card .pf-display { color: var(--pf-indigo); }
        .pf-card, .pf-card p, .pf-card li, .pf-card span { color: var(--pf-text); }
        .pf-root *, .pf-root *::before, .pf-root *::after { box-sizing: border-box; }
        .pf-wrap { max-width: 1280px; margin: 0 auto; padding: 0 24px; }
        /* Eyebrows are 0.7rem per the brief. At 11.2px the brief's muted token
           measures 3.14-3.57:1 on the light fields and gold measures 2.26:1 on
           white — all below AA's 4.5 for normal text. The SIZE is the brief's;
           the COLOUR pairing was mine. Slate on light, gold on dark (gold on
           indigo measures 5.6:1 and passes). Both are brief tokens: this was a
           usage error, not a palette one. */
        .pf-eyebrow {
          font-size: .7rem; font-weight: 600; text-transform: uppercase;
          letter-spacing: .12em; line-height: 1.4; color: var(--pf-slate);
        }
        .pf-dark .pf-eyebrow { color: var(--pf-gold); }
        /* ORDER MATTERS AND THIS IS WHY IT LIVES HERE. These were first written
           above, before .pf-dark .pf-eyebrow — identical specificity (0,2,0), so
           the LATER rule won and a card's eyebrow rendered gold on white at
           2.26:1. Declared after the dark rules, they win. The gate caught it. */
        .pf-card .pf-eyebrow { color: var(--pf-slate); }
        .pf-card .pf-fine { color: var(--pf-slate); }
        /* Small print on light fields: slate, never muted. */
        .pf-fine { font-size: .85rem; color: var(--pf-slate); line-height: 1.6; }
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
