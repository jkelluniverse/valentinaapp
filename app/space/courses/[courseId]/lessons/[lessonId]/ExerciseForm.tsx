"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { MOODS } from "@/lib/entry-meta";

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-wine px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-wine-dark disabled:opacity-50"
    >
      {pending ? "Saving…" : "Save response"}
    </button>
  );
}

export function ExerciseForm({
  action,
  isCheckIn,
  error,
}: {
  action: (formData: FormData) => Promise<void>;
  isCheckIn: boolean;
  error?: string | null;
}) {
  const [mood, setMood] = useState<number | null>(null);

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="mood" value={mood ?? ""} />
      {isCheckIn && (
        <div className="flex flex-wrap items-center gap-2">
          {MOODS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setMood(mood === n ? null : n)}
              aria-pressed={mood === n}
              className={`h-11 w-11 rounded-full text-sm font-medium transition-colors ${
                mood !== null && n <= mood
                  ? "bg-mocha text-white"
                  : "border border-line bg-white text-ink hover:bg-blush"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      )}
      <textarea
        name="body"
        rows={5}
        placeholder="Take your time — there's no wrong answer."
        className="w-full rounded-lg border border-line bg-white p-4 text-base leading-relaxed text-ink shadow-soft outline-none placeholder:text-slate focus:border-wine focus:ring-2 focus:ring-wine/20"
      />
      {error && <p className="text-sm text-rose">{error}</p>}
      <SaveButton />
    </form>
  );
}
