"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { saveIntakeField, advanceIntake, backIntake } from "./actions";

// CLIENT-ONBOARDING §3/§4 — one step, one screen. Mobile-first: a single
// question group, big touch targets, no side-by-side layouts. Every field
// auto-saves on change (debounced 800ms); the client never presses Save.

export type UIField = {
  key: string;
  label: string;
  kind: "text" | "email" | "date" | "time" | "place" | "select" | "textarea" | "scale";
  required: boolean;
  options?: string[];
  help?: string;
  timeUnknown?: "degrade" | "hide";
};

export function IntakeStepForm({
  flowId,
  stepKey,
  title,
  fields,
  initial,
  prevStep,
  nextStep,
  labels,
}: {
  flowId: string;
  stepKey: string;
  title: string;
  fields: UIField[];
  initial: Record<string, unknown>;
  prevStep: string | null;
  nextStep: string;
  labels: { next: string; back: string; saved: string; birthTimeUnknown: string; birthTimeUnknownReassure: string };
}) {
  const [values, setValues] = useState<Record<string, unknown>>(initial);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [, startSave] = useTransition();
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const t = timers.current;
    return () => Object.values(t).forEach(clearTimeout);
  }, []);

  function set(field: UIField, value: unknown) {
    setValues((v) => ({ ...v, [field.key]: value }));
    clearTimeout(timers.current[field.key]);
    timers.current[field.key] = setTimeout(() => {
      startSave(async () => {
        await saveIntakeField(flowId, field.key, field.label, value);
        setSavedKey(field.key);
        setTimeout(() => setSavedKey((k) => (k === field.key ? null : k)), 1500);
      });
    }, 800);
  }

  const inputCls =
    "w-full rounded-lg border border-line bg-surface px-4 py-3 text-base text-ink focus:border-mocha focus:outline-none";

  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-headline text-[1.5rem] font-medium text-ink-strong">{title}</h1>

      <div className="flex flex-col gap-6">
        {fields.map((f) => {
          const val = values[f.key];
          const savedHere = savedKey === f.key;
          return (
            <label key={f.key} className="flex flex-col gap-2">
              <span className="flex items-center gap-2 text-[15px] font-medium text-ink-strong">
                {f.label}
                {f.required && <span className="text-whisper">·</span>}
                {savedHere && <span className="text-[12px] font-normal text-mocha">{labels.saved}</span>}
              </span>
              {f.help && <span className="-mt-1 text-[13px] text-whisper">{f.help}</span>}

              {(f.kind === "text" || f.kind === "email" || f.kind === "place") && (
                <input
                  type={f.kind === "email" ? "email" : "text"}
                  className={inputCls}
                  defaultValue={typeof val === "string" ? val : ""}
                  onChange={(e) => set(f, e.target.value)}
                />
              )}
              {f.kind === "date" && (
                <input type="date" className={inputCls} defaultValue={typeof val === "string" ? val : ""} onChange={(e) => set(f, e.target.value)} />
              )}
              {f.kind === "time" && (
                <div className="flex flex-col gap-2">
                  <input
                    type="time"
                    className={inputCls}
                    disabled={val === "unknown"}
                    defaultValue={typeof val === "string" && val !== "unknown" ? val : ""}
                    onChange={(e) => set(f, e.target.value)}
                  />
                  <label className="flex items-center gap-2 text-[14px] text-slate">
                    <input
                      type="checkbox"
                      checked={val === "unknown"}
                      onChange={(e) => set(f, e.target.checked ? "unknown" : "")}
                    />
                    {labels.birthTimeUnknown}
                  </label>
                  {val === "unknown" && <span className="text-[13px] text-whisper">{labels.birthTimeUnknownReassure}</span>}
                </div>
              )}
              {f.kind === "textarea" && (
                <textarea className={`${inputCls} min-h-[96px]`} defaultValue={typeof val === "string" ? val : ""} onChange={(e) => set(f, e.target.value)} />
              )}
              {f.kind === "select" && (
                <select className={inputCls} defaultValue={typeof val === "string" ? val : ""} onChange={(e) => set(f, e.target.value)}>
                  <option value="">—</option>
                  {(f.options ?? []).map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              )}
              {f.kind === "scale" && (
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={val === n}
                      onClick={() => set(f, n)}
                      className={`flex h-11 flex-1 items-center justify-center rounded-lg border text-base font-medium transition-colors ${
                        val === n ? "border-wine bg-wine text-white" : "border-line text-slate hover:border-mocha"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              )}
            </label>
          );
        })}
      </div>

      <div className="flex items-center gap-3 pt-2">
        {prevStep && (
          <form action={backIntake.bind(null, flowId, prevStep)}>
            <button className="rounded-lg border border-line px-5 py-3 text-sm font-medium text-slate transition-colors hover:border-mocha hover:text-wine">
              {labels.back}
            </button>
          </form>
        )}
        <form action={advanceIntake.bind(null, flowId, nextStep)} className="flex-1">
          <button className="w-full rounded-lg bg-wine px-5 py-3 text-sm font-medium text-white shadow-soft transition-colors hover:bg-wine-dark">
            {labels.next}
          </button>
        </form>
      </div>
    </div>
  );
}
