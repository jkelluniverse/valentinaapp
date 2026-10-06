"use client";

import { useEffect, useMemo, useState } from "react";
import type { DiscoveryDay } from "@/lib/discovery";
import { PendingButton } from "@/components/PendingButton";
import { fieldLabel, fieldHelp, type WorksheetField, type FieldLocale } from "@/lib/worksheet-meta";

// C18 §4 — the funnel: pick a day → pick a time → a short warm form → confirmed.
// The server action is passed in from the (server) page; this component holds
// only selection state + the anti-abuse fields (honeypot + render timestamp).

// RULING 224 — the SERVER picks the label and sends ONLY it. A client component's
// props travel in the RSC payload whether rendered or not, so sending both
// labels would put "Confirm my call" in a page that shows "Request my call" —
// the same unrendered-content blind spot ruling 203 found. The browser receives
// the copy that is TRUE for the mode and nothing else.
export type BookCopyProps = {
  submit: string;
  requestNote: string | null;
  // C42 — the structural fields' labels and the optional marker, from the catalogue.
  name: string;
  email: string;
  optional: string;
  notePlaceholder: string;
  missingField?: string;
};
// C42 (ruling 225) — THE PRACTITIONER'S QUESTIONS render here, under name and
// email, from the fields the server resolved (her isBooking worksheet, or the
// frozen default that IS today's form). The `required` attribute is emitted
// because it is the better experience; the SERVER is the enforcement
// (actions.ts — law 5), and the gate strips the attribute to prove it.
export function BookingFlow({
  days,
  timezone,
  action,
  error,
  practiceName,
  copy,
  fields,
  locale,
}: {
  days: DiscoveryDay[];
  timezone: string;
  action: (formData: FormData) => void | Promise<void>;
  error?: string;
  /** C29 — set ONLY for non-default tenants; the default keeps its original copy. */
  practiceName?: string;
  copy: BookCopyProps;
  fields: WorksheetField[];
  locale: FieldLocale;
}) {
  const [dayKey, setDayKey] = useState(days[0]?.key ?? "");
  const [slotIso, setSlotIso] = useState<string>("");
  const [renderedAt, setRenderedAt] = useState<number>(0);
  useEffect(() => setRenderedAt(Date.now()), []);

  const day = useMemo(() => days.find((d) => d.key === dayKey) ?? days[0], [days, dayKey]);
  const chosen = useMemo(() => {
    for (const d of days) {
      const s = d.slots.find((x) => x.iso === slotIso);
      if (s) return { day: d, slot: s };
    }
    return null;
  }, [days, slotIso]);

  if (days.length === 0) {
    // C29 — a non-default practice's empty state names ITS OWN practice; the
    // default tenant keeps its exact original copy (byte-identical, and it is
    // her page's own voice). practiceName is passed only for non-default hosts.
    return practiceName ? (
      <p className="rounded-card border border-line bg-surface px-6 py-5 text-[15px] text-ink shadow-soft">
        There aren&apos;t any open times listed right now. Please reach out and {practiceName} will
        find a time with you.
      </p>
    ) : (
      <p className="rounded-card border border-line bg-surface px-6 py-5 text-[15px] text-ink shadow-soft">
        There aren&apos;t any open times listed right now. Please reach out and Valentina will find a
        time with you.
      </p>
    );
  }

  const errorText: Record<string, string> = {
    slow: "That was a little too quick — please try once more.",
    rate: "You've made a few requests just now — please try again in a bit.",
    missing: "Please add your name, a valid email, and pick a time.",
    unavailable: "That time was just taken. Please pick another.",
    conflict: "That time was just taken. Please pick another.",
    missingField: copy.missingField ?? "Please answer every required question.",
  };

  return (
    <div className="flex flex-col gap-8">
      {error && errorText[error] && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">{errorText[error]}</p>
      )}

      {/* Day picker */}
      <div>
        <p className="mb-2 text-eyebrow font-semibold uppercase tracking-wide text-mocha">Pick a day</p>
        <div className="-mx-1 flex gap-2 overflow-x-auto pb-1">
          {days.map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => {
                setDayKey(d.key);
                setSlotIso("");
              }}
              className={`shrink-0 rounded-pill px-4 py-2 text-sm font-medium transition-colors ${
                d.key === (day?.key ?? "")
                  ? "bg-wine text-white"
                  : "border border-line bg-white text-ink hover:bg-blush"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {/* Time picker */}
      {day && (
        <div>
          <p className="mb-2 text-eyebrow font-semibold uppercase tracking-wide text-mocha">
            Pick a time <span className="lowercase text-whisper">· {timezone.replace(/_/g, " ")}</span>
          </p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {day.slots.map((s) => (
              <button
                key={s.iso}
                type="button"
                onClick={() => setSlotIso(s.iso)}
                className={`rounded-md border px-3 py-2.5 text-sm font-medium transition-colors ${
                  s.iso === slotIso
                    ? "border-wine bg-wine text-white"
                    : "border-line bg-white text-ink hover:border-mocha"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* The form appears once a time is chosen */}
      {chosen && (
        <form action={action} className="flex flex-col gap-4 border-t border-line pt-8">
          <p className="text-[15px] text-ink">
            <span className="font-medium text-ink-strong">Your free discovery call</span> —{" "}
            {chosen.day.label} at {chosen.slot.label}.
          </p>

          <input type="hidden" name="startAt" value={chosen.slot.iso} />
          <input type="hidden" name="t" value={renderedAt} />
          <input type="hidden" name="source" value="/book" />
          {/* Honeypot — hidden from humans, catnip for bots. */}
          <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label>
              Company
              <input type="text" name="company" tabIndex={-1} autoComplete="off" />
            </label>
          </div>

          <input type="hidden" name="lang" value={locale} />
          <label className={LABEL}>
            {copy.name}
            <input name="name" required autoComplete="name" className={INPUT} />
          </label>
          <label className={LABEL}>
            {copy.email}
            <input name="email" type="email" required autoComplete="email" className={INPUT} />
          </label>

          {/* C42 — her questions, in her order, with her required flags. */}
          {fields.map((f) => (
            <DynamicField key={f.id} f={f} locale={locale} optional={copy.optional} notePlaceholder={copy.notePlaceholder} />
          ))}

          {/* RULING 224 — the label is TRUE for the mode. "Confirm" when
              booking confirms; "Request" plus the note when the practitioner
              must approve. The wrong label in either direction is a false
              promise to a stranger, and the gate asserts both states. */}
          <PendingButton className="mt-2 rounded-pill bg-wine px-7 py-3 text-[15px] font-medium text-white shadow-soft transition-colors hover:bg-wine-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine">
            {copy.submit}
          </PendingButton>
          {copy.requestNote && (
            <p data-c40="request-note" className="text-[14px] leading-relaxed text-ink">{copy.requestNote}</p>
          )}
          <p className="text-[13px] leading-relaxed text-whisper">
            Your details are used only to arrange and confirm this call. Nothing is shared. See our{" "}
            <a href="/privacy" className="underline underline-offset-2 hover:text-wine">
              privacy notice
            </a>
            .
          </p>
        </form>
      )}
    </div>
  );
}

