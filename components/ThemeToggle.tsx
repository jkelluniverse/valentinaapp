"use client";

import { useEffect, useState } from "react";

// The Dusk toggle — always visible, top-right of both portals. Writes an
// explicit choice to <html data-theme> (honored by globals.css over the system
// preference) and persists it. First paint is handled by the inline script in
// the root layout, so there's no flash before this hydrates.
type Mode = "light" | "dark";

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("veritas-theme");
    if (stored === "light" || stored === "dark") {
      setMode(stored);
    } else {
      setMode(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    }
  }, []);

  function apply(next: Mode) {
    setMode(next);
    try {
      localStorage.setItem("veritas-theme", next);
    } catch {
      /* private mode — the choice just won't persist */
    }
    document.documentElement.setAttribute("data-theme", next);
  }

  const isDark = mode === "dark";
  const next: Mode = isDark ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => apply(next)}
      aria-label={`Switch to ${next === "dark" ? "Dusk" : "daylight"}`}
      title={isDark ? "Dusk — tap for daylight" : "Daylight — tap for Dusk"}
      className="flex h-9 w-9 items-center justify-center rounded-pill text-whisper ring-1 ring-line transition-colors hover:text-wine"
    >
      {/* Show the current mode; a sun by day, a moon at dusk. */}
      <span aria-hidden className="text-base leading-none">
        {mode === null ? "" : isDark ? "☾" : "☀"}
      </span>
    </button>
  );
}
