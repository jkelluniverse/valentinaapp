"use client";

import { useState } from "react";
import { inviteLeadAsClient } from "./actions";

// C18 §5 — the one-tap conversion. Reveals the copyable invite link inline
// (mirrors the InviteClientForm pattern) so she can send it however she likes.
export function LeadActions({ leadId, converted }: { leadId: string; converted: boolean }) {
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  if (converted) {
    return <span className="text-xs font-medium text-mocha">Client</span>;
  }

  async function invite() {
    setBusy(true);
    setErr(null);
    const res = await inviteLeadAsClient(leadId);
    setBusy(false);
    if (res.ok) setLink(res.link ?? null);
    else setErr(res.error);
  }

  if (link) {
    return (
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={link}
          className="w-40 rounded-md border border-line bg-white px-2 py-1 text-xs text-ink sm:w-56"
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="rounded-pill bg-wine px-3 py-1 text-xs font-medium text-white hover:bg-wine-dark"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={invite}
        disabled={busy}
        className="rounded-pill border border-wine/40 px-3 py-1 text-xs font-medium text-wine transition-colors hover:bg-wine hover:text-white disabled:opacity-50"
      >
        {busy ? "…" : "Invite as client"}
      </button>
      {err && <span className="text-xs text-rose">{err}</span>}
    </div>
  );
}
