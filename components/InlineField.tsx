"use client";

import { useRef, useState } from "react";

// Autosave field: saves when she leaves the field, shows a quiet "Saved".
// No save buttons, no anxiety (C6 spec §6).
export function InlineField({
  action,
  name,
  defaultValue,
  placeholder,
  textarea = false,
  rows = 8,
  label,
  className = "",
}: {
  action: (formData: FormData) => Promise<void>;
  name: string;
  defaultValue: string;
  placeholder?: string;
  textarea?: boolean;
  rows?: number;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const last = useRef(defaultValue);

  async function save(value: string) {
    if (value === last.current) return;
    setState("saving");
    const fd = new FormData();
    fd.set(name, value);
    await action(fd);
    last.current = value;
    setState("saved");
    setTimeout(() => setState("idle"), 1500);
  }

  const shared = {
    name,
    defaultValue,
    placeholder,
    onBlur: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => save(e.target.value),
  };

  return (
    <div className="flex w-full flex-col gap-1">
      {label && (
        <span className="text-label font-semibold uppercase tracking-wide text-mocha">{label}</span>
      )}
      {textarea ? (
        <textarea
          {...shared}
          rows={rows}
          className={`w-full rounded-md border border-line bg-white px-3 py-2.5 text-base leading-relaxed text-ink outline-none placeholder:text-slate focus:border-wine focus:ring-2 focus:ring-wine/20 ${className}`}
        />
      ) : (
        <input
          {...shared}
          className={`w-full rounded-md border border-line bg-white px-3 py-2 text-base text-ink outline-none placeholder:text-slate focus:border-wine focus:ring-2 focus:ring-wine/20 ${className}`}
        />
      )}
      <span className="h-4 text-xs text-slate" aria-live="polite">
        {state === "saving" ? "Saving…" : state === "saved" ? "Saved ✓" : ""}
      </span>
    </div>
  );
}
