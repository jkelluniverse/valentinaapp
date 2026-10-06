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

// C42 §2.6 — per-field bilingual text, ADDITIVE. `label`/`help` stay the
// English accessors every existing reader uses; `labels`/`helps` are optional
// and `es` falls back to `en`. One field, one order, one `required` flag, two
// labels — the only shape where "required" means one thing in both languages
// (the sibling-worksheet mechanism was rejected for the booking form because
// two schemas can silently disagree on what is required).
export type FieldText = { en: string; es?: string };
export type FieldLocale = "en" | "es";
export type WorksheetField = {
  id: string;
  type: FieldType;
  label: string;
  help?: string;
  options?: string[]; // for SINGLE_CHOICE / MULTI_CHOICE
  required?: boolean;
  labels?: FieldText;
  helps?: FieldText;
};

/** The label as RENDERED for a locale — `es` when present, else `en`/`label`. */
export function fieldLabel(f: WorksheetField, locale: FieldLocale = "en"): string {
  if (locale === "es" && f.labels?.es?.trim()) return f.labels.es.trim();
  return f.labels?.en?.trim() || f.label;
}
export function fieldHelp(f: WorksheetField, locale: FieldLocale = "en"): string | undefined {
  if (locale === "es" && f.helps?.es?.trim()) return f.helps.es.trim();
  return f.helps?.en?.trim() || f.help || undefined;
}

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
  ).map((f) => {
    // C42 — a malformed `labels`/`helps` (not an object with a string `en`)
    // is dropped rather than failing the whole schema: the field still has
    // its `label`, so nothing that rendered before stops rendering.
    const next = { ...f };
    if (next.labels && (typeof next.labels !== "object" || typeof next.labels.en !== "string")) delete next.labels;
    if (next.helps && (typeof next.helps !== "object" || typeof next.helps.en !== "string")) delete next.helps;
    return next;
  });
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
