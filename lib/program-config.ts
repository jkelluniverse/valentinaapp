// The program stages (C13.1). Config-driven, never hard-coded in the UI: the
// names below are the working defaults from Valentina's method worksheet —
// rename them HERE and every chip, filter, and stage-rate follows.

export type ProgramStage = { key: string; label: string; blurb: string };

export const PROGRAM_STAGES: ProgramStage[] = [
  {
    key: "stabilize",
    label: "Stabilize",
    blurb: "Grounding first — settling the nervous system and daily rhythms.",
  },
  {
    key: "rewire",
    label: "Rewire",
    blurb: "The core work — meeting and shifting the beliefs underneath.",
  },
  {
    key: "integrate",
    label: "Integrate",
    blurb: "Living it — carrying the change into relationships and work.",
  },
];

export function stageByKey(key: string | null | undefined): ProgramStage | null {
  if (!key) return null;
  return PROGRAM_STAGES.find((s) => s.key === key) ?? null;
}

export function programStageLabel(key: string | null | undefined): string | null {
  return stageByKey(key)?.label ?? null;
}
