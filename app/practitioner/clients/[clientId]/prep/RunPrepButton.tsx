"use client";

import { useState } from "react";
import { runPrep } from "./actions";

export function RunPrepButton({ clientId, disabled }: { clientId: string; disabled?: boolean }) {
  const [running, setRunning] = useState(false);

  return (
    <button
      type="button"
      disabled={disabled || running}
      onClick={async () => {
        setRunning(true);
        await runPrep(clientId);
      }}
      className="rounded-md bg-wine px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-wine-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine disabled:opacity-50"
    >
      {running ? "Preparing… (this can take a minute)" : "Prepare for session"}
    </button>
  );
}
