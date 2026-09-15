"use client";

import { useState } from "react";

// Read-only field showing a value with a one-click Copy button. Used for the
// one-time invite link so the practitioner can paste it wherever she likes.
export function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // Clipboard API can be blocked; the field is still selectable to copy manually.
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col gap-1.5">
      {label && <span className="text-label font-semibold uppercase tracking-wide text-mocha">{label}</span>}
      <div className="flex items-stretch gap-2">
        <input
          readOnly
          value={value}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-wine focus:ring-2 focus:ring-wine/20"
        />
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-md border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
