"use client";

import { useState } from "react";
import { MOODS } from "@/lib/entry-meta";
import { PendingButton } from "@/components/PendingButton";

export function RespondForm({
  action,
  dismissAction,
  isCheckIn,
  error,
}: {
  action: (formData: FormData) => Promise<void>;
  dismissAction: () => Promise<void>;
  isCheckIn: boolean;
  error?: string | null;
}) {
  const [mood, setMood] = useState<number | null>(null);
  const [dismissing, setDismissing] = useState(false);

  const chipBase =
    "rounded-full text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine";

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="mood" value={mood ?? ""} />

      {isCheckIn && (
        <fieldset className="flex flex-col gap-2">
          <legend className="text-label font-semibold uppercase tracking-wide text-mocha">
            How are you arriving?
          </legend>
          <div className="flex flex-wrap items-center gap-2">
            {MOODS.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setMood(mood === n ? null : n)}
                aria-pressed={mood === n}
                className={`${chipBase} h-11 w-11 p-0 ${
                  mood !== null && n <= mood
                    ? "bg-mocha text-white"
                    : "border border-line bg-white text-ink hover:bg-blush"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <label className="flex flex-col gap-1.5">
        <span className="text-label font-semibold uppercase tracking-wide text-mocha">
          Your response{isCheckIn ? " (optional)" : ""}
        </span>
        <textarea
          name="body"
          autoFocus={!isCheckIn}
          rows={6}
          placeholder="Take your time — there's no wrong answer."
          className="w-full rounded-lg border border-line bg-white p-4 text-base leading-relaxed text-ink shadow-soft outline-none placeholder:text-slate focus:border-wine focus:ring-2 focus:ring-wine/20"
        />
      </label>

      {error && <p className="text-sm text-rose">{error}</p>}

      <div className="flex items-center gap-4">
        <PendingButton
          pendingLabel="Saving…"
          className="rounded-md bg-wine px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-wine-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine disabled:opacity-50"
        >
          Save response
        </PendingButton>
        <button
          type="button"
          disabled={dismissing}
          onClick={async () => {
            setDismissing(true);
            await dismissAction();
          }}
          className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline disabled:opacity-50"
        >
          {dismissing ? "Setting aside…" : "Set aside for now"}
        </button>
      </div>
    </form>
  );
}
