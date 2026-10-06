"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setClientActive } from "./actions";

export function ClientRowActions({ userId, active }: { userId: string; active: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function toggle() {
    setBusy(true);
    setError("");
    const res = await setClientActive(userId, !active);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className="text-sm font-medium text-slate underline-offset-4 hover:text-wine hover:underline disabled:opacity-50"
      >
        {active ? "Deactivate" : "Reactivate"}
      </button>
      {error && <p className="text-sm text-rose">{error}</p>}
    </div>
  );
}
