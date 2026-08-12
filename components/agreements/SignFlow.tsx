"use client";

import { useEffect, useRef, useState } from "react";

// C20 §3 → C22 — the flow that makes it binding, rendered as PAPER:
// 1. the full document on a white letterhead sheet — no scroll cage
// 2. fields drawn as labeled fillable boxes exactly where they sit
// 3. the document's OWN signature line, live: tap the signature box to
//    draw; the mark lands IN the box (and at the same spot on the sealed
//    PDF); date fills automatically; printed name is typed in place
// 4. ONE unambiguous wine button: "I agree and sign" — no dark patterns.

export type SignFlowItem = { id: string; text: string; kind: "initials" | "checkbox" | "text"; required: boolean; multiline?: boolean };

// Classic fillable-form field tint, readable in both themes.
const BOX =
  "rounded-[4px] border border-[#A9C4E0] bg-[#EFF5FC] text-ink outline-none focus:border-wine focus:ring-2 focus:ring-wine/20";

type MarkerCtx = {
  formId: string;
  placeholder: string;
  t: { signHere: string; signed: string; dateAuto: string; printedName: string; clear: string };
  drawn: string | null;
  onOpenPad: () => void;
  padOpen: boolean;
};

// Split the document body on {{fill:*}} AND signature-line markers so
// everything renders exactly where it lives in the text. Inputs sit
// visually inside the sheet but submit with the sign form (form attr).
function renderPaperBody(body: string, fields: Map<string, SignFlowItem>, ctx: MarkerCtx) {
  const parts = body.split(/(\{\{fill:[a-z0-9_-]+\}\}|\{\{signature\}\}|\{\{date_signed\}\}|\{\{printed_name\}\}|\{\{countersignature\}\}|\{\{countersign_date\}\})/gi);
  const today = new Date().toISOString().slice(0, 10);
  return parts.map((part, i) => {
    const lower = part.toLowerCase();
    if (lower === "{{signature}}") {
      return (
        <button
          key={i}
          type="button"
          data-sf-signature
          onClick={ctx.onOpenPad}
          aria-label={ctx.t.signHere}
          className={`mx-1 inline-flex h-16 w-56 max-w-full items-center justify-center overflow-hidden rounded-[4px] border align-middle ${
            ctx.drawn ? "border-line bg-white" : "border-dashed border-wine bg-blush/30 text-wine"
          }`}
        >
          {ctx.drawn ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ctx.drawn} alt={ctx.t.signed} className="h-full w-auto object-contain" />
          ) : (
            <span className="text-[13px] font-medium">✍ {ctx.t.signHere}</span>
          )}
        </button>
      );
    }
    if (lower === "{{date_signed}}" || lower === "{{countersign_date}}") {
      return (
        <span key={i} className={`mx-1 inline-block px-2 py-0.5 align-baseline text-[13px] text-slate ${BOX}`} title={ctx.t.dateAuto}>
          {lower === "{{date_signed}}" ? today : "—"}
        </span>
      );
    }
    if (lower === "{{printed_name}}") {
      return (
        <input
          key={i}
          form={ctx.formId}
          name="signerName"
          data-sf="1"
          required
          minLength={3}
          placeholder={ctx.t.printedName}
          aria-label={ctx.t.printedName}
          className={`mx-1 inline-block w-64 max-w-full px-2 py-0.5 align-baseline text-[14px] ${BOX}`}
        />
      );
    }
    if (lower === "{{countersignature}}") {
      return (
        <span key={i} className="mx-1 inline-flex h-14 w-56 max-w-full items-center justify-center rounded-[4px] border border-dashed border-line align-middle text-[12px] text-whisper">
          {ctx.placeholder /* the practitioner countersigns after — box stays theirs */}
        </span>
      );
    }
    const m = /^\{\{fill:([a-z0-9_-]+)\}\}$/i.exec(part);
    const item = m ? fields.get(m[1]) : undefined;
    if (!item) return <span key={i}>{part}</span>;
    if (item.multiline) {
      return (
        <textarea
          key={i}
          form={ctx.formId}
          name={`fill:${item.id}`}
          data-sf={item.required ? "1" : undefined}
          required={item.required}
          maxLength={2000}
          rows={3}
          placeholder={item.text || ctx.placeholder}
          aria-label={item.text || ctx.placeholder}
          className={`my-1.5 block w-full px-2.5 py-1.5 text-[13.5px] ${BOX}`}
        />
      );
    }
    return (
      <input
        key={i}
        form={ctx.formId}
        name={`fill:${item.id}`}
        data-sf={item.required ? "1" : undefined}
        required={item.required}
        maxLength={2000}
        placeholder={item.text || ctx.placeholder}
        aria-label={item.text || ctx.placeholder}
        className={`mx-1 inline-block w-48 max-w-full px-2 py-0.5 align-baseline text-[13.5px] ${BOX}`}
      />
    );
  });
}

