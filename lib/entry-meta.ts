import type { EntryType } from "@prisma/client";

// Display vocabulary for entry types. The enum values are the spec's default
// taxonomy — if Valentina names her own categories, change the labels here
// (and rename the enum in a migration); the model shape stays the same.
export const ENTRY_TYPES: { value: EntryType; label: string }[] = [
  { value: "REFLECTION", label: "Reflection" },
  { value: "TRIGGER", label: "Trigger" },
  { value: "INSIGHT", label: "Insight" },
  { value: "PROGRESS", label: "Win" },
];

export function entryTypeLabel(type: EntryType) {
  return ENTRY_TYPES.find((t) => t.value === type)?.label ?? type;
}

export const MOODS = [1, 2, 3, 4, 5] as const;