const LABEL = "flex flex-col gap-1.5 text-label font-semibold uppercase tracking-wide text-mocha";
const INPUT =
  "rounded-md border border-mocha/30 bg-white px-3 py-2.5 text-base font-normal normal-case tracking-normal text-ink outline-none placeholder:text-slate focus:border-wine focus-visible:ring-2 focus-visible:ring-wine/40";
const CHOICE = "flex items-center gap-2 text-base font-normal normal-case tracking-normal text-ink";

// One practitioner-authored question, rendered by type. The label is the one
// for the visitor's locale (Spanish falls back to English — C42 §2.6), and
// the stored answer will carry exactly this text as `q` (Rule 0.8).
function DynamicField({ f, locale, optional, notePlaceholder }: { f: WorksheetField; locale: FieldLocale; optional: string; notePlaceholder: string }) {
  const label = fieldLabel(f, locale);
  const help = fieldHelp(f, locale);
  const suffix = !f.required && f.type !== "SECTION" ? <span className="lowercase text-whisper"> {optional}</span> : null;
  const helpEl = help ? <span className="text-[13px] font-normal normal-case tracking-normal text-slate">{help}</span> : null;
  switch (f.type) {
    case "SECTION":
      return (
        <div className="flex flex-col gap-1 pt-2" data-c42-field={f.id}>
          <p className="font-headline text-lg font-semibold text-ink-strong">{label}</p>
          {helpEl}
        </div>
      );
    case "LONG_TEXT":
      return (
        <label className={LABEL} data-c42-field={f.id}>
          <span>{label}{suffix}</span>
          {helpEl}
          <textarea name={f.id} rows={3} required={!!f.required} placeholder={f.id === "note" ? notePlaceholder : undefined} className={`resize-y ${INPUT}`} />
        </label>
      );
    case "SCALE":
      return (
        <fieldset className={LABEL} data-c42-field={f.id}>
          <legend className="contents"><span>{label}{suffix}</span></legend>
          {helpEl}
          <div className="flex flex-wrap gap-3">
            {[1, 2, 3, 4, 5].map((n) => (
              <label key={n} className={CHOICE}>
                <input type="radio" name={f.id} value={n} required={!!f.required} className="accent-wine" />
                {n}
              </label>
            ))}
          </div>
        </fieldset>
      );
    case "SINGLE_CHOICE":
      return (
        <label className={LABEL} data-c42-field={f.id}>
          <span>{label}{suffix}</span>
          {helpEl}
          <select name={f.id} required={!!f.required} defaultValue="" className={INPUT}>
            <option value="">{locale === "es" ? "Elige una opción" : "Choose one"}</option>
            {(f.options ?? []).map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </label>
      );
    case "MULTI_CHOICE":
      return (
        <fieldset className={LABEL} data-c42-field={f.id}>
          <legend className="contents"><span>{label}{suffix}</span></legend>
          {helpEl}
          <div className="flex flex-col gap-1.5">
            {(f.options ?? []).map((o) => (
              <label key={o} className={CHOICE}>
                <input type="checkbox" name={f.id} value={o} className="accent-wine" />
                {o}
              </label>
            ))}
          </div>
        </fieldset>
      );
    case "CHECKBOX":
      return (
        <label className={`${CHOICE} ${f.required ? "" : ""}`} data-c42-field={f.id}>
          <input type="checkbox" name={f.id} value="on" required={!!f.required} className="accent-wine" />
          <span>{label}{suffix}</span>
          {helpEl}
        </label>
      );
    default:
      return (
        <label className={LABEL} data-c42-field={f.id}>
          <span>{label}{suffix}</span>
          {helpEl}
          <input
            name={f.id}
            type={f.id === "phone" ? "tel" : "text"}
            autoComplete={f.id === "phone" ? "tel" : undefined}
            required={!!f.required}
            className={INPUT}
          />
        </label>
      );
  }
}
