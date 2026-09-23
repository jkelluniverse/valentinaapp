import type { Activation } from "@/lib/human-design/engine";

// The Gene Keys lens (C12.3): the Hologenetic Profile read from the SAME
// birth-data core as Human Design — compute once, interpret twice. The sphere
// POSITIONS (which key/line sits where) are mechanical facts computed here;
// the per-key DESCRIPTIONS are proprietary Gene Keys material (Richard Rudd),
// so the app ships only original framing copy in Valentina's voice and leaves
// per-key text to her (or a licensed source) — see C12 spec §7.

export const GENE_KEYS_CONTENT_REF = "positions-only · original-framing-1";

export type Side = "personality" | "design";

// The 11 spheres in their three sequences. Each sphere reads one planet from
// one side of the core — the mapping is data, so it's transparent and easy to
// adjust if Valentina's sources differ.
export const SPHERES: {
  key: string;
  label: string;
  sequence: "Activation" | "Venus" | "Pearl";
  planet: string;
  side: Side;
}[] = [
  { key: "lifesWork", label: "Life's Work", sequence: "Activation", planet: "Sun", side: "personality" },
  { key: "evolution", label: "Evolution", sequence: "Activation", planet: "Earth", side: "personality" },
  { key: "radiance", label: "Radiance", sequence: "Activation", planet: "Sun", side: "design" },
  { key: "purpose", label: "Purpose", sequence: "Activation", planet: "Earth", side: "design" },
  { key: "attraction", label: "Attraction", sequence: "Venus", planet: "Moon", side: "design" },
  { key: "iq", label: "IQ", sequence: "Venus", planet: "Venus", side: "design" },
  { key: "eq", label: "EQ", sequence: "Venus", planet: "Mars", side: "design" },
  { key: "sq", label: "SQ", sequence: "Venus", planet: "Venus", side: "personality" },
  { key: "vocation", label: "Vocation", sequence: "Pearl", planet: "Mars", side: "personality" },
  { key: "culture", label: "Culture", sequence: "Pearl", planet: "Jupiter", side: "design" },
  { key: "pearl", label: "Pearl", sequence: "Pearl", planet: "Jupiter", side: "personality" },
];

export type SpherePosition = {
  key: string;
  label: string;
  sequence: string;
  geneKey: number; // the key (same 64-gate wheel as HD)
  line: number;
  planet: string;
  side: Side;
};

export function computeSpheres(
  personality: Activation[],
  design: Activation[],
): SpherePosition[] {
  const bySide: Record<Side, Activation[]> = { personality, design };
  const out: SpherePosition[] = [];
  for (const s of SPHERES) {
    const act = bySide[s.side].find((a) => a.planet === s.planet);
    if (!act) continue;
    out.push({
      key: s.key,
      label: s.label,
      sequence: s.sequence,
      geneKey: act.gate,
      line: act.line,
      planet: s.planet,
      side: s.side,
    });
  }
  return out;
}

// Original framing copy — the concept of the spectrum, not Rudd's key texts.
export const SPECTRUM_FRAMING =
  "Each Gene Key describes a spectrum: a contracted expression (its shadow), an open one (its gift), and its fullest flowering. The invitation is contemplative — noticing where a pattern runs in your life, and how it softens when it's met with awareness rather than judgment.";

export const SEQUENCE_MEANING: Record<string, string> = {
  Activation:
    "The four prime spheres — what your life is here to do, how it evolves, how it radiates, and what it's for.",
  Venus: "The relational path — how you attract, think, feel, and love.",
  Pearl: "The prosperity path — how your gifts become useful to others.",
};
