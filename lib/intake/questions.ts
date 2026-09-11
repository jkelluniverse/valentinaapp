import { buildSpiralFields } from "@/lib/spiral";
import type { IntakeField } from "@/lib/modules/types";

// CLIENT-ONBOARDING §3C — question-set expansion. A module's intake schema
// declares a question-set REF (generic, in the registry); the concrete
// questions live in the module's own domain code. The values-spiral set is
// Valentina's existing assessment, migrated verbatim (Rule 5.1) — the same
// buildSpiralFields() that already drives her worksheet assessment, so her
// clients' existing spiral data and the scorer are untouched.

export type ConcreteField = {
  key: string;
  label: string;
  kind: "text" | "email" | "date" | "time" | "place" | "select" | "textarea" | "scale";
  required: boolean;
  options?: string[];
  help?: string;
  timeUnknown?: "degrade" | "hide";
};

// Map a values worksheet field to a concrete intake field. Keys are prefixed
// so answers land under "values.<fieldId>" — the scorer reads them back by
// the same worksheet field ids.
function fromWorksheetField(f: ReturnType<typeof buildSpiralFields>[number]): ConcreteField {
  const kind: ConcreteField["kind"] =
    f.type === "SCALE" ? "scale" : f.type === "LONG_TEXT" ? "textarea" : f.type === "SINGLE_CHOICE" || f.type === "MULTI_CHOICE" ? "select" : "text";
  return {
    key: `values.${f.id}`,
    label: f.label,
    kind,
    required: Boolean(f.required),
    options: f.options,
    help: f.help,
  };
}

// Resolve a question-set ref to its concrete answerable fields. SECTION
// headers are display-only in the worksheet builder and never scored, so
// they are dropped from the answerable set.
export function resolveQuestionSet(ref: string): ConcreteField[] {
  if (ref === "values-spiral-v1") {
    return buildSpiralFields()
      .filter((f) => f.type !== "SECTION")
      .map(fromWorksheetField);
  }
  return [];
}

// Expand a plain (non-question-set) intake requirement into a concrete field.
export function concreteFromRequirement(f: IntakeField): ConcreteField {
  const kind: ConcreteField["kind"] =
    f.kind === "question-set" ? "text" : (f.kind as ConcreteField["kind"]);
  return { key: f.key, label: f.label, kind, required: f.required, timeUnknown: f.timeUnknown };
}
