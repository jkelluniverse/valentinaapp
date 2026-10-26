"use client";

import { useState } from "react";
import { Sheet } from "@/components/mobile/Sheet";
import { PendingButton } from "@/components/PendingButton";
import { saveAwayNote } from "./actions";

// AMENDMENT-04 §2a — "Your response rhythm" is a setting, not a conversation:
// it lives behind the inbox's quiet ⋯, in a sheet.
export function InboxSettings({ awayNote }: { awayNote: string | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Message settings"
        className="rounded-pill px-2.5 py-1 text-lg leading-none text-mocha hover:bg-blush"
      >
        ⋯
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Your response rhythm">
        <div className="flex flex-col gap-3">
          <p className="text-[13px] leading-relaxed text-slate">
            Clients see &ldquo;Valentina usually replies within a day&rdquo; by default. Set an
            away note when you&apos;re resting or away, so <em>supported</em> never curdles into{" "}
            <em>abandoned</em>.
          </p>
          <form action={saveAwayNote} className="flex flex-col gap-2">
            <input
              type="text"
              name="awayNote"
              defaultValue={awayNote ?? ""}
              placeholder="e.g. Away until Monday — I'll reply when I'm back."
              className="rounded-md border border-line bg-white px-3 py-2 text-ink outline-none focus:border-wine"
            />
            <PendingButton className="min-h-[44px] self-start rounded-lg bg-wine px-5 text-sm font-medium text-white transition-colors hover:bg-wine-dark">
              Save
            </PendingButton>
          </form>
          {awayNote && (
            <p className="text-[12px] text-whisper">Clear the field and save to take the note down.</p>
          )}
        </div>
      </Sheet>
    </>
  );
}
