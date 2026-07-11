"use client";

import { useEffect, useRef, useState } from "react";

// C14.2 — the Jot. Near-zero friction: a quiet "＋" expands to one warm line;
// Enter keeps it and a whisper says "kept" — the practitioner-side echo of the
// client's Settling Stone, dialed down to nothing. Press "j" to jump in.
export function JotBox({
  action,
  placeholder = "a quick jot…",
}: {
  action: (formData: FormData) => Promise<void>;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [kept, setKept] = useState(false);
  const [saving, setSaving] = useState(false);
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
    <div className="flex items-center gap-3">
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
        onBlur={() => void keep()}
        className="flex-1 rounded-lg border border-line bg-surface px-4 py-2.5 font-headline text-lg text-ink outline-none placeholder:text-whisper focus:border-wine"
      />
      <span
        className={`text-[13px] text-whisper transition-opacity duration-500 ${kept ? "opacity-100" : "opacity-0"}`}
      >
        kept
      </span>
    </div>
  );
}
