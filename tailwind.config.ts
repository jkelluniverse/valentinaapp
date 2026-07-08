import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        wine: { DEFAULT: "#580C22", dark: "#570321" },
        mocha: "#B79175",
        cream: "#FEF4EA",
        blush: { DEFAULT: "#FFF4F8", deep: "#FFE8F0" },
        ink: { DEFAULT: "#4D4B49", strong: "#161616" },
        slate: "#797A8C",
        line: "#EAEAEA",
        rose: "#DC506E",
      },
      fontFamily: {
        headline: ["var(--font-headline)", "Crimson Pro", "Georgia", "serif"],
        body: ["var(--font-body)", "Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        sm: "8px",
        md: "12px",
        lg: "16px",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(88,12,34,0.04), 0 8px 24px rgba(88,12,34,0.06)",
        card: "0 1px 3px rgba(0,0,0,0.06), 0 12px 32px rgba(88,12,34,0.05)",
      },
      fontSize: {
        label: ["0.8125rem", { lineHeight: "1rem", letterSpacing: "0.02em" }],
      },
    },
  },
  plugins: [],
};

export default config;
