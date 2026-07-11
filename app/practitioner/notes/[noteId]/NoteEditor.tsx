"use client";

import { useRef, useState } from "react";

// The note writing surface — Crimson Pro, autosaved on blur. Title, body, and
// tags each save independently; a quiet "saved" confirms without a button.
export function NoteEditor({
  action,
  title,
  body,
  tags,
}: {
  action: (formData: FormData) => Promise<void>;
  title: string;
  body: string;
  tags: string;
}) {
  const [state, setState] = useState<"idle" | "saved">("idle");
  const last = useRef({ title, body, tags });

  async function save(field: "title" | "body" | "tags", value: string) {
    if (value === last.current[field]) return;
    const fd = new FormData();
    fd.set(field, value);
    await action(fd);
    last.current[field] = value;
    setState("saved");
    setTimeout(() => setState("idle"), 1400);
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        type="text"
        defaultValue={title}
        placeholder="Title (optional)"
        onBlur={(e) => save("title", e.target.value)}
        className="w-full border-0 bg-transparent font-headline text-2xl font-medium text-ink-strong outline-none placeholder:text-whisper"
      />
      <textarea
        defaultValue={body}
        rows={12}
        placeholder="Think it through…"
        onBlur={(e) => save("body", e.target.value)}
        className="w-full resize-none border-0 bg-transparent font-headline text-lg leading-relaxed text-ink outline-none placeholder:text-whisper"
      />
      <label className="flex flex-col gap-1.5">
        <span className="text-eyebrow font-semibold uppercase text-mocha">Theme tags</span>
        <input
          type="text"
          defaultValue={tags}
          placeholder="self-worth, boundaries (comma-separated)"
          onBlur={(e) => save("tags", e.target.value)}
          className="rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-wine"
        />
      </label>
      <span
        className={`text-[13px] text-whisper transition-opacity duration-500 ${state === "saved" ? "opacity-100" : "opacity-0"}`}
      >
        saved
      </span>
    </div>
  );
}
