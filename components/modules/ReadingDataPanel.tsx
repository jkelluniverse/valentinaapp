import type { MapPanelProps } from "@/lib/modules/types";
import { COPY } from "@/lib/copy/en";

// PLATFORM Phase 3 — generic renderer for provider-computed readings
// (western-natal, vedic-natal, numerology). Renders DEFENSIVELY: the
// provider payload shape is archived verbatim but only loosely assumed
// here — recognizable position/number structures become tables, anything
// else waits behind the tenant's pending copy. Refine per-kind rendering
// once real provider responses are on file (backlog: ASTROLOGY_API_KEY).

type Position = { point?: string; planet?: string; name?: string; sign?: string; degree?: number | string; longitude?: number | string; house?: number | string };

function findPositions(payload: unknown): Position[] {
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  for (const key of ["positions", "points", "planets", "data"]) {
    const v = obj[key];
    if (Array.isArray(v) && v.length > 0 && typeof v[0] === "object") return v as Position[];
    if (v && typeof v === "object") {
      const nested = findPositions(v);
      if (nested.length) return nested;
    }
  }
  return [];
}

function findNumbers(payload: unknown): [string, string][] {
  if (!payload || typeof payload !== "object") return [];
  const obj = payload as Record<string, unknown>;
  for (const key of ["core_numbers", "numbers", "numerology", "data", "result"]) {
    const v = obj[key];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const entries = Object.entries(v as Record<string, unknown>).filter(
        ([, val]) => typeof val === "number" || typeof val === "string"
      );
      if (entries.length) return entries.map(([k, val]) => [k.replace(/_/g, " "), String(val)]);
    }
  }
  return [];
}

export function readingPanelFor(kinds: string[]) {
  return function ReadingDataPanel({ displayLabel, copy, data }: MapPanelProps) {
    const readings = data.readings ?? {};
    const present = kinds.map((k) => readings[k]).filter(Boolean);
    return (
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl font-semibold">{copy.heading ?? displayLabel}</h2>
          {copy.sub && <p className="max-w-prose text-sm text-slate">{copy.sub}</p>}
        </div>
        {present.length === 0 ? (
          <p className="rounded-card border border-line bg-surface p-5 text-sm text-slate shadow-card">
            {copy.pending ?? COPY.discovery.mapPending(displayLabel)}
          </p>
        ) : (
          present.map((payload, i) => {
            const positions = findPositions(payload);
            const numbers = positions.length ? [] : findNumbers(payload);
            return (
              <div key={i} className="overflow-x-auto rounded-card border border-line bg-surface p-5 shadow-card">
                {positions.length > 0 ? (
                  <table className="w-full text-[14px]">
                    <tbody>
                      {positions.slice(0, 14).map((p, j) => (
                        <tr key={j} className="border-b border-line last:border-0">
                          <td className="py-1.5 pr-4 font-medium text-ink-strong">{p.point ?? p.planet ?? p.name ?? "—"}</td>
                          <td className="py-1.5 pr-4 text-ink">{p.sign ?? ""}</td>
                          <td className="py-1.5 text-right text-slate">
                            {p.degree ?? p.longitude ?? ""}
                            {p.house != null ? ` · house ${p.house}` : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : numbers.length > 0 ? (
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[14px] sm:grid-cols-3">
                    {numbers.slice(0, 12).map(([label, value]) => (
                      <div key={label} className="flex flex-col">
                        <dt className="text-[12px] uppercase tracking-wide text-mocha">{label}</dt>
                        <dd className="font-medium text-ink-strong">{value}</dd>
                      </div>
                    ))}
                  </dl>
                ) : (
                  <p className="text-sm text-slate">{copy.pending ?? COPY.discovery.mapPending(displayLabel)}</p>
                )}
              </div>
            );
          })
        )}
      </section>
    );
  };
}
