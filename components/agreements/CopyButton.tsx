"use client";

import { useState } from "react";

// C22 — one-tap copy for the sign link.
export function CopyButton({ value, label = "Copy link", copied = "Copied ✓" }: { value: string; label?: string; copied?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 2500);
        } catch {
          // clipboard blocked — the input beside this stays selectable
        }
      }}
      className={`shrink-0 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        done ? "border border-wine bg-blush/40 text-wine" : "bg-wine text-white hover:bg-wine-dark"
      }`}
    >
      {done ? copied : label}
    </button>
  );
}
