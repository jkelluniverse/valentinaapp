"use client";

import { useEffect, useRef, useState } from "react";

// C14.2 — the Jot. Near-zero friction: a quiet "＋" expands to one warm line;
// Enter keeps it and a whisper says "kept" — the practitioner-side echo of the
// client's Settling Stone, dialed down to nothing. Press "j" to jump in.
// When `clients` is provided (the notebook), a small "about" picker lets her
// file the jot to a client as she writes it.
export function JotBox({
  action,
  placeholder = "a quick jot…",
  clients,
}: {
  action: (formData: FormData) => Promise<void>;
  placeholder?: string;
  clients?: { id: string; name: string | null; email: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [kept, setKept] = useState(false);
  const [saving, setSaving] = useState(false);
  const [about, setAbout] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement;
      const typing = el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || (el as HTMLElement)?.isContentEditable;
      if (!typing && (e.key === "j" || e.key === "J")) {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => ref.current?.focus(), 20);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function keep() {
    const value = ref.current?.value.trim() ?? "";
    if (!value || saving) return;
    setSaving(true);
    const fd = new FormData();
    fd.set("body", value);
    if (about) fd.set("clientId", about);
    await action(fd);
    if (ref.current) ref.current.value = "";
    setSaving(false);
    setKept(true);
    setTimeout(() => setKept(false), 1400);
    ref.current?.focus();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setTimeout(() => ref.current?.focus(), 20);
        }}
        className="self-start rounded-pill border border-mocha px-4 py-1.5 text-sm font-medium text-wine transition-colors hover:bg-blush"
      >
        ＋ jot
      </button>
    );
  }

  return (
    <div className="flex flex-1 flex-wrap items-center gap-3">
      <input
        ref={ref}
        type="text"
        placeholder={placeholder}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void keep();
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        onBlur={(e) => {
          // Moving to the "about" picker shouldn't fire a premature keep.
          const next = e.relatedTarget as HTMLElement | null;
          if (next?.dataset?.jotAbout != null) return;
          void keep();
        }}
        className="min-w-64 flex-1 rounded-lg border border-line bg-surface px-4 py-2.5 font-headline text-lg text-ink outline-none placeholder:text-whisper focus:border-wine"
      />
      {clients && clients.length > 0 && (
        <label className="flex items-center gap-2 text-[13px] text-whisper">
          about
          <select
            data-jot-about
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            className="rounded-md border border-line bg-surface px-2.5 py-2 text-sm text-ink outline-none focus:border-wine"
          >
            <option value="">no one yet</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || c.email}
              </option>
            ))}
          </select>
        </label>
      )}
      <span
        className={`text-[13px] text-whisper transition-opacity duration-500 ${kept ? "opacity-100" : "opacity-0"}`}
      >
        kept
      </span>
    </div>
  );
}
