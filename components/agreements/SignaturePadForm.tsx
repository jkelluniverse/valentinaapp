"use client";

import { useState } from "react";
import { DrawPad } from "./SignFlow";

// C21 — the practitioner's stored signature: drawn once OR uploaded once
// (a photo/scan of her real signature), then applied automatically — with
// the auto-set date — whenever she signs or countersigns. Uploads are
// normalized in the browser: any image draws onto a canvas and exports as
// a bounded PNG, so the sealed-PDF embedder always gets bytes it can use.

export function SignaturePadForm({
  current,
  onSave,
}: {
  current: string | null;
  onSave: (formData: FormData) => Promise<void>;
}) {
  const [drawn, setDrawn] = useState<string | null>(null);
  const [uploadName, setUploadName] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 700 / img.width, 260 / img.height);
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.width * scale));
      c.height = Math.max(1, Math.round(img.height * scale));
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      setDrawn(c.toDataURL("image/png"));
      setUploadName(file.name);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      setUploadName(null);
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }

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
        className="flex flex-col gap-2.5"
      >
        <span className="text-[12px] text-whisper">{current ? "Draw again to replace it:" : "Draw your signature:"}</span>
        <DrawPad onChange={(d) => { setDrawn(d); setUploadName(null); }} clearLabel="Clear" />
        <label className="flex flex-wrap items-center gap-2 text-[13px] text-slate">
          …or upload a photo / scan of your signature:
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFile} className="text-[13px]" />
        </label>
        {uploadName && drawn && (
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] text-whisper">Ready to save from {uploadName}:</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={drawn} alt="Uploaded signature preview" className="h-16 w-auto max-w-[280px] rounded-md border border-line bg-white object-contain p-1" />
          </div>
        )}
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
