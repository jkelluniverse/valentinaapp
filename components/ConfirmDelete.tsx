"use client";

import { useState } from "react";

// Two-step inline delete: never destroys anything on a single click.
export function ConfirmDelete({
  action,
  what = "this",
}: {
  action: () => Promise<void>;
  what?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-sm font-medium text-slate underline-offset-4 hover:text-rose hover:underline"
      >
        Delete
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-sm">
      <span className="text-ink">Delete {what} for good?</span>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await action();
        }}
        className="font-medium text-rose underline-offset-4 hover:underline disabled:opacity-50"
      >
        {busy ? "Deleting…" : "Yes, delete"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={busy}
        className="text-slate underline-offset-4 hover:text-wine hover:underline disabled:opacity-50"
      >
        Keep it
      </button>
    </span>
  );
}
