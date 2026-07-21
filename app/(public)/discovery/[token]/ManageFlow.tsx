"use client";

import { useMemo, useState } from "react";
import type { DiscoveryDay } from "@/lib/discovery";
import { PendingButton } from "@/components/PendingButton";

// C18 §4.5 — reschedule/cancel a discovery call from the signed email link.
export function ManageFlow({
  days,
  timezone,
  rescheduleAction,
  cancelAction,
}: {
  days: DiscoveryDay[];
  timezone: string;
  rescheduleAction: (formData: FormData) => void | Promise<void>;
  cancelAction: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [dayKey, setDayKey] = useState(days[0]?.key ?? "");
  const [slotIso, setSlotIso] = useState("");
  const day = useMemo(() => days.find((d) => d.key === dayKey) ?? days[0], [days, dayKey]);

  return (
    <div className="flex flex-col gap-6">
      {!open ? (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setOpen(true)}
            disabled={days.length === 0}
            className="rounded-pill bg-wine px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wine-dark disabled:opacity-40"
          >
            Reschedule
          </button>
          <form action={cancelAction}>
            <PendingButton className="rounded-pill border border-line px-6 py-2.5 text-sm font-medium text-slate transition-colors hover:border-rose hover:text-rose">
              Cancel my call
            </PendingButton>
          </form>
        </div>
      ) : (
        <form action={rescheduleAction} className="flex flex-col gap-6">
          <div>
            <p className="mb-2 text-eyebrow font-semibold uppercase tracking-wide text-mocha">Pick a new day</p>
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
                    d.key === (day?.key ?? "") ? "bg-wine text-white" : "border border-line bg-white text-ink hover:bg-blush"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>
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
                      s.iso === slotIso ? "border-wine bg-wine text-white" : "border-line bg-white text-ink hover:border-mocha"
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <input type="hidden" name="startAt" value={slotIso} />
          <div className="flex flex-wrap gap-3">
            <PendingButton
              disabled={!slotIso}
              className="rounded-pill bg-wine px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wine-dark disabled:opacity-40"
            >
              Move my call here
            </PendingButton>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-pill border border-line px-6 py-2.5 text-sm font-medium text-slate hover:text-wine"
            >
              Never mind
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
