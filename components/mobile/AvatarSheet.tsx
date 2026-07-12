"use client";

import { useEffect, useState } from "react";
import { Sheet } from "./Sheet";

// AMENDMENT-02 §2 — the avatar is the only thing on the right of the mobile top
// bar. Tapping it opens a small sheet with the person's name, the theme choice,
// and sign out — the two controls that used to float in the bar and collide.
type Mode = "light" | "dark";

export function AvatarSheet({
  initial,
  name,
  email,
  signOutAction,
}: {
  initial: string;
  name: string | null;
  email: string;
  signOutAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("veritas-theme");
    if (stored === "light" || stored === "dark") setMode(stored);
    else setMode(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  }, []);

  function setTheme(next: Mode) {
    setMode(next);
    try {
      localStorage.setItem("veritas-theme", next);
    } catch {
      /* private mode */
    }
    document.documentElement.setAttribute("data-theme", next);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Your account"
        className="flex h-9 w-9 items-center justify-center rounded-pill bg-blush text-sm font-semibold text-wine ring-1 ring-line transition-colors hover:bg-blush-deep"
      >
        {initial}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)}>
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-pill bg-blush text-base font-semibold text-wine ring-1 ring-line">
              {initial}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-[15px] font-medium text-ink-strong">{name || email}</span>
              {name && <span className="truncate text-[13px] text-whisper">{email}</span>}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-eyebrow font-semibold uppercase tracking-wide text-mocha">Appearance</p>
            <div className="flex gap-2">
              <ThemeChip label="Daylight" glyph="☀" active={mode === "light"} onClick={() => setTheme("light")} />
              <ThemeChip label="Dusk" glyph="☾" active={mode === "dark"} onClick={() => setTheme("dark")} />
            </div>
          </div>

          <form action={signOutAction} className="border-t border-line pt-4">
            <button className="min-h-[44px] w-full rounded-lg border border-line text-sm font-medium text-ink transition-colors hover:border-wine hover:text-wine">
              Sign out
            </button>
          </form>
        </div>
      </Sheet>
    </>
  );
}

function ThemeChip({
  label,
  glyph,
  active,
  onClick,
}: {
  label: string;
  glyph: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg border text-sm font-medium transition-colors ${
        active ? "border-wine bg-blush text-wine" : "border-line text-ink hover:border-mocha"
      }`}
    >
      <span aria-hidden className="text-base leading-none">
        {glyph}
      </span>
      {label}
    </button>
  );
}
