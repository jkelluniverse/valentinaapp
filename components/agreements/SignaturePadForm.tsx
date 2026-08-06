"use client";

import { useState } from "react";
import { DrawPad } from "./SignFlow";

// C21 — the practitioner draws her signature ONCE; it's stored and applied
// automatically (with the auto-set date) whenever she signs or countersigns.

export function SignaturePadForm({
  current,
  onSave,
}: {
  current: string | null;
  onSave: (formData: FormData) => Promise<void>;
}) {
  const [drawn, setDrawn] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      {current && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[12px] text-whisper">Stored signature (applied automatically when you sign):</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={current} alt="Stored signature" className="h-16 w-auto max-w-[280px] rounded-md border border-line bg-white object-contain p-1" />
        </div>
      )}
      <form
        action={async (fd) => {
          setPending(true);
          if (drawn) fd.set("drawn", drawn);
          await onSave(fd);
          setPending(false);
        }}
        className="flex flex-col gap-2"
      >
        <span className="text-[12px] text-whisper">{current ? "Draw again to replace it:" : "Draw your signature:"}</span>
        <DrawPad onChange={setDrawn} clearLabel="Clear" />
        <div className="flex items-center gap-3">
          <button
            disabled={pending || !drawn}
            className="self-start rounded-lg bg-wine px-5 py-2 text-sm font-medium text-white shadow-soft transition-colors hover:bg-wine-dark disabled:opacity-50"
          >
            Save signature
          </button>
          {current && (
            <button name="remove" value="1" disabled={pending} className="text-[12px] text-whisper underline-offset-4 hover:text-wine hover:underline">
              Remove stored signature
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
