"use client";

import { useState } from "react";
import { PendingButton } from "@/components/PendingButton";

export type ClientOption = { id: string; name: string | null; email: string };

function SendButton() {
  return (
    <PendingButton
      pendingLabel="Sending…"
      className="rounded-md bg-wine px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-wine-dark disabled:opacity-50"
    >
      Send
    </PendingButton>
  );
}

// "Send to client" → a dropdown of clients → Send. Used on each in-use row.
export function SendToClient({
  action,
  clients,
}: {
  action: (formData: FormData) => Promise<void>;
  clients: ClientOption[];
}) {
  const [open, setOpen] = useState(false);

  if (clients.length === 0) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-wine underline-offset-4 hover:underline"
      >
        Send to client
      </button>
    );
  }

  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <select
        name="clientId"
        autoFocus
        className="rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-wine"
      >
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name || c.email}
          </option>
        ))}
      </select>
      <SendButton />
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
      >
        Cancel
      </button>
    </form>
  );
}
