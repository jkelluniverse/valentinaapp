"use client";

import { useState } from "react";
import type { PromptKind } from "@prisma/client";
import { PROMPT_KINDS } from "@/lib/prompt-meta";
import { PendingButton } from "@/components/PendingButton";

function SaveButton({ label }: { label: string }) {
  return (
    <PendingButton
      pendingLabel="Saving…"
      className="self-start rounded-md bg-wine px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wine-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine disabled:opacity-50"
    >
      {label}
    </PendingButton>
  );
}

export function PromptForm({
  action,
  defaults = {},
  submitLabel = "Save to library",
  error,
  clients = [],
  showAiLink = false,
}: {
  action: (formData: FormData) => Promise<void>;
  defaults?: { title?: string; body?: string; kind?: PromptKind };
  submitLabel?: string;
  error?: string | null;
  clients?: { id: string; name: string | null; email: string }[];
  showAiLink?: boolean;
}) {
  const [kind, setKind] = useState<PromptKind>(defaults.kind ?? "PROMPT");
  const [sending, setSending] = useState(false);

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

      <div className="flex flex-wrap items-center gap-3">
        {!sending && <SaveButton label={submitLabel} />}
        {clients.length > 0 &&
          (sending ? (
            <>
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
              <SaveButton label="Save & send" />
              <button
                type="button"
                onClick={() => setSending(false)}
                className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setSending(true)}
              className="rounded-md border border-mocha px-5 py-2.5 text-sm font-medium text-wine transition-colors hover:bg-blush"
            >
              Send to client…
            </button>
          ))}
        {showAiLink && !sending && (
          <a
            href="/practitioner/library/new"
            className="text-sm font-medium text-slate underline-offset-4 hover:text-wine hover:underline"
          >
            or let AI draft it for you →
          </a>
        )}
      </div>
    </form>
  );
}
