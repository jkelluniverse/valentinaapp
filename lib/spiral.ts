import type { WorksheetField, WorksheetAnswers } from "@/lib/worksheet-meta";

// The Spiral lens (C12.4 — resolved: the developmental values-stage model).
// This is an ASSESSMENT lens: there's no ephemeris for someone's values — it
// comes from a questionnaire scored into stage weights, always read as a
// context-dependent BLEND with a center of gravity, never a fixed label.
//
// IP posture (spec §5c): the official instruments and the "Spiral Dynamics"
// mark are proprietary — so this questionnaire is ORIGINAL, written for this
// practice with its own stage names (informed by the public developmental
// stage model), editable in Valentina's worksheet studio. Statement wording
// can change; the field ids (spiral:<stage>:<n>) are what scoring reads.

export const SPIRAL_CONTENT_REF = "veritas-values-spiral-1";

export type SpiralStage = {
  key: string;
  label: string;
  theme: string; // original one-line description
};

export const STAGES: SpiralStage[] = [
  {
    key: "grounding",
    label: "Grounding",
    theme: "Safety, survival, and the body's basic needs coming first.",
  },
  {
    key: "belonging",
    label: "Belonging",
    theme: "Safety found in the group — tradition, loyalty, and kinship.",
  },
  {
    key: "drive",
    label: "Drive",
    theme: "Raw self-assertion — power, courage, and acting before asking.",
  },
  {
    key: "order",
    label: "Order",
    theme: "Meaning through structure — right and wrong, duty, and purpose.",
  },
  {
    key: "achievement",
    label: "Achievement",
    theme: "Progress through strategy — goals, results, and earned success.",
  },
  {
    key: "harmony",
    label: "Harmony",
    theme: "Belonging widened — empathy, consensus, and shared humanity.",
  },
  {
    key: "flow",
    label: "Flow",
    theme: "Seeing living systems — flexibility, integration, and both/and.",
  },
];

// Three original statements per stage, answered on the 1–5 scale. Valentina
// can rewrite any wording in the studio — ids must keep the spiral:<stage>:<n>
// shape for scoring.
const STATEMENTS: Record<string, string[]> = {
  grounding: [
    "When life gets intense, my first priority is simply feeling safe and physically settled.",
    "I make my best decisions only after my basic needs — rest, food, calm — are met.",
    "Stability matters more to me right now than growth or ambition.",
  ],
  belonging: [
    "Belonging to my people — family, community, tradition — anchors most of my choices.",
    "I feel most myself when I honor the customs and rhythms I was raised with.",
    "Letting down the group weighs more heavily on me than falling short personally.",
  ],
  drive: [
    "When I want something, I move — asking permission mostly slows life down.",
    "Respect is won; I'd rather be strong and direct than liked and careful.",
    "Rules feel optional when they stand between me and what I need.",
  ],
  order: [
    "Life works when there's a right way to do things and people honor it.",
    "Commitments and principles guide me even when they cost me something.",
    "I feel steadiest inside clear structure — roles, plans, and standards I can trust.",
  ],
  achievement: [
    "I naturally set goals, measure progress, and play to win.",
    "Optimizing — my time, my skills, my results — energizes me.",
    "I trust strategy and evidence over tradition or consensus.",
  ],
  harmony: [
    "Decisions feel right when everyone affected has truly been heard.",
    "I care more about authentic connection than status or being right.",
    "I notice the feelings in a room quickly, and tending them matters to me.",
  ],
  flow: [
    "I look for the system underneath a problem — patterns, not just events.",
    "I can hold two 'opposing' truths at once without needing one to win.",
    "Different situations call for different values — I move between them freely.",
  ],
};

export function spiralFieldId(stageKey: string, n: number): string {
  return `spiral:${stageKey}:${n}`;
}

// The original assessment as C9 worksheet fields (editable in the studio).
export function buildSpiralFields(): WorksheetField[] {
  const fields: WorksheetField[] = [
    {
      id: "spiral:intro",
      type: "SECTION",
      label: "How these statements work",
      help: "Rate how true each one feels in your life right now — not how you wish it were, and not forever. There are no better or worse answers; this maps where your energy currently lives.",
    },
  ];
  for (const stage of STAGES) {
    STATEMENTS[stage.key].forEach((label, i) => {
      fields.push({
        id: spiralFieldId(stage.key, i + 1),
        type: "SCALE",
        label,
        required: true,
      });
    });
  }
  return fields;
}

export type SpiralScore = {
  weights: { stage: string; label: string; weight: number }[]; // normalized 0..1, sorted desc
  centerOfGravity: string; // stage key with the highest weight
  answered: number;
  contentRef: string;
};

// Answers → normalized stage weights + center of gravity. Reads any field id
// shaped spiral:<stage>:<n>, so reworded or added statements keep scoring.
export function scoreSpiral(answers: WorksheetAnswers): SpiralScore | null {
  const sums = new Map<string, { total: number; count: number }>();
  let answered = 0;
  for (const [id, value] of Object.entries(answers)) {
    const m = /^spiral:([a-z]+):\d+$/.exec(id);
    if (!m) continue;
    const stage = m[1];
    if (!STAGES.some((s) => s.key === stage)) continue;
    const v = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(v) || v < 1 || v > 5) continue;
    const acc = sums.get(stage) ?? { total: 0, count: 0 };
    acc.total += v;
    acc.count += 1;
    sums.set(stage, acc);
    answered++;
  }
  if (answered === 0) return null;

  // Mean per stage, shifted to 0..4 so "1 = not me" contributes nothing,
  // then normalized across stages into a blend.
  const raw = STAGES.map((s) => {
    const acc = sums.get(s.key);
    const mean = acc && acc.count > 0 ? acc.total / acc.count : 1;
    return { stage: s.key, label: s.label, value: Math.max(0, mean - 1) };
  });
  const total = raw.reduce((a, r) => a + r.value, 0) || 1;
  const weights = raw
    .map((r) => ({ stage: r.stage, label: r.label, weight: Math.round((r.value / total) * 1000) / 1000 }))
    .sort((a, b) => b.weight - a.weight);

  return {
    weights,
    centerOfGravity: weights[0].stage,
    answered,
    contentRef: SPIRAL_CONTENT_REF,
  };
}

export function stageLabel(key: string): string {
  return STAGES.find((s) => s.key === key)?.label ?? key;
}

export function stageTheme(key: string): string {
  return STAGES.find((s) => s.key === key)?.theme ?? "";
}
