import { GeneKeysView } from "@/components/LensViews";
import type { MapPanelProps } from "@/lib/modules/types";

// Module panel: archetypal-keys. The sphere data keeps arriving through the
// existing lens pipeline; this panel only frames it. Heading/sub copy is
// tenant data (settings.panel) with neutral defaults — the practitioner's
// branded language never lives in code (Rule 0.4).

export function ArchetypalKeysPanel({ displayLabel, copy, data }: MapPanelProps) {
  if (data.spheres.length === 0) return null;
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{copy.heading ?? `Your ${displayLabel}`}</h2>
        <p className="max-w-prose text-sm text-slate">
          {copy.sub ?? "Read from your birth details — a set of positions to contemplate slowly, one at a time."}
        </p>
      </div>
      <GeneKeysView spheres={data.spheres} />
    </section>
  );
}