export function SignFlow({
  title,
  body,
  disclosure,
  locale,
  practiceName = "Veritas Consulting",
  items = [],
  onSign,
  onDecline,
}: {
  title: string;
  body: string;
  disclosure: string;
  locale: "en" | "es";
  practiceName?: string;
  items?: SignFlowItem[]; // v3.1 — per-item acknowledgments (initials/checkboxes)
  onSign: (formData: FormData) => Promise<void>;
  onDecline: () => Promise<void>;
}) {
  const [drawn, setDrawn] = useState<string | null>(null);
  const [padOpen, setPadOpen] = useState(false);
  const [pending, setPending] = useState(false);

  // C21.1 — the guide: walks the signer field-to-field like the big
  // e-sign platforms. Every required input carries data-sf; "Next" scrolls
  // the first empty one into view, focuses it, and flashes a highlight.
  // The in-document signature box counts as a field until it's drawn.
  const rootRef = useRef<HTMLDivElement>(null);
  const signBtnRef = useRef<HTMLButtonElement>(null);
  const hasSignMarker = body.includes("{{signature}}");
  const initialCount = items.filter((i) => i.required).length + 1 + (hasSignMarker ? 1 : 0);
  const [progress, setProgress] = useState<{ total: number; left: number } | null>({ total: initialCount, left: initialCount });

  const emptyFields = () => {
    const root = rootRef.current;
    const nodes = [...(root?.querySelectorAll<HTMLElement>("[data-sf]") ?? [])];
    const sigBox = root?.querySelector<HTMLElement>("[data-sf-signature]") ?? null;
    const empty: HTMLElement[] = [];
    for (const el of nodes) {
      if (el instanceof HTMLInputElement) {
        if (el.type === "checkbox" ? !el.checked : !el.value.trim()) empty.push(el);
      } else if (el instanceof HTMLTextAreaElement) {
        if (!el.value.trim()) empty.push(el);
      }
    }
    if (sigBox && !drawnRef.current) empty.push(sigBox);
    return { total: nodes.length + (sigBox ? 1 : 0), empty };
  };
  // the callbacks above run outside React's render — keep drawn readable
  const drawnRef = useRef<string | null>(null);
  drawnRef.current = drawn;

  const refreshProgress = () => {
    const { total, empty } = emptyFields();
    setProgress({ total, left: empty.length });
  };
  useEffect(() => {
    refreshProgress();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawn]);
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
      ? { read: "Léelo con calma y complete los campos", name: "Tu nombre legal completo", draw: "Firma dibujada", clear: "Borrar", sign: "Acepto y firmo", decline: "Prefiero no firmar", acks: "Reconocimientos requeridos", initials: "Iniciales", fields: "Completa estos campos", fieldHint: "Escriba aquí", next: "Siguiente campo", allSet: "Todo listo — ir a firmar", toFill: "por completar", guided: "Le llevamos campo por campo", signHere: "Firmar aquí", signed: "Firmado", dateAuto: "La fecha se registra al firmar", printedName: "Nombre en letra de imprenta", drawTitle: "Dibuje su firma", done: "Listo", counterHint: "firma de la oficina" }
      : { read: "Read it in your own time and complete the fields", name: "Your full legal name", draw: "Drawn signature", clear: "Clear", sign: "I agree and sign", decline: "I'd rather not sign", acks: "Required acknowledgments", initials: "Initials", fields: "Complete these fields", fieldHint: "Type here", next: "Next field", allSet: "All set — go to sign", toFill: "to complete", guided: "We'll walk you through each field", signHere: "Sign here", signed: "Signed", dateAuto: "The date is recorded when you sign", printedName: "Printed name", drawTitle: "Draw your signature", done: "Done", counterHint: "office signature" };

  const formId = "agreement-sign-form";
  // The sheet renders its own styled heading — drop the body's duplicate
  // first line when it IS the title.
  const bodyLines = body.split("\n");
  const displayBody =
    bodyLines[0]?.trim().toLowerCase() === title.trim().toLowerCase()
      ? bodyLines.slice(1).join("\n").replace(/^\n+/, "")
      : body;
  const textItems = items.filter((i) => i.kind === "text");
  const inlineIds = new Set([...body.matchAll(/\{\{fill:([a-z0-9_-]+)\}\}/gi)].map((m) => m[1]));
  const inlineFields = new Map(textItems.filter((i) => inlineIds.has(i.id)).map((i) => [i.id, i]));
  const standaloneFields = textItems.filter((i) => !inlineIds.has(i.id));
  const ackItems = items.filter((i) => i.kind !== "text");
  const markerCtx: MarkerCtx = {
    formId,
    placeholder: t.counterHint,
    t: { signHere: t.signHere, signed: t.signed, dateAuto: t.dateAuto, printedName: t.printedName, clear: t.clear },
    drawn,
    onOpenPad: () => setPadOpen(true),
    padOpen,
  };

  return (
    <div ref={rootRef} onInput={refreshProgress} onChange={refreshProgress} className="flex flex-col gap-5">
      <p className="text-[13px] text-whisper">{t.read}</p>

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

      {/* THE PAPER — the whole document on one letterhead sheet, no inner
          scroll: the page itself scrolls, like holding the document. */}
      <div data-paper className="rounded-[6px] border border-line bg-white px-7 py-10 shadow-card sm:px-12 sm:py-12">
        <div className="mb-8 border-b border-line pb-5 text-center">
          <p className="font-headline text-[22px] font-semibold text-wine">{practiceName}</p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.14em] text-mocha">VIIIV CORP</p>
        </div>
        <h1 className="mb-6 text-center font-headline text-[19px] font-semibold uppercase tracking-wide text-ink-strong">{title}</h1>
        <div className="whitespace-pre-wrap font-serif text-[15px] leading-[1.8] text-ink">
          {renderPaperBody(displayBody, inlineFields, markerCtx)}
        </div>
      </div>

      {/* The draw pad, summoned by the in-document signature box. */}
      {hasSignMarker && padOpen && (
        <div className="sticky bottom-3 z-20 flex flex-col gap-2 rounded-card border border-wine bg-white p-4 shadow-card">
          <span className="text-[13px] font-semibold uppercase tracking-wide text-mocha">{t.drawTitle}</span>
          <DrawPad onChange={setDrawn} clearLabel={t.clear} />
          <button
            type="button"
            onClick={() => setPadOpen(false)}
            className="self-start rounded-lg bg-wine px-4 py-1.5 text-[13px] font-medium text-white hover:bg-wine-dark"
          >
            {t.done}
          </button>
        </div>
      )}

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
                    className={`px-2.5 py-1.5 text-sm ${BOX}`}
                  />
                ) : (
                  <input
                    name={`fill:${item.id}`}
                    data-sf={item.required ? "1" : undefined}
                    required={item.required}
                    maxLength={2000}
                    className={`px-2.5 py-1.5 text-sm ${BOX}`}
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
                    className={`w-16 shrink-0 px-2 py-1 text-center text-sm uppercase tracking-widest ${BOX}`}
                  />
                  <span>{item.text}</span>
                </label>
              )
            )}
          </div>
        )}

        {/* Without in-document markers, the classic block: typed name +
            optional drawn mark below the document. */}
        {!hasSignMarker && (
          <>
            <label className="flex flex-col gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-mocha">
              {t.name}
              <input
                name="signerName"
                data-sf="1"
                required
                minLength={3}
                className={`px-3 py-2.5 text-base font-normal normal-case tracking-normal ${BOX}`}
              />
            </label>
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold uppercase tracking-wide text-mocha">{t.draw}</span>
              <DrawPad onChange={setDrawn} clearLabel={t.clear} />
            </div>
          </>
        )}
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
