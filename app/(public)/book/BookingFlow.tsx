"use client";

import { useEffect, useMemo, useState } from "react";
import type { DiscoveryDay } from "@/lib/discovery";
import { PendingButton } from "@/components/PendingButton";

// C18 §4 — the funnel: pick a day → pick a time → a short warm form → confirmed.
// The server action is passed in from the (server) page; this component holds
// only selection state + the anti-abuse fields (honeypot + render timestamp).

export function BookingFlow({
  days,
  timezone,
  action,
  error,
}: {
  days: DiscoveryDay[];
  timezone: string;
  action: (formData: FormData) => void | Promise<void>;
  error?: string;
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
    return (
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

          <label className="flex flex-col gap-1.5 text-label font-semibold uppercase tracking-wide text-mocha">
            Your name
            <input
              name="name"
              required
              autoComplete="name"
              className="rounded-md border border-mocha/30 bg-white px-3 py-2.5 text-base font-normal normal-case tracking-normal text-ink outline-none placeholder:text-slate focus:border-wine focus-visible:ring-2 focus-visible:ring-wine/40"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-label font-semibold uppercase tracking-wide text-mocha">
            Email
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              className="rounded-md border border-mocha/30 bg-white px-3 py-2.5 text-base font-normal normal-case tracking-normal text-ink outline-none placeholder:text-slate focus:border-wine focus-visible:ring-2 focus-visible:ring-wine/40"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-label font-semibold uppercase tracking-wide text-mocha">
            Phone <span className="lowercase text-whisper">· optional</span>
            <input
              name="phone"
              type="tel"
              autoComplete="tel"
              className="rounded-md border border-mocha/30 bg-white px-3 py-2.5 text-base font-normal normal-case tracking-normal text-ink outline-none placeholder:text-slate focus:border-wine focus-visible:ring-2 focus-visible:ring-wine/40"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-label font-semibold uppercase tracking-wide text-mocha">
            What brings you? <span className="lowercase text-whisper">· optional</span>
            <textarea
              name="note"
              rows={3}
              placeholder="A sentence or two, if you'd like — no need to explain everything."
              className="resize-y rounded-md border border-mocha/30 bg-white px-3 py-2.5 text-base font-normal normal-case tracking-normal text-ink outline-none placeholder:text-slate focus:border-wine focus-visible:ring-2 focus-visible:ring-wine/40"
            />
          </label>

          <PendingButton className="mt-2 rounded-pill bg-wine px-7 py-3 text-[15px] font-medium text-white shadow-soft transition-colors hover:bg-wine-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine">
            Confirm my call
          </PendingButton>
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
