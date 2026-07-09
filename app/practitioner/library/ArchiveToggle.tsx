"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setPromptActive } from "./actions";

export function ArchiveToggle({ promptId, active }: { promptId: string; active: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await setPromptActive(promptId, !active);
        setBusy(false);
        router.refresh();
      }}
      className="text-sm font-medium text-slate underline-offset-4 hover:text-wine hover:underline disabled:opacity-50"
    >
      {active ? "Archive" : "Restore"}
    </button>
  );
}
