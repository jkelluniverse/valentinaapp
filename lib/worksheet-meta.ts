// The worksheet field system (C9 spec §4). The schema is an ordered array of
// typed fields stored as JSON — any worksheet shape, no migrations.

export const FIELD_TYPES = [
  "SHORT_TEXT",
  "LONG_TEXT",
  "SCALE",
  "SINGLE_CHOICE",
  "MULTI_CHOICE",
  "CHECKBOX",
  "SECTION",
] as const;

export type FieldType = (typeof FIELD_TYPES)[number];

export type WorksheetField = {
  id: string;
  type: FieldType;
  label: string;
  help?: string;
  options?: string[]; // for SINGLE_CHOICE / MULTI_CHOICE
  required?: boolean;
};

export const FIELD_TYPE_META: Record<FieldType, { label: string; add: string }> = {
  SECTION: { label: "Section", add: "Section header" },
  SHORT_TEXT: { label: "Short answer", add: "Short answer" },
  LONG_TEXT: { label: "Long answer", add: "Long answer" },
  SCALE: { label: "1–5 scale", add: "1–5 scale" },
  SINGLE_CHOICE: { label: "Pick one", add: "Pick one" },
  MULTI_CHOICE: { label: "Pick any", add: "Pick any" },
  CHECKBOX: { label: "Checkbox", add: "Checkbox" },
};

// Answers are { [fieldId]: string | number | boolean | string[] }.
export type WorksheetAnswers = Record<string, string | number | boolean | string[]>;

export function parseFields(schema: unknown): WorksheetField[] {
  if (!Array.isArray(schema)) return [];
  return schema.filter(
    (f): f is WorksheetField =>
      !!f &&
      typeof f === "object" &&
      typeof (f as WorksheetField).id === "string" &&
      FIELD_TYPES.includes((f as WorksheetField).type) &&
      typeof (f as WorksheetField).label === "string",
  );
}

export function answerableFields(fields: WorksheetField[]) {
  return fields.filter((f) => f.type !== "SECTION");
}

// A short text digest of the key answers, for the record-item snapshot.
export function answersDigest(fields: WorksheetField[], answers: WorksheetAnswers): string {
  const parts: string[] = [];
  for (const f of answerableFields(fields)) {
    const v = answers[f.id];
    if (v == null || v === "" || (Array.isArray(v) && v.length === 0)) continue;
    const shown = Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "yes" : "no") : String(v);
    parts.push(`${f.label}: ${shown}`);
    if (parts.join(" · ").length > 240) break;
  }
  return parts.join(" · ");
}
