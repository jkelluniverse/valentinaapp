import { SEQUENCE_MEANING, SPECTRUM_FRAMING, type SpherePosition } from "@/lib/gene-keys";
import { stageLabel, stageTheme, type SpiralScore } from "@/lib/spiral";

// Reflective renderings of the Gene Keys and values-spiral lenses, shared by
// the client and practitioner views. Positions and weights only — all copy is
// original (spec §7).

const SEQUENCES = ["Activation", "Venus", "Pearl"] as const;

export function GeneKeysView({ spheres }: { spheres: SpherePosition[] }) {
  return (
    <div className="flex flex-col gap-4">
      {SEQUENCES.map((seq) => {
        const items = spheres.filter((s) => s.sequence === seq);
        if (items.length === 0) return null;
        return (
          <div key={seq} className="rounded-lg border border-line bg-white p-5 shadow-soft">
            <p className="text-label font-semibold uppercase tracking-wide text-mocha">
              {seq} sequence
            </p>
            <p className="mt-1 text-sm text-slate">{SEQUENCE_MEANING[seq]}</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {items.map((s) => (
                <div
                  key={s.key}
                  className="flex items-center justify-between rounded-md border border-line/70 px-3.5 py-2.5"
                >
                  <span className="text-sm font-medium text-ink-strong">{s.label}</span>
                  <span className="text-sm font-semibold text-wine">
                    Key {s.geneKey}.{s.line}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <p className="max-w-prose text-sm leading-relaxed text-slate">{SPECTRUM_FRAMING}</p>
    </div>
  );
}

export function SpiralView({
  score,
  practitionerCenter,
}: {
  score: SpiralScore;
  practitionerCenter?: string;
}) {
  const center = practitionerCenter ?? score.centerOfGravity;
  const max = Math.max(...score.weights.map((w) => w.weight), 0.001);
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink">
        Center of gravity right now:{" "}
        <span className="font-semibold text-wine">{stageLabel(center)}</span>
        <span className="text-slate"> — {stageTheme(center)}</span>
      </p>
      <div className="flex flex-col gap-1.5">
        {score.weights.map((w) => (
          <div key={w.stage} className="flex items-center gap-3">
            <span className="w-28 shrink-0 text-sm text-ink">{w.label}</span>
            <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-line/50">
              <span
                className="block h-full rounded-full bg-wine/80"
                style={{ width: `${Math.round((w.weight / max) * 100)}%` }}
              />
            </span>
            <span className="w-10 text-right text-xs text-slate">
              {Math.round(w.weight * 100)}%
            </span>
          </div>
        ))}
      </div>
      <p className="max-w-prose text-sm leading-relaxed text-slate">
        A blend, not a box — where your energy tends to live these days, shifting with season and
        context.
      </p>
    </div>
  );
}
