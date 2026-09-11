import { SpiralView } from "@/components/LensViews";
import type { MapPanelProps } from "@/lib/modules/types";

// Module panel: values-spiral. The score keeps arriving through the existing
// assessment → scorer → LensResult pipeline with practitioner review; the
// panel renders the reviewed state or the quiet waiting line. Copy is tenant
// data with neutral defaults.

export function ValuesSpiralPanel({ copy, data }: MapPanelProps) {
  if (!data.spiralScore) return null;
  if (!data.spiralReviewed) {
    return (
      <p className="rounded-md border border-line bg-white px-4 py-3 text-sm text-slate">
        {copy.pending ??
          "Your values reflection is in — your practitioner is looking at it, and it'll appear here once they have."}
      </p>
    );
  }
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold">{copy.heading ?? "Your values snapshot"}</h2>
        <p className="max-w-prose text-sm text-slate">
          {copy.sub ?? "From your own reflections — where your energy tends to live these days."}
        </p>
      </div>
      <div className="rounded-lg border border-line bg-white p-6 shadow-soft">
        <SpiralView score={data.spiralScore} practitionerCenter={data.spiralScore.practitionerCenter} />
      </div>
    </section>
  );
}
