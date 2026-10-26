"use client";

import { useRef, useState } from "react";

// The note writing surface — Crimson Pro in clearly-boxed white fields, all
// autosaved (title/body on blur, tags on every toggle). Tags are chips: tap an
// existing theme to add or remove it, or type a new one.
export function NoteEditor({
  action,
  title,
  body,
  tags,
  tagSuggestions,
}: {
  action: (formData: FormData) => Promise<void>;
  title: string;
  body: string;
  tags: string[];
  tagSuggestions: string[];
}) {
  const [state, setState] = useState<"idle" | "saved">("idle");
  const [selected, setSelected] = useState<string[]>(tags);
  const [newTag, setNewTag] = useState("");
  const last = useRef({ title, body, tags: tags.join(",") });

  async function save(field: "title" | "body" | "tags", value: string) {
    if (value === last.current[field]) return;
    const fd = new FormData();
    fd.set(field, value);
    await action(fd);
    last.current[field] = value;
    setState("saved");
    setTimeout(() => setState("idle"), 1400);
  }

  function saveTags(next: string[]) {
    setSelected(next);
    void save("tags", next.join(", "));
  }

  function toggleTag(t: string) {
    saveTags(selected.includes(t) ? selected.filter((x) => x !== t) : [...selected, t]);
  }

  function addNewTag() {
    const t = newTag.trim().toLowerCase();
    if (!t) return;
    setNewTag("");
    if (!selected.includes(t)) saveTags([...selected, t]);
  }

  // Every theme she's used anywhere, plus this note's own tags, as one chip row.
  const vocabulary = [...new Set([...selected, ...tagSuggestions])];

  return (
    <div className="flex flex-col gap-4">
      <input
        type="text"
        defaultValue={title}
        placeholder="Title (optional)"
        onBlur={(e) => save("title", e.target.value)}
        className="w-full rounded-lg border border-line bg-surface px-4 py-3 font-headline text-2xl font-medium text-ink-strong shadow-soft outline-none placeholder:text-whisper focus:border-wine"
      />
      <textarea
        defaultValue={body}
        rows={12}
        placeholder="Think it through…"
        onBlur={(e) => save("body", e.target.value)}
        className="w-full resize-y rounded-card border border-line bg-surface px-5 py-4 font-headline text-lg leading-relaxed text-ink shadow-soft outline-none placeholder:text-whisper focus:border-wine"
      />

      <div className="flex flex-col gap-2">
        <span className="text-eyebrow font-semibold uppercase text-mocha">Theme tags</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {vocabulary.map((t) => {
            const on = selected.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleTag(t)}
                aria-pressed={on}
                className={`rounded-pill px-3 py-1 text-xs font-medium transition-colors ${
                  on
                    ? "bg-wine text-white"
                    : "border border-line bg-surface text-ink hover:bg-blush"
                }`}
              >
                {on ? "✓ " : ""}
                {t}
              </button>
            );
          })}
          <input
            type="text"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addNewTag();
              }
            }}
            onBlur={addNewTag}
            placeholder="+ new tag"
            className="w-32 rounded-pill border border-line bg-surface px-3 py-1 text-xs text-ink outline-none placeholder:text-whisper focus:border-wine"
          />
        </div>
      </div>

      <span
        className={`text-[13px] text-whisper transition-opacity duration-500 ${state === "saved" ? "opacity-100" : "opacity-0"}`}
      >
        saved
      </span>
    </div>
  );
}
