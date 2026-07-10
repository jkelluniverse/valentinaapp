import type { Config } from "tailwindcss";

// Colors are var-backed so the client portal can shift into Dusk (dark) while
// the practitioner portal stays light (see app/globals.css). Existing brand
// names (wine, mocha, …) are preserved; Warm Stone semantic aliases (canvas,
// surface, primary, …) are added for the client core screens.
const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        wine: {
          DEFAULT: "rgb(var(--c-wine) / <alpha-value>)",
          dark: "rgb(var(--c-wine-dark) / <alpha-value>)",
        },
        mocha: "rgb(var(--c-mocha) / <alpha-value>)",
        cream: "rgb(var(--c-cream) / <alpha-value>)",
        blush: {
          DEFAULT: "rgb(var(--c-blush) / <alpha-value>)",
          deep: "rgb(var(--c-blush-deep) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--c-ink) / <alpha-value>)",
          strong: "rgb(var(--c-ink-strong) / <alpha-value>)",
        },
        slate: "rgb(var(--c-slate) / <alpha-value>)",
        line: "rgb(var(--c-line) / <alpha-value>)",
        rose: "rgb(var(--c-rose) / <alpha-value>)",
        // Warm Stone semantic aliases (client core screens)
        canvas: "rgb(var(--c-canvas) / <alpha-value>)",
        surface: {
          DEFAULT: "rgb(var(--c-surface) / <alpha-value>)",
          2: "rgb(var(--c-surface-2) / <alpha-value>)",
        },
        primary: {
          DEFAULT: "rgb(var(--c-wine) / <alpha-value>)",
          press: "rgb(var(--c-wine-dark) / <alpha-value>)",
        },
        accent: "rgb(var(--c-mocha) / <alpha-value>)",
        whisper: "rgb(var(--c-whisper) / <alpha-value>)",
        hairline: "rgb(var(--c-line) / <alpha-value>)",
        "on-primary": "rgb(var(--c-on-primary) / <alpha-value>)",
      },
      fontFamily: {
        headline: ["var(--font-headline)", "Crimson Pro", "Georgia", "serif"],
        body: ["var(--font-body)", "Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        sm: "8px",
        md: "12px",
        lg: "16px",
        card: "24px",
        pill: "9999px",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(88,12,34,0.04), 0 8px 24px rgba(88,12,34,0.06)",
        card: "0 1px 3px rgba(0,0,0,0.06), 0 12px 32px rgba(88,12,34,0.05)",
        stone: "0 2px 6px rgba(88,12,34,0.18), 0 8px 20px rgba(88,12,34,0.12)",
      },
      fontSize: {
        label: ["0.8125rem", { lineHeight: "1rem", letterSpacing: "0.02em" }],
        eyebrow: ["0.75rem", { lineHeight: "1rem", letterSpacing: "0.08em" }],
      },
      backgroundImage: {
        // The intensity band: mocha (barely) → wine (fully).
        intensity: "linear-gradient(90deg, rgb(var(--c-mocha)), rgb(var(--c-wine)))",
      },
    },
  },
  plugins: [],
};

export default config;
