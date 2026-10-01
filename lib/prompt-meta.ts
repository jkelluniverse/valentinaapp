import type { PromptKind } from "@prisma/client";

// Display vocabulary for library item kinds — config, not hard-coded in
// screens (C3 spec §6). Adjust labels to Valentina's language here.
export const PROMPT_KINDS: { value: PromptKind; label: string; clientLabel: string }[] = [
  { value: "PROMPT", label: "Prompt", clientLabel: "A prompt from Valentina" },
  { value: "EXERCISE", label: "Exercise", clientLabel: "An exercise from Valentina" },
  { value: "CHECK_IN", label: "Check-in", clientLabel: "A quick check-in" },
];

export function promptKindLabel(kind: PromptKind) {
  return PROMPT_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

export function promptKindClientLabel(kind: PromptKind) {
  return PROMPT_KINDS.find((k) => k.value === kind)?.clientLabel ?? kind;
}
