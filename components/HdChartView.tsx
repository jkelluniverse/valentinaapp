import type { HumanDesignChart } from "@prisma/client";
import { Bodygraph } from "@/components/Bodygraph";
import { CENTERS, type Center } from "@/lib/human-design/wheel";
import {
  TYPE_MEANING,
  AUTHORITY_MEANING,
  CENTER_LABEL,
  CENTER_MEANING,
  LINE_MEANING,
  DEFINITION_MEANING,
  REFLECTIVE_FRAMING,
} from "@/lib/human-design/meaning";
import type { Activation } from "@/lib/human-design/engine";

// The chart, rendered for either audience. All copy is original (meaning.ts)
// and framed as reflection, not assessment.

const PLANET_LABEL: Record<string, string> = {
  Sun: "Sun",
  Earth: "Earth",
  Moon: "Moon",
  NorthNode: "North node",
  SouthNode: "South node",
  Mercury: "Mercury",
  Venus: "Venus",
  Mars: "Mars",
  Jupiter: "Jupiter",
  Saturn: "Saturn",
  Uranus: "Uranus",
  Neptune: "Neptune",
  Pluto: "Pluto",
};

function activations(chart: HumanDesignChart, side: "personality" | "design"): Activation[] {
  const gates = chart.gates as { personality?: Activation[]; design?: Activation[] } | null;
  return gates?.[side] ?? [];
}

export function HdChartView({ chart }: { chart: HumanDesignChart }) {
  const personality = activations(chart, "personality");
  const design = activations(chart, "design");
  const activeGates = [...personality, ...design].map((a) => a.gate);
  const centers = (chart.centers ?? {}) as Record<string, "defined" | "open">;
  const channels = (chart.channels ?? []) as string[];
  const [pLine, dLine] = (chart.profile ?? "").split("/").map((n) => Number(n));

  return (
    <div className="flex flex-col gap-8">
      {chart.accuracyNote && (
        <p className="rounded-md border border-mocha bg-cream px-4 py-3 text-sm text-ink">
          {chart.accuracyNote}
        </p>
      )}

      {/* The essentials */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-line bg-white p-5 shadow-soft sm:col-span-2">
          <p className="text-label font-semibold uppercase tracking-wide text-mocha">Type</p>
          <p className="mt-1 text-2xl font-semibold text-wine">{chart.type}</p>
          {chart.type && TYPE_MEANING[chart.type] && (
            <p className="mt-2 max-w-prose leading-relaxed text-ink">{TYPE_MEANING[chart.type]}</p>
          )}
        </div>
        <div className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <p className="text-label font-semibold uppercase tracking-wide text-mocha">Strategy</p>
          <p className="mt-1 text-lg font-semibold text-ink-strong">{chart.strategy}</p>
        </div>
        <div className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <p className="text-label font-semibold uppercase tracking-wide text-mocha">Authority</p>
          <p className="mt-1 text-lg font-semibold text-ink-strong">{chart.authority}</p>
          {chart.authority && AUTHORITY_MEANING[chart.authority] && (
            <p className="mt-2 text-sm leading-relaxed text-ink">
              {AUTHORITY_MEANING[chart.authority]}
            </p>
          )}
        </div>
        <div className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <p className="text-label font-semibold uppercase tracking-wide text-mocha">Profile</p>
          <p className="mt-1 text-lg font-semibold text-ink-strong">{chart.profile}</p>
          {pLine > 0 && dLine > 0 && LINE_MEANING[pLine] && LINE_MEANING[dLine] && (
            <p className="mt-2 text-sm leading-relaxed text-ink">
              {pLine} is {LINE_MEANING[pLine]}; {dLine} is {LINE_MEANING[dLine]}.
            </p>
          )}
        </div>
        <div className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <p className="text-label font-semibold uppercase tracking-wide text-mocha">Definition</p>
          <p className="mt-1 text-lg font-semibold text-ink-strong">{chart.definition}</p>
          {chart.definition && DEFINITION_MEANING[chart.definition] && (
            <p className="mt-2 text-sm leading-relaxed text-ink">
              {DEFINITION_MEANING[chart.definition]}
            </p>
          )}
        </div>
      </div>

      {/* Bodygraph + centers */}
      <div className="grid gap-6 md:grid-cols-[minmax(0,360px)_1fr]">
        <div className="rounded-lg border border-line bg-white p-4 shadow-soft">
          <Bodygraph centers={centers} activeGates={activeGates} activeChannels={channels} />
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-lg font-semibold">Centers</h3>
          {CENTERS.map((c: Center) => {
            const defined = centers[c] === "defined";
            return (
              <div
                key={c}
                className="flex flex-col gap-0.5 rounded-md border border-line/70 bg-white px-4 py-2.5"
              >
                <p className="text-sm font-medium text-ink-strong">
                  <span
                    className={`mr-2 inline-block h-2.5 w-2.5 rounded-full ${
                      defined ? "bg-wine" : "border border-mocha bg-cream"
                    }`}
                  />
                  {CENTER_LABEL[c]} · {defined ? "defined" : "open"}
                </p>
                <p className="text-xs leading-relaxed text-slate">
                  {CENTER_MEANING[c][defined ? "defined" : "open"]}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Channels + activations */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <h3 className="mb-2 text-lg font-semibold">Active channels</h3>
          {channels.length === 0 ? (
            <p className="text-sm text-slate">
              No full channels — a fully open chart samples the world around it.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {channels.map((ch) => (
                <li
                  key={ch}
                  className="rounded-full bg-blush-deep px-3 py-1 text-sm font-medium text-wine"
                >
                  {ch.replace("-", " – ")}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-lg border border-line bg-white p-5 shadow-soft">
          <h3 className="mb-2 text-lg font-semibold">Gate activations</h3>
          <div className="grid grid-cols-2 gap-x-4 text-sm">
            <div>
              <p className="mb-1 text-label font-semibold uppercase tracking-wide text-mocha">
                Personality
              </p>
              {personality.map((a) => (
                <p key={a.planet} className="flex justify-between text-ink">
                  <span className="text-slate">{PLANET_LABEL[a.planet]}</span>
                  <span className="font-medium">
                    {a.gate}.{a.line}
                  </span>
                </p>
              ))}
            </div>
            <div>
              <p className="mb-1 text-label font-semibold uppercase tracking-wide text-mocha">
                Design
              </p>
              {design.map((a) => (
                <p key={a.planet} className="flex justify-between text-ink">
                  <span className="text-slate">{PLANET_LABEL[a.planet]}</span>
                  <span className="font-medium">
                    {a.gate}.{a.line}
                  </span>
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>

      <p className="max-w-prose text-sm leading-relaxed text-slate">{REFLECTIVE_FRAMING}</p>
    </div>
  );
}
