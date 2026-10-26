import { CHANNELS, GATE_CENTER, channelKey, type Center } from "@/lib/human-design/wheel";

// An original bodygraph rendering (server component, pure SVG — no client JS).
// Defined centers fill wine; open centers stay cream-outlined. Each channel
// draws in two halves so a "hanging" activated gate shows as a colored half.

const WINE = "#580C22";
const MOCHA = "#B79175";
const LINE = "#EAEAEA";
const CREAM = "#FEF4EA";
const INK = "#4D4B49";

type Pt = [number, number];

const CENTER_SHAPES: Record<Center, { points: Pt[]; label: Pt }> = {
  Head: { points: [[180, 14], [210, 58], [150, 58]], label: [180, 46] },
  Ajna: { points: [[150, 74], [210, 74], [180, 118]], label: [180, 90] },
  Throat: { points: [[152, 150], [208, 150], [208, 206], [152, 206]], label: [180, 181] },
  G: { points: [[180, 236], [214, 270], [180, 304], [146, 270]], label: [180, 274] },
  Heart: { points: [[238, 308], [270, 296], [258, 330]], label: [256, 315] },
  Sacral: { points: [[152, 392], [208, 392], [208, 448], [152, 448]], label: [180, 423] },
  Spleen: { points: [[38, 378], [96, 420], [38, 462]], label: [58, 423] },
  SolarPlexus: { points: [[322, 378], [322, 462], [264, 420]], label: [300, 423] },
  Root: { points: [[152, 484], [208, 484], [208, 540], [152, 540]], label: [180, 515] },
};

// Where each gate meets its center's border (hand-laid to the classic layout).
const GATE_ANCHOR: Record<number, Pt> = {
  // Head
  64: [164, 58], 61: [180, 58], 63: [196, 58],
  // Ajna
  47: [164, 74], 24: [180, 74], 4: [196, 74],
  17: [166, 96], 43: [180, 112], 11: [194, 96],
  // Throat
  62: [168, 150], 23: [180, 150], 56: [192, 150],
  16: [152, 162], 20: [152, 178],
  35: [208, 166], 12: [208, 180], 45: [208, 198],
  31: [166, 206], 8: [180, 206], 33: [194, 206],
  // G
  1: [180, 236], 7: [163, 253], 13: [197, 253],
  10: [146, 270], 25: [214, 270],
  15: [163, 287], 46: [197, 287], 2: [180, 304],
  // Heart
  21: [254, 301], 51: [243, 307], 26: [249, 321], 40: [265, 314],
  // Sacral
  5: [166, 392], 14: [180, 392], 29: [194, 392],
  34: [152, 398], 27: [152, 428], 59: [208, 424],
  42: [166, 448], 3: [180, 448], 9: [194, 448],
  // Spleen
  48: [58, 392], 44: [72, 402], 57: [88, 414],
  50: [92, 424], 32: [76, 434], 28: [62, 444], 18: [50, 453],
  // Solar plexus
  36: [296, 397], 22: [284, 406], 37: [272, 414],
  6: [268, 422], 49: [276, 429], 55: [288, 437], 30: [300, 446],
  // Root
  53: [166, 484], 60: [180, 484], 52: [194, 484],
  54: [152, 500], 38: [152, 514], 58: [152, 528],
  19: [208, 500], 39: [208, 514], 41: [208, 528],
};

// Curved channels (long laterals) get a quadratic control point so they bow
// around the centers instead of cutting through them.
const CURVE: Record<string, Pt> = {
  [channelKey(20, 34)]: [124, 288],
  [channelKey(20, 57)]: [106, 298],
  [channelKey(10, 57)]: [108, 332],
  [channelKey(16, 48)]: [92, 270],
  [channelKey(35, 36)]: [268, 270],
  [channelKey(12, 22)]: [256, 286],
  [channelKey(45, 21)]: [240, 248],
  [channelKey(26, 44)]: [168, 376],
};

function mid(a: Pt, b: Pt, c?: Pt): Pt {
  if (!c) return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  // Quadratic Bézier point at t = 0.5.
  return [(a[0] + 2 * c[0] + b[0]) / 4, (a[1] + 2 * c[1] + b[1]) / 4];
}

function halfPath(from: Pt, to: Pt, control?: Pt): string {
  if (!control) {
    const m = mid(from, to);
    return `M ${from[0]} ${from[1]} L ${m[0]} ${m[1]}`;
  }
  // First half of the quadratic, split at t = 0.5.
  const c1: Pt = [(from[0] + control[0]) / 2, (from[1] + control[1]) / 2];
  const m = mid(from, to, control);
  return `M ${from[0]} ${from[1]} Q ${c1[0]} ${c1[1]} ${m[0]} ${m[1]}`;
}

export function Bodygraph({
  centers,
  activeGates,
  activeChannels,
  className = "",
}: {
  centers: Record<string, "defined" | "open">;
  activeGates: number[];
  activeChannels: string[];
  className?: string;
}) {
  const gateSet = new Set(activeGates);
  const channelSet = new Set(activeChannels);

  return (
    <svg
      viewBox="0 0 360 560"
      role="img"
      aria-label="Bodygraph chart"
      className={`h-auto w-full max-w-[360px] ${className}`}
    >
      {/* Channels underneath the centers */}
      {CHANNELS.map(([a, b]) => {
        const key = channelKey(a, b);
        const control = CURVE[key];
        const whole = channelSet.has(key);
        const halves: { gate: number; d: string }[] = [
          { gate: a, d: halfPath(GATE_ANCHOR[a], GATE_ANCHOR[b], control) },
          {
            gate: b,
            d: halfPath(
              GATE_ANCHOR[b],
              GATE_ANCHOR[a],
              control ? ([control[0], control[1]] as Pt) : undefined,
            ),
          },
        ];
        return (
          <g key={key}>
            {halves.map((h) => (
              <path
                key={h.gate}
                d={h.d}
                fill="none"
                stroke={whole ? WINE : gateSet.has(h.gate) ? MOCHA : LINE}
                strokeWidth={whole ? 5 : gateSet.has(h.gate) ? 4 : 2.5}
                strokeLinecap="round"
              />
            ))}
          </g>
        );
      })}

      {/* Centers */}
      {Object.entries(CENTER_SHAPES).map(([name, shape]) => {
        const defined = centers[name] === "defined";
        return (
          <g key={name}>
            <polygon
              points={shape.points.map((p) => p.join(",")).join(" ")}
              fill={defined ? WINE : CREAM}
              stroke={defined ? WINE : MOCHA}
              strokeWidth={1.5}
            />
          </g>
        );
      })}

      {/* Gate dots + numbers for activated gates */}
      {Array.from(gateSet).map((gate) => {
        const anchor = GATE_ANCHOR[gate];
        if (!anchor) return null;
        const onDefined = centers[GATE_CENTER[gate]] === "defined";
        return (
          <g key={gate}>
            <circle cx={anchor[0]} cy={anchor[1]} r={7.5} fill={onDefined ? CREAM : "#fff"} stroke={WINE} strokeWidth={1} />
            <text
              x={anchor[0]}
              y={anchor[1] + 2.6}
              textAnchor="middle"
              fontSize="7.5"
              fontWeight="600"
              fill={INK}
            >
              {gate}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
