"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import type { PromptKind } from "@prisma/client";
import { PROMPT_KINDS } from "@/lib/prompt-meta";

function SaveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="self-start rounded-md bg-wine px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wine-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine disabled:opacity-50"
    >
      {pending ? "Saving…" : label}
    </button>
  );
}

export function PromptForm({
  action,
  defaults = {},
  submitLabel = "Save to library",
  error,
}: {
  action: (formData: FormData) => Promise<void>;
  defaults?: { title?: string; body?: string; kind?: PromptKind };
  submitLabel?: string;
  error?: string | null;
}) {
  const [kind, setKind] = useState<PromptKind>(defaults.kind ?? "PROMPT");

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="kind" value={kind} />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-label font-semibold uppercase tracking-wide text-mocha">Kind</legend>
        <div className="flex flex-wrap gap-2">
          {PROMPT_KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => setKind(k.value)}
              aria-pressed={kind === k.value}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                kind === k.value
                  ? "bg-wine text-white"
                  : "border border-line bg-white text-ink hover:bg-blush"
              }`}
            >
              {k.label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1.5">
        <span className="text-label font-semibold uppercase tracking-wide text-mocha">Title</span>
        <input
          name="title"
          required
          defaultValue={defaults.title ?? ""}
          placeholder="A short, warm title"
          className="rounded-md border border-line bg-white px-3 py-2.5 text-base text-ink outline-none placeholder:text-slate focus:border-wine focus:ring-2 focus:ring-wine/20"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-label font-semibold uppercase tracking-wide text-mocha">Text</span>
        <textarea
          name="body"
          required
          rows={4}
          defaultValue={defaults.body ?? ""}
          placeholder="What you'd like the client to sit with…"
          className="rounded-md border border-line bg-white px-3 py-2.5 text-base leading-relaxed text-ink outline-none placeholder:text-slate focus:border-wine focus:ring-2 focus:ring-wine/20"
        />
      </label>

      {error && <p className="text-sm text-rose">{error}</p>}
      <SaveButton label={submitLabel} />
    </form>
  );
}
