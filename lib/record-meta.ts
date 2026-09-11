import type { RecordKind } from "@prisma/client";

// Display vocabulary for the unified record timeline.
export const RECORD_KINDS: { value: RecordKind; label: string; pill: string }[] = [
  { value: "LOG_ENTRY", label: "Moment", pill: "bg-blush text-wine" },
  { value: "PROMPT_RESPONSE", label: "Response", pill: "border border-mocha text-mocha" },
  { value: "WORKSHEET_RESPONSE", label: "Worksheet", pill: "bg-blush-deep text-wine" },
  { value: "COURSE_ACTIVITY", label: "Course", pill: "bg-cream text-ink" },
  { value: "NOTE", label: "Note", pill: "bg-line/50 text-slate" },
  { value: "MESSAGE", label: "Message", pill: "border border-mocha text-mocha" },
];

export function recordKindLabel(kind: RecordKind) {
  return RECORD_KINDS.find((k) => k.value === kind)?.label ?? kind;
}

export function recordKindPill(kind: RecordKind) {
  return RECORD_KINDS.find((k) => k.value === kind)?.pill ?? "bg-line/50 text-slate";
}
