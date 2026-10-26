"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resendInvite, revokeInvite } from "./actions";
import { CopyField } from "@/components/CopyField";

export function InviteRowActions({
  inviteId,
  status,
}: {
  inviteId: string;
  status: "PENDING" | "REVOKED";
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [link, setLink] = useState<string | null>(null);

  async function onResend() {
    setBusy(true);
    setError("");
    const res = await resendInvite(inviteId);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setLink(res.link ?? null);
    router.refresh();
  }

  async function onRevoke() {
    setBusy(true);
    setError("");
    const res = await revokeInvite(inviteId);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-3 text-sm">
        <button
          type="button"
          onClick={onResend}
          disabled={busy}
          className="font-medium text-wine underline-offset-4 hover:underline disabled:opacity-50"
        >
          {status === "REVOKED" ? "Re-invite" : "Resend"}
        </button>
        {status === "PENDING" && (
          <button
            type="button"
            onClick={onRevoke}
            disabled={busy}
            className="font-medium text-slate underline-offset-4 hover:text-wine hover:underline disabled:opacity-50"
          >
            Revoke
          </button>
        )}
      </div>
      {error && <p className="text-sm text-rose">{error}</p>}
      {link && (
        <div className="w-72 max-w-full">
          <CopyField value={link} label="New link" />
        </div>
      )}
    </div>
  );
}
