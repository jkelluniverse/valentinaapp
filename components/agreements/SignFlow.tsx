"use client";

import { useEffect, useRef, useState } from "react";

// C20 §3 — the flow that makes it binding, one calm page:
// 1. the full document (scrollable, exactly the snapshot text)
// 2. the electronic-records disclosure (plain paragraph)
// 3. typed full legal name (attribution) + optional drawn mark (warmth)
// 4. ONE unambiguous wine button: "I agree and sign" — no dark patterns.

export type SignFlowItem = { id: string; text: string; kind: "initials" | "checkbox" | "text"; required: boolean; multiline?: boolean };

// Split the document body on {{fill:<id>}} markers so fillable fields
// render INLINE at their spot in the text. Inputs live visually inside the
// scrollable document but submit with the sign form via the form attribute.
function renderBodyWithFields(body: string, fields: Map<string, SignFlowItem>, formId: string, placeholder: string) {
  const parts = body.split(/(\{\{fill:[a-z0-9_-]+\}\})/gi);
  return parts.map((part, i) => {
    const m = /^\{\{fill:([a-z0-9_-]+)\}\}$/i.exec(part);
    const item = m ? fields.get(m[1]) : undefined;
    if (!item) return <span key={i}>{part}</span>;
    if (item.multiline) {
      return (
        <textarea
          key={i}
          form={formId}
          name={`fill:${item.id}`}
          data-sf={item.required ? "1" : undefined}
          required={item.required}
          maxLength={2000}
          rows={3}
          placeholder={item.text || placeholder}
          aria-label={item.text || placeholder}
          className="my-1.5 block w-full rounded-md border border-line bg-blush/20 px-2.5 py-1.5 text-[13.5px] text-ink outline-none focus:border-wine focus:ring-2 focus:ring-wine/20"
        />
      );
    }
    return (
      <input
        key={i}
        form={formId}
        name={`fill:${item.id}`}
        data-sf={item.required ? "1" : undefined}
        required={item.required}
        maxLength={2000}
        placeholder={item.text || placeholder}
        aria-label={item.text || placeholder}
        className="mx-1 inline-block w-48 max-w-full rounded-md border border-line bg-blush/20 px-2 py-0.5 align-baseline text-[13.5px] text-ink outline-none focus:border-wine focus:ring-2 focus:ring-wine/20"
      />
    );
  });
}

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

  // C21.1 — the guide: walks the signer field-to-field like the big
  // e-sign platforms. Every required input carries data-sf; "Next" scrolls
  // the first empty one into view, focuses it, and flashes a highlight.
  const rootRef = useRef<HTMLDivElement>(null);
  const signBtnRef = useRef<HTMLButtonElement>(null);
  // Server-rendered initial count: every required item + the typed name.
  // The mounted refresh corrects it as the signer fills things in.
  const initialCount = items.filter((i) => i.required).length + 1;
  const [progress, setProgress] = useState<{ total: number; left: number } | null>({ total: initialCount, left: initialCount });

  const emptyFields = () => {
    const nodes = [...(rootRef.current?.querySelectorAll<HTMLElement>("[data-sf]") ?? [])];
    return {
      all: nodes,
      empty: nodes.filter((el) => {
        if (el instanceof HTMLInputElement) return el.type === "checkbox" ? !el.checked : !el.value.trim();
        if (el instanceof HTMLTextAreaElement) return !el.value.trim();
        return false;
      }),
    };
  };
  const refreshProgress = () => {
    const { all, empty } = emptyFields();
    setProgress({ total: all.length, left: empty.length });
  };
  useEffect(() => {
    refreshProgress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const goNext = () => {
    const { empty } = emptyFields();
    const target = empty[0] ?? signBtnRef.current;
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "center" });
    target.focus({ preventScroll: true });
    target.classList.add("ring-2", "ring-wine", "ring-offset-2");
    setTimeout(() => target.classList.remove("ring-2", "ring-wine", "ring-offset-2"), 1600);
  };
  const t =
    locale === "es"
      ? { read: "Léelo con calma", name: "Tu nombre legal completo", draw: "Firma dibujada (opcional)", clear: "Borrar", sign: "Acepto y firmo", decline: "Prefiero no firmar", acks: "Reconocimientos requeridos (inicial cada uno)", initials: "Iniciales", fields: "Completa estos campos", fieldHint: "Escribe aquí", next: "Siguiente campo", allSet: "Todo listo — ir a firmar", toFill: "por completar", guided: "Te llevamos campo por campo" }
      : { read: "Read it in your own time", name: "Your full legal name", draw: "Drawn signature (optional)", clear: "Clear", sign: "I agree and sign", decline: "I'd rather not sign", acks: "Required acknowledgments (initial each)", initials: "Initials", fields: "Complete these fields", fieldHint: "Type here", next: "Next field", allSet: "All set — go to sign", toFill: "to complete", guided: "We'll walk you through each field" };

  const formId = "agreement-sign-form";
  const textItems = items.filter((i) => i.kind === "text");
  const inlineIds = new Set(
    [...body.matchAll(/\{\{fill:([a-z0-9_-]+)\}\}/gi)].map((m) => m[1])
  );
  const inlineFields = new Map(textItems.filter((i) => inlineIds.has(i.id)).map((i) => [i.id, i]));
  const standaloneFields = textItems.filter((i) => !inlineIds.has(i.id));
  const ackItems = items.filter((i) => i.kind !== "text");

  return (
    <div ref={rootRef} onInput={refreshProgress} onChange={refreshProgress} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-headline text-[1.6rem] font-medium text-ink-strong">{title}</h1>
        <p className="text-[13px] text-whisper">{t.read}</p>
      </div>

      {progress !== null && progress.total > 0 && (
        <div data-sign-guide className="sticky top-2 z-10 flex items-center gap-3 rounded-card border border-line bg-surface/95 px-4 py-2.5 shadow-card backdrop-blur">
          <span className="min-w-0 flex-1 truncate text-[13px] text-slate">
            {progress.left > 0 ? `${progress.left} ${t.toFill} · ${t.guided}` : t.allSet}
          </span>
          <button
            type="button"
            onClick={goNext}
            className={`shrink-0 rounded-lg px-4 py-1.5 text-[13px] font-medium transition-colors ${
              progress.left > 0 ? "bg-wine text-white hover:bg-wine-dark" : "border border-wine text-wine hover:bg-blush/30"
            }`}
          >
            {progress.left > 0 ? `${t.next} →` : `${t.allSet} →`}
          </button>
        </div>
      )}
      <div className="max-h-[50vh] overflow-y-auto whitespace-pre-wrap rounded-card border border-line bg-white p-5 text-[14.5px] leading-relaxed text-ink shadow-soft">
        {inlineFields.size > 0 ? renderBodyWithFields(body, inlineFields, formId, t.fieldHint) : body}
      </div>
      <div className="rounded-card border border-line bg-surface p-4 text-[13px] leading-relaxed text-slate">{disclosure}</div>

      <form
        id={formId}
        action={async (fd) => {
          setPending(true);
          if (drawn) fd.set("drawn", drawn);
          await onSign(fd);
          setPending(false);
        }}
        className="flex flex-col gap-4"
      >
        {standaloneFields.length > 0 && (
          <div className="flex flex-col gap-3">
            <span className="text-[13px] font-semibold uppercase tracking-wide text-mocha">{t.fields}</span>
            {standaloneFields.map((item) => (
              <label key={item.id} className="flex flex-col gap-1.5 rounded-card border border-line bg-white p-3.5 text-[13.5px] leading-relaxed text-ink">
                <span>{item.text}</span>
                {item.multiline ? (
                  <textarea
                    name={`fill:${item.id}`}
                    data-sf={item.required ? "1" : undefined}
                    required={item.required}
                    maxLength={2000}
                    rows={3}
                    className="rounded-md border border-line px-2.5 py-1.5 text-sm outline-none focus:border-wine focus:ring-2 focus:ring-wine/20"
                  />
                ) : (
                  <input
                    name={`fill:${item.id}`}
                    data-sf={item.required ? "1" : undefined}
                    required={item.required}
                    maxLength={2000}
                    className="rounded-md border border-line px-2.5 py-1.5 text-sm outline-none focus:border-wine focus:ring-2 focus:ring-wine/20"
                  />
                )}
              </label>
            ))}
          </div>
        )}
        {ackItems.length > 0 && (
          <div className="flex flex-col gap-3">
            <span className="text-[13px] font-semibold uppercase tracking-wide text-mocha">{t.acks}</span>
            {ackItems.map((item) =>
              item.kind === "checkbox" ? (
                <label key={item.id} className="flex items-start gap-3 rounded-card border border-line bg-white p-3.5 text-[13.5px] leading-relaxed text-ink">
                  <input
                    type="checkbox"
                    name={`ack:${item.id}`}
                    value="checked"
                    data-sf={item.required ? "1" : undefined}
                    required={item.required}
                    className="mt-0.5 h-4 w-4 rounded border-line text-wine focus:ring-wine/20"
                  />
                  <span>{item.text}</span>
                </label>
              ) : (
                <label key={item.id} className="flex items-start gap-3 rounded-card border border-line bg-white p-3.5 text-[13.5px] leading-relaxed text-ink">
                  <input
                    name={`ack:${item.id}`}
                    data-sf={item.required ? "1" : undefined}
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
            data-sf="1"
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
          ref={signBtnRef}
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

export function DrawPad({ onChange, clearLabel }: { onChange: (dataUrl: string | null) => void; clearLabel: string }) {
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
