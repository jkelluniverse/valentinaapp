// C12X §6 — THE confidence vocabulary. Six levels, practitioner-facing only
// (the client gets honesty in plain words, never this jargon). Every AI claim
// renders source + level together — "AI-generated interpretations must never
// be silently presented as confirmed client facts" is enforced by making this
// the only way claims are displayed.

export const CONFIDENCE_LEVELS = [
  "CONFIRMED",
  "SUPPORTED",
  "EMERGING",
  "SPECULATIVE",
  "CONTRADICTED",
  "RESOLVED",
] as const;

export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export const CONFIDENCE_LABEL: Record<ConfidenceLevel, string> = {
  CONFIRMED: "Confirmed",
  SUPPORTED: "Supported",
  EMERGING: "Emerging",
  SPECULATIVE: "Speculative",
  CONTRADICTED: "Contradicted",
  RESOLVED: "Resolved",
};

// One-line meanings for tooltips/inspectors — the document's definitions.
export const CONFIDENCE_MEANING: Record<ConfidenceLevel, string> = {
  CONFIRMED: "Stated or marked by the client directly, or repeatedly demonstrated.",
  SUPPORTED: "Multiple independent pieces of evidence point here.",
  EMERGING: "Crossed the proposal threshold — evidence still thin.",
  SPECULATIVE: "A chart or AI hypothesis with no lived corroboration yet.",
  CONTRADICTED: "Counter-evidence or the client's own 'doesn't fit' — retired from surfacing.",
  RESOLVED: "Worked through — no longer active, kept with honor.",
};

export function isConfidenceLevel(v: string): v is ConfidenceLevel {
  return (CONFIDENCE_LEVELS as readonly string[]).includes(v);
}

// Derive a map node's level from what the system already knows. Inputs are
// deliberately primitive so any caller (graph loader, prep payload, guide)
// can compute it without new queries.
export function nodeConfidence(n: {
  source: string; // NodeSource
  state: string; // NodeState
  evidenceCount: number;
  selfNamed?: boolean; // SELF_REPORTED / First-Map star
  latestResonance?: string | null; // ResonanceMark.value
}): ConfidenceLevel {
  if (n.latestResonance === "NO_LONGER" || n.state === "INTEGRATED") return "RESOLVED";
  if (n.state === "CONTRADICTED" || n.latestResonance === "DOESNT_FIT") return "CONTRADICTED";
  if (n.selfNamed || n.source === "SELF_REPORTED" || n.latestResonance === "FEELS_TRUE")
    return "CONFIRMED";
  if (n.source === "CHART_DERIVED" && n.evidenceCount === 0) return "SPECULATIVE";
  if (n.evidenceCount >= 5) return "CONFIRMED"; // dense direct evidence
  if (n.evidenceCount >= 3) return "SUPPORTED";
  return "EMERGING";
}
