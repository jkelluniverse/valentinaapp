import { prisma } from "@/lib/prisma";
import {
  parseFields,
  answerableFields,
  fieldLabel,
  type WorksheetField,
  type FieldLocale,
} from "@/lib/worksheet-meta";

// C42-PRACTITIONER-FORMS (ruling 225) — the booking form's questions are a
// worksheet flagged `isBooking`, edited in the worksheet builder she already
// has. This module is the ONE place that decides which fields the public
// /book form shows, validates a submission against them (law 5: the server
// validates; the HTML attribute is decoration), and turns the answers into the
// Rule 0.8 snapshot that lands on Lead.intakeAnswers.

/** The two fields booking itself needs. Rendered by BookingFlow unconditionally,
 *  validated at actions.ts, never in the worksheet schema — the builder cannot
 *  remove, reorder below, or make optional what booking needs to notify anyone. */
export const STRUCTURAL_FIELD_IDS = ["name", "email"] as const;

/** TODAY'S form, exactly (C42 §2.2) — frozen; the gate diffs /book against it.
 *  A practice with no `isBooking` worksheet renders these and nothing else.
 *  Spanish labels exist so ruling 233's catalogue reaches these two fields too;
 *  the English rendering is byte-for-byte the pre-C42 form. */
export const DEFAULT_BOOKING_FIELDS: readonly WorksheetField[] = Object.freeze([
  Object.freeze({ id: "phone", type: "SHORT_TEXT", label: "Phone", required: false, labels: { en: "Phone", es: "Teléfono" } }),
  Object.freeze({ id: "note", type: "LONG_TEXT", label: "What brings you?", required: false, labels: { en: "What brings you?", es: "¿Qué te trae por aquí?" } }),
] as WorksheetField[]);

export type IntakeAnswer = { q: string; a: string | string[] | number | boolean };
/** Lead.intakeAnswers — ONE shape for every writer (C42 §2.3):
 *    her form:  { [fieldId]: { q, a } }
 *    Calendly:  { "ext:<n>": { q, a } }   (lib/scheduling/external/calendly.ts)
 *  `q` is the label as rendered to that person at that moment (Rule 0.8). */
export type IntakeAnswers = Record<string, IntakeAnswer>;

export function isExternalAnswerKey(key: string): boolean {
  return key.startsWith("ext:");
}

/** A field whose id collides with a structural field is refused at save
 *  (C42 §2.4) and, defensively, dropped at render — so even a hand-edited
 *  schema cannot put a second "email" on the form. */
export function rejectStructuralIds(fields: WorksheetField[]): { ok: true } | { ok: false; id: string } {
  for (const f of fields) if ((STRUCTURAL_FIELD_IDS as readonly string[]).includes(f.id)) return { ok: false, id: f.id };
  return { ok: true };
}
function stripStructural(fields: WorksheetField[]): WorksheetField[] {
  return fields.filter((f) => !(STRUCTURAL_FIELD_IDS as readonly string[]).includes(f.id));
}

/** The booking worksheet of the request's practice, or null. Scoped by the
 *  request's tenant like every other read. Inactive = treated as absent, so
 *  deactivating it restores the default form rather than a blank one. */
export async function bookingWorksheet(): Promise<{ id: string; fields: WorksheetField[] } | null> {
  const ws = await prisma.worksheet.findFirst({ where: { isBooking: true, active: true }, select: { id: true, schema: true } });
  if (!ws) return null;
  return { id: ws.id, fields: stripStructural(parseFields(ws.schema)) };
}

/** What /book renders and what submitBooking validates against. */
export async function bookingFormFields(): Promise<WorksheetField[]> {
  const ws = await bookingWorksheet();
  return ws ? ws.fields : [...DEFAULT_BOOKING_FIELDS];
}

/** Created on first visit to the BUILDER (never on a public render — a
 *  stranger's page view must not write). From the default constant, so her
 *  first sight of the builder is today's form, ready to be made required. */
export async function ensureBookingWorksheet(practitionerId: string): Promise<string> {
  const existing = await prisma.worksheet.findFirst({ where: { isBooking: true }, select: { id: true } });
  if (existing) return existing.id;
  const created = await prisma.worksheet.create({
    data: {
      title: "Booking questions",
      intro: null,
      schema: DEFAULT_BOOKING_FIELDS.map((f) => ({ ...f })) as object[],
      isBooking: true,
      active: true,
      createdById: practitionerId,
      sourceNote: "Your booking form (C42) — these questions appear on /book under name and email",
    },
    select: { id: true },
  });
  return created.id;
}

export function isBlank(v: FormDataEntryValue | FormDataEntryValue[] | null): boolean {
  if (v == null) return true;
  if (Array.isArray(v)) return v.every((x) => typeof x !== "string" || x.trim() === "");
  return typeof v !== "string" || v.trim() === "";
}

/** Law 5 — the server decides. Returns the first required field left blank. */
export function firstMissingRequired(fields: WorksheetField[], formData: FormData): string | null {
  for (const f of answerableFields(fields)) {
    if (!f.required) continue;
    const vals = formData.getAll(f.id);
    if (f.type === "CHECKBOX") {
      if (!vals.some((v) => v === "on" || v === "true" || v === "1")) return f.id;
      continue;
    }
    if (vals.length === 0 || isBlank(vals.length === 1 ? vals[0] : vals)) return f.id;
  }
  return null;
}

/** The snapshot: every answered field, keyed by id, carrying the label AS
 *  RENDERED in the visitor's locale. Blank answers are omitted (an unanswered
 *  optional question is not an answer). */
export function collectBookingAnswers(fields: WorksheetField[], formData: FormData, locale: FieldLocale): IntakeAnswers {
  const out: IntakeAnswers = {};
  for (const f of answerableFields(fields)) {
    const vals = formData.getAll(f.id).filter((v): v is string => typeof v === "string");
    const q = fieldLabel(f, locale);
    switch (f.type) {
      case "CHECKBOX": {
        const on = vals.some((v) => v === "on" || v === "true" || v === "1");
        if (on) out[f.id] = { q, a: true };
        break;
      }
      case "MULTI_CHOICE": {
        const picked = vals.map((v) => v.trim()).filter(Boolean);
        if (picked.length) out[f.id] = { q, a: picked };
        break;
      }
      case "SCALE": {
        const n = Number(vals[0]);
        if (vals[0] != null && vals[0].trim() !== "" && Number.isFinite(n)) out[f.id] = { q, a: n };
        break;
      }
      default: {
        const text = (vals[0] ?? "").trim();
        if (text) out[f.id] = { q, a: text };
      }
    }
  }
  return out;
}

/** The two compatibility columns (C42 §2.3): phone and note keep writing their
 *  Lead columns for every reader that exists today. Read from the snapshot so
 *  there is ONE source — a practice that deleted the phone question simply
 *  writes null. */
export function compatibilityColumns(answers: IntakeAnswers): { phone: string | null; note: string | null } {
  const text = (k: string) => { const a = answers[k]?.a; return typeof a === "string" && a.trim() ? a.trim() : null; };
  return { phone: text("phone"), note: text("note") };
}
