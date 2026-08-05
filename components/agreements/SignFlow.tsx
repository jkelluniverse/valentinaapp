"use client";

import { useRef, useState } from "react";

// C20 §3 — the flow that makes it binding, one calm page:
// 1. the full document (scrollable, exactly the snapshot text)
// 2. the electronic-records disclosure (plain paragraph)
// 3. typed full legal name (attribution) + optional drawn mark (warmth)
// 4. ONE unambiguous wine button: "I agree and sign" — no dark patterns.

export type SignFlowItem = { id: string; text: string; kind: "initials" | "checkbox"; required: boolean };

export function SignFlow({
  title,
  body,
  disclosure,
  locale,
  items = [],
  onSign,
  onDecline,
}: {
  title: string;
  body: string;
  disclosure: string;
  locale: "en" | "es";
  items?: SignFlowItem[]; // v3.1 — per-item acknowledgments (initials/checkboxes)
  onSign: (formData: FormData) => Promise<void>;
  onDecline: () => Promise<void>;
}) {
  const [drawn, setDrawn] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const t =
    locale === "es"
      ? { read: "Léelo con calma", name: "Tu nombre legal completo", draw: "Firma dibujada (opcional)", clear: "Borrar", sign: "Acepto y firmo", decline: "Prefiero no firmar", acks: "Reconocimientos requeridos (inicial cada uno)", initials: "Iniciales" }
      : { read: "Read it in your own time", name: "Your full legal name", draw: "Drawn signature (optional)", clear: "Clear", sign: "I agree and sign", decline: "I'd rather not sign", acks: "Required acknowledgments (initial each)", initials: "Initials" };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-headline text-[1.6rem] font-medium text-ink-strong">{title}</h1>
        <p className="text-[13px] text-whisper">{t.read}</p>
      </div>
      <div className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-card border border-line bg-white p-5 text-[14.5px] leading-relaxed text-ink shadow-soft">
        {body}
      </div>
      <div className="rounded-card border border-line bg-surface p-4 text-[13px] leading-relaxed text-slate">{disclosure}</div>

      <form
        action={async (fd) => {
          setPending(true);
          if (drawn) fd.set("drawn", drawn);
          await onSign(fd);
          setPending(false);
        }}
        className="flex flex-col gap-4"
      >
        {items.length > 0 && (
          <div className="flex flex-col gap-3">
            <span className="text-[13px] font-semibold uppercase tracking-wide text-mocha">{t.acks}</span>
            {items.map((item) =>
              item.kind === "checkbox" ? (
                <label key={item.id} className="flex items-start gap-3 rounded-card border border-line bg-white p-3.5 text-[13.5px] leading-relaxed text-ink">
                  <input
                    type="checkbox"
                    name={`ack:${item.id}`}
                    value="checked"
                    required={item.required}
                    className="mt-0.5 h-4 w-4 rounded border-line text-wine focus:ring-wine/20"
                  />
                  <span>{item.text}</span>
                </label>
              ) : (
                <label key={item.id} className="flex items-start gap-3 rounded-card border border-line bg-white p-3.5 text-[13.5px] leading-relaxed text-ink">
                  <input
                    name={`ack:${item.id}`}
                    required={item.required}
                    minLength={2}
                    maxLength={5}
                    placeholder={t.initials}
                    className="w-16 shrink-0 rounded-md border border-line px-2 py-1 text-center text-sm uppercase tracking-widest outline-none focus:border-wine focus:ring-2 focus:ring-wine/20"
                  />
                  <span>{item.text}</span>
                </label>
              )
            )}
          </div>
        )}

        <label className="flex flex-col gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-mocha">
          {t.name}
          <input
            name="signerName"
            required
            minLength={3}
            className="rounded-md border border-line bg-white px-3 py-2.5 text-base font-normal normal-case tracking-normal text-ink outline-none focus:border-wine focus:ring-2 focus:ring-wine/20"
          />
        </label>
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-semibold uppercase tracking-wide text-mocha">{t.draw}</span>
          <DrawPad onChange={setDrawn} clearLabel={t.clear} />
        </div>
        <button
          disabled={pending}
          className="self-start rounded-lg bg-wine px-7 py-3 text-base font-medium text-white shadow-soft transition-colors hover:bg-wine-dark disabled:opacity-60"
        >
          {t.sign}
        </button>
      </form>

      <form action={onDecline}>
        <button className="text-[13px] text-whisper underline-offset-4 hover:text-wine hover:underline">{t.decline}</button>
      </form>
    </div>
  );
}

function DrawPad({ onChange, clearLabel }: { onChange: (dataUrl: string | null) => void; clearLabel: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  const pos = (e: React.PointerEvent) => {
    const rect = ref.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };
  const start = (e: React.PointerEvent) => {
    drawing.current = true;
    const ctx = ref.current!.getContext("2d")!;
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = ref.current!.getContext("2d")!;
    ctx.strokeStyle = "#581122";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    dirty.current = true;
  };
  const end = () => {
    drawing.current = false;
    if (dirty.current && ref.current) onChange(ref.current.toDataURL("image/png"));
  };
  const clear = () => {
    const c = ref.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    dirty.current = false;
    onChange(null);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <canvas
        ref={ref}
        width={420}
        height={120}
        className="w-full max-w-[420px] touch-none rounded-md border border-line bg-white"
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
      />
      <button type="button" onClick={clear} className="self-start text-[12px] text-whisper underline-offset-4 hover:text-wine hover:underline">
        {clearLabel}
      </button>
    </div>
  );
}
