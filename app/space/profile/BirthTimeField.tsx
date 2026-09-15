"use client";

import { useState } from "react";

// AMD-05 B5.3 — three-way birth-time precision instead of a lone "unknown"
// checkbox. The time input hides when the time is unknown; an approximate
// time gets a gentle caveat instead of false certainty.

const PRECISIONS = [
  { value: "EXACT", label: "Exact — from a birth certificate or record" },
  { value: "APPROXIMATE", label: "Approximate — close, but not certain" },
  { value: "UNKNOWN", label: "I don't know it" },
] as const;

export function BirthTimeField({
  initialPrecision,
  initialTime,
}: {
  initialPrecision: string;
  initialTime: string;
}) {
  const [precision, setPrecision] = useState(initialPrecision);

  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink-strong">How sure is your birth time?</span>
        <select
          name="birthTimePrecision"
          value={precision}
          onChange={(e) => setPrecision(e.target.value)}
          className="rounded-md border border-line px-3 py-2 text-ink"
        >
          {PRECISIONS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
      {precision !== "UNKNOWN" && (
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink-strong">Birth time (local)</span>
          <input
            type="time"
            name="birthTime"
            defaultValue={initialTime}
            className="rounded-md border border-line px-3 py-2 text-ink"
          />
        </label>
      )}
      {precision === "APPROXIMATE" && (
        <p className="text-xs text-slate">
          Your chart uses this time as given — an approximate time can shift a few details.
        </p>
      )}
    </div>
  );
}
