"use client";

import { useEffect, useState } from "react";
import { PendingButton } from "@/components/PendingButton";
import type { WorksheetField, WorksheetAnswers } from "@/lib/worksheet-meta";

// The client fill-out form (C9 spec §6). Draft answers autosave to this
// device (localStorage) so a long worksheet is never lost; the draft is
// cleared once the submit round-trip succeeds.

export function WorksheetFill({
  assignmentId,
  fields,
  action,
  error,
  preview = false,
}: {
  assignmentId: string;
  fields: WorksheetField[];
  action?: (formData: FormData) => Promise<void>;
  error?: string | null;
  preview?: boolean;
}) {
  const draftKey = `worksheet-draft-${assignmentId}`;
  const [answers, setAnswers] = useState<WorksheetAnswers>({});
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    if (preview) return;
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        setAnswers(JSON.parse(raw));
        setRestored(true);
      }
    } catch {
      // a broken draft just starts fresh
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function set(fieldId: string, value: WorksheetAnswers[string]) {
    setAnswers((prev) => {
      const next = { ...prev, [fieldId]: value };
      if (!preview) {
        try {
          localStorage.setItem(draftKey, JSON.stringify(next));
        } catch {
          // storage full/blocked — typing still works, just no draft safety net
        }
      }
      return next;
    });
  }

  const inputClass =
    "w-full rounded-md border border-line bg-white px-3 py-2.5 text-base leading-relaxed text-ink outline-none placeholder:text-slate focus:border-wine focus:ring-2 focus:ring-wine/20";

  return (
    <form action={preview ? undefined : action} className="flex flex-col gap-6">
      <input type="hidden" name="answers" value={JSON.stringify(answers)} />
      {restored && (
        <p className="rounded-md bg-blush px-3 py-2 text-xs text-wine">
          We picked up where you left off — your draft was saved on this device.
        </p>
      )}

      {fields.map((field) => {
        if (field.type === "SECTION") {
          return (
            <div key={field.id} className="mt-2 flex flex-col gap-1">
              <h2 className="font-headline text-xl font-semibold text-wine">{field.label}</h2>
              {field.help && <p className="text-sm text-ink">{field.help}</p>}
              <div className="h-px w-12 bg-mocha" />
            </div>
          );
        }

        const value = answers[field.id];
        return (
          <div key={field.id} className="flex flex-col gap-1.5">
            <label className="font-medium text-ink-strong">
              {field.label}
              {field.required && <span className="ml-1 text-mocha">*</span>}
            </label>
            {field.help && <p className="-mt-1 text-sm text-slate">{field.help}</p>}

            {field.type === "SHORT_TEXT" && (
              <input
                value={typeof value === "string" ? value : ""}
                onChange={(e) => set(field.id, e.target.value)}
                className={inputClass}
                disabled={preview}
              />
            )}
            {field.type === "LONG_TEXT" && (
              <textarea
                rows={4}
                value={typeof value === "string" ? value : ""}
                onChange={(e) => set(field.id, e.target.value)}
                placeholder="Take your time…"
                className={inputClass}
                disabled={preview}
              />
            )}
            {field.type === "SCALE" && (
              <div className="flex flex-wrap gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={preview}
                    onClick={() => set(field.id, value === n ? "" : n)}
                    aria-pressed={value === n}
                    className={`h-11 w-11 rounded-full text-sm font-medium transition-colors ${
                      typeof value === "number" && n <= value
                        ? "bg-mocha text-white"
                        : "border border-line bg-white text-ink hover:bg-blush"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
            {field.type === "SINGLE_CHOICE" && (
              <div className="flex flex-col gap-1.5">
                {(field.options ?? []).map((opt) => (
                  <label key={opt} className="flex items-center gap-2 text-ink">
                    <input
                      type="radio"
                      checked={value === opt}
                      onChange={() => set(field.id, opt)}
                      disabled={preview}
                      className="h-4 w-4 border-line text-wine focus:ring-wine/20"
                    />
                    {opt}
                  </label>
                ))}
              </div>
            )}
            {field.type === "MULTI_CHOICE" && (
              <div className="flex flex-col gap-1.5">
                {(field.options ?? []).map((opt) => {
                  const selected = Array.isArray(value) && value.includes(opt);
                  return (
                    <label key={opt} className="flex items-center gap-2 text-ink">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => {
                          const cur = Array.isArray(value) ? value : [];
                          set(field.id, selected ? cur.filter((o) => o !== opt) : [...cur, opt]);
                        }}
                        disabled={preview}
                        className="h-4 w-4 rounded border-line text-wine focus:ring-wine/20"
                      />
                      {opt}
                    </label>
                  );
                })}
              </div>
            )}
            {field.type === "CHECKBOX" && (
              <label className="flex items-center gap-2 text-ink">
                <input
                  type="checkbox"
                  checked={value === true}
                  onChange={(e) => set(field.id, e.target.checked)}
                  disabled={preview}
                  className="h-4 w-4 rounded border-line text-wine focus:ring-wine/20"
                />
                Yes
              </label>
            )}
          </div>
        );
      })}

      {error && <p className="text-sm text-rose">{error}</p>}
      {!preview && (
        <PendingButton
          pendingLabel="Sending…"
          className="rounded-md bg-wine px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-wine-dark"
        >
          Send to Valentina
        </PendingButton>
      )}
      {preview && (
        <p className="text-sm text-slate">(Preview — clients get a &quot;Send to Valentina&quot; button here.)</p>
      )}
    </form>
  );
}
