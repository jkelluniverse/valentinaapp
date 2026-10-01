import type { AstroTime } from "astronomy-engine";
import {
  CENTERS,
  CHANNELS,
  GATE_CENTER,
  MOTOR_CENTERS,
  channelKey,
  gateFromLongitude,
  type Center,
  type GateLine,
} from "./wheel";
import { HD_PLANETS, MakeTime, allLongitudes, designTime, type HdPlanet } from "./ephemeris";

// The full in-house Human Design computation: birth instant (UTC) →
// Personality + Design activations → channels → defined centers → Type,
// Strategy, Authority, Profile, Definition. Purely mechanical; the meanings
// shown to people live in meaning.ts.

export type Activation = GateLine & { planet: HdPlanet };

export type HdChart = {
  type: string;
  strategy: string;
  authority: string;
  profile: string;
  definition: string;
  centers: Record<Center, "defined" | "open">;
  channels: string[]; // active channel keys, e.g. "10-20"
  personality: Activation[];
  design: Activation[];
  crossGates: { personalitySun: number; personalityEarth: number; designSun: number; designEarth: number };
  designAt: string; // ISO — the computed Design moment
};

const STRATEGY: Record<string, string> = {
  Generator: "To respond",
  "Manifesting Generator": "To respond, then inform",
  Manifestor: "To inform, then act",
  Projector: "To wait for the invitation",
  Reflector: "To wait a lunar cycle",
};

function activationsAt(time: AstroTime): Activation[] {
  const lons = allLongitudes(time);
  return HD_PLANETS.map((planet) => ({ planet, ...gateFromLongitude(lons[planet]) }));
}

export function computeChart(birthUtc: Date): HdChart {
  const personalityTime = MakeTime(birthUtc);
  const dTime = designTime(birthUtc);

  const personality = activationsAt(personalityTime);
  const design = activationsAt(dTime);

  const activeGates = new Set<number>([...personality, ...design].map((a) => a.gate));

  // Channels: both gates present (either side of the chart).
  const active = CHANNELS.filter(([a, b]) => activeGates.has(a) && activeGates.has(b));
  const channels = active.map(([a, b]) => channelKey(a, b));

  // Centers defined by active channels; adjacency for connectivity questions.
  const defined = new Set<Center>();
  const adjacency = new Map<Center, Set<Center>>();
  for (const [a, b] of active) {
    const ca = GATE_CENTER[a];
    const cb = GATE_CENTER[b];
    defined.add(ca);
    defined.add(cb);
    if (!adjacency.has(ca)) adjacency.set(ca, new Set());
    if (!adjacency.has(cb)) adjacency.set(cb, new Set());
    adjacency.get(ca)!.add(cb);
    adjacency.get(cb)!.add(ca);
  }

  const centers = Object.fromEntries(
    CENTERS.map((c) => [c, defined.has(c) ? "defined" : "open"]),
  ) as Record<Center, "defined" | "open">;

  const reach = (from: Center): Set<Center> => {
    const seen = new Set<Center>([from]);
    const queue: Center[] = [from];
    while (queue.length) {
      const c = queue.shift()!;
      for (const n of adjacency.get(c) ?? []) {
        if (!seen.has(n)) {
          seen.add(n);
          queue.push(n);
        }
      }
    }
    return seen;
  };

  // Type: sacral definition + whether any motor reaches the Throat.
  const throatReach = defined.has("Throat") ? reach("Throat") : new Set<Center>();
  const motorToThroat = MOTOR_CENTERS.some((m) => throatReach.has(m));
  const sacral = defined.has("Sacral");

  let type: string;
  if (defined.size === 0) type = "Reflector";
  else if (sacral) type = motorToThroat ? "Manifesting Generator" : "Generator";
  else if (motorToThroat) type = "Manifestor";
  else type = "Projector";

  // Authority: the standard hierarchy.
  let authority: string;
  if (type === "Reflector") authority = "Lunar";
  else if (defined.has("SolarPlexus")) authority = "Emotional";
  else if (sacral) authority = "Sacral";
  else if (defined.has("Spleen")) authority = "Splenic";
  else if (defined.has("Heart")) authority = throatReach.has("Heart") ? "Ego (manifested)" : "Ego (projected)";
  else if (defined.has("G") && throatReach.has("G")) authority = "Self-projected";
  else authority = "Mental (sounding board)";

  // Profile: Personality Sun line / Design Sun line.
  const pSun = personality.find((a) => a.planet === "Sun")!;
  const dSun = design.find((a) => a.planet === "Sun")!;
  const pEarth = personality.find((a) => a.planet === "Earth")!;
  const dEarth = design.find((a) => a.planet === "Earth")!;
  const profile = `${pSun.line}/${dSun.line}`;

  // Definition: connected components among defined centers.
  const seen = new Set<Center>();
  let components = 0;
  for (const c of defined) {
    if (seen.has(c)) continue;
    components++;
    for (const r of reach(c)) seen.add(r);
  }
  const definition =
    ["None", "Single", "Split", "Triple split", "Quadruple split"][components] ?? "Single";

  return {
    type,
    strategy: STRATEGY[type],
    authority,
    profile,
    definition,
    centers,
    channels,
    personality,
    design,
    crossGates: {
      personalitySun: pSun.gate,
      personalityEarth: pEarth.gate,
      designSun: dSun.gate,
      designEarth: dEarth.gate,
    },
    designAt: dTime.date.toISOString(),
  };
}
