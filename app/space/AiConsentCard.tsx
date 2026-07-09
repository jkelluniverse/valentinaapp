"use client";

import { useState } from "react";
import { setAiConsent } from "./actions";

// Client-facing privacy choice (C5 consent). Informed consent requires the
// client to know AI-assisted review exists; the practitioner's prep output
// itself is never shown here.
export function AiConsentCard({ granted }: { granted: boolean }) {
  const [busy, setBusy] = useState(false);

  if (granted) {
    return (
      <p className="text-xs text-slate">
        Valentina may use a private AI assistant to review your reflections when preparing for
        your sessions.{" "}
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await setAiConsent(false);
          }}
          className="text-wine underline underline-offset-4 hover:text-wine-dark disabled:opacity-50"
        >
          Turn this off
        </button>
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-white p-5 shadow-soft">
      <h2 className="text-lg font-semibold">A choice about your privacy</h2>
      <p className="max-w-prose text-sm leading-relaxed text-ink">
        Valentina can use a private AI assistant to review your reflections when she prepares
        for your sessions — it helps her notice patterns and arrive more present. It stays
        between her and the assistant, is never shared, and never changes what you see here.
        This is entirely your choice, and you can turn it off anytime.
      </p>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await setAiConsent(true);
        }}
        className="self-start rounded-md bg-wine px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wine-dark disabled:opacity-50"
      >
        {busy ? "Saving…" : "Allow AI-assisted preparation"}
      </button>
    </div>
  );
}
