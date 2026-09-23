import { HdChartView } from "@/components/HdChartView";
import type { MapPanelProps } from "@/lib/modules/types";

// Module panel: body-graph. Renders the client's stored chart exactly as the
// design page always has — the panel is a frame, the data pipeline that fills
// HumanDesignChart is untouched (structured-content module, spec §5.1).

export function BodyGraphPanel({ data }: MapPanelProps) {
  if (!data.chart) return null;
  return <HdChartView chart={data.chart} />;
}
