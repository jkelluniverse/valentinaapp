"use client";

import { useState } from "react";
import type { EntryType } from "@prisma/client";
import { ENTRY_TYPES, MOODS } from "@/lib/entry-meta";
import { PendingButton } from "@/components/PendingButton";

// Low-friction capture (spec §4): the textarea is the entry; everything else
// is optional one-tap extras. Shared by /space/new and the edit screen.

type EntryDefaults = {
  body?: string;
  type?: EntryType;
  mood?: number | null;
  trigger?: string | null;
  tags?: string[];
  occurredAt?: Date | null;
};

function toLocalInputValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function EntryForm({
  action,
  defaults = {},
  submitLabel = "Save entry",
  error,
}: {
  action: (formData: FormData) => Promise<void>;
  defaults?: EntryDefaults;
  submitLabel?: string;
  error?: string | null;
}) {
  const [type, setType] = useState<EntryType>(defaults.type ?? "REFLECTION");
  const [mood, setMood] = useState<number | null>(defaults.mood ?? null);
  const [showWhen, setShowWhen] = useState(Boolean(defaults.occurredAt));

  const chipBase =
    "rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine";

  return (
    <form action={action} className="flex flex-col gap-6">
      <input type="hidden" name="type" value={type} />
      <input type="hidden" name="mood" value={mood ?? ""} />

      <textarea
        name="body"
        autoFocus
        required
        rows={6}
        defaultValue={defaults.body ?? ""}
        placeholder="What are you noticing?"
        className="w-full rounded-lg border border-line bg-white p-4 text-base leading-relaxed text-ink shadow-soft outline-none placeholder:text-slate focus:border-wine focus:ring-2 focus:ring-wine/20"
      />
      {error && <p className="-mt-3 text-sm text-rose">{error}</p>}

      <fieldset className="flex flex-col gap-2">
        <legend className="text-label font-semibold uppercase tracking-wide text-mocha">
          What kind of moment?
        </legend>
        <div className="flex flex-wrap gap-2">
          {ENTRY_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              aria-pressed={type === t.value}
              className={`${chipBase} ${
                type === t.value
                  ? "bg-wine text-white"
                  : "border border-line bg-white text-ink hover:bg-blush"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-label font-semibold uppercase tracking-wide text-mocha">
          How intense did it feel? <span className="normal-case tracking-normal text-slate">(optional)</span>
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
          {mood !== null && (
            <button
              type="button"
              onClick={() => setMood(null)}
              className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
            >
              Clear
            </button>
          )}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1.5">
        <span className="text-label font-semibold uppercase tracking-wide text-mocha">
          What prompted this? <span className="normal-case tracking-normal text-slate">(optional)</span>
        </span>
        <input
          name="trigger"
          defaultValue={defaults.trigger ?? ""}
          placeholder="A conversation, a thought, a place…"
          className="rounded-md border border-line bg-white px-3 py-2.5 text-base text-ink outline-none placeholder:text-slate focus:border-wine focus:ring-2 focus:ring-wine/20"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-label font-semibold uppercase tracking-wide text-mocha">
          Tags <span className="normal-case tracking-normal text-slate">(optional, comma-separated)</span>
        </span>
        <input
          name="tags"
          defaultValue={(defaults.tags ?? []).join(", ")}
          placeholder="work, family, sleep"
          className="rounded-md border border-line bg-white px-3 py-2.5 text-base text-ink outline-none placeholder:text-slate focus:border-wine focus:ring-2 focus:ring-wine/20"
        />
      </label>

      <div className="flex flex-col gap-1.5">
        {showWhen ? (
          <label className="flex flex-col gap-1.5">
            <span className="text-label font-semibold uppercase tracking-wide text-mocha">When</span>
            <input
              type="datetime-local"
              name="occurredAt"
              defaultValue={defaults.occurredAt ? toLocalInputValue(defaults.occurredAt) : toLocalInputValue(new Date())}
              className="rounded-md border border-line bg-white px-3 py-2.5 text-base text-ink outline-none focus:border-wine focus:ring-2 focus:ring-wine/20"
            />
          </label>
        ) : (
          <button
            type="button"
            onClick={() => setShowWhen(true)}
            className="self-start text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
          >
            Happened earlier? Set the time
          </button>
        )}
      </div>

      <div className="flex items-center gap-4">
        <PendingButton
          pendingLabel="Saving…"
          className="rounded-md bg-wine px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-wine-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine disabled:opacity-50"
        >
          {submitLabel}
        </PendingButton>
      </div>
    </form>
  );
}
