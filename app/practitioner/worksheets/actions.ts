"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { draftWorksheet } from "@/lib/worksheet-author";
import { buildReferenceBlocks } from "@/lib/reference-input";
import { parseFields, FIELD_TYPES, type FieldType, type WorksheetField } from "@/lib/worksheet-meta";
import { rejectStructuralIds } from "@/lib/booking-form";

const WORKSHEETS = "/practitioner/worksheets";
const builderPath = (id: string) => `${WORKSHEETS}/${id}`;

// Studio (C9.3): describe or paste a reference → AI draft → straight into the
// builder for her to edit. Or start blank.
export async function draftFromStudio(formData: FormData) {
  const practitioner = await requirePractitioner();
  const description = String(formData.get("description") ?? "").trim();

  const reference = await buildReferenceBlocks(formData);
  if (!reference.ok) redirect(`${WORKSHEETS}/new?error=${reference.error}`);

  const result = await draftWorksheet(description, reference.blocks);
  if (!result.ok) redirect(`${WORKSHEETS}/new?error=${result.error}`);

  const worksheet = await prisma.worksheet.create({
    data: {
      title: result.title,
      intro: result.intro || null,
      schema: result.fields as object[],
      createdById: practitioner.id,
      sourceNote: reference.had
        ? "Drafted with AI from reference material (concept/structure only)"
        : "Drafted with AI from a description",
    },
  });

  revalidatePath(WORKSHEETS);
  redirect(`${builderPath(worksheet.id)}?drafted=1`);
}

export async function createBlankWorksheet() {
  const practitioner = await requirePractitioner();
  const worksheet = await prisma.worksheet.create({
    data: {
      title: "Untitled worksheet",
      schema: [
        { id: randomUUID(), type: "LONG_TEXT", label: "What's here right now?" },
      ] as object[],
      createdById: practitioner.id,
    },
  });
  revalidatePath(WORKSHEETS);
  redirect(builderPath(worksheet.id));
}

export async function duplicateWorksheet(worksheetId: string) {
  const practitioner = await requirePractitioner();
  const src = await prisma.worksheet.findUnique({ where: { id: worksheetId } });
  if (!src) redirect(WORKSHEETS);
  // Fresh field ids so the copy is fully independent.
  const fields = parseFields(src.schema).map((f) => ({ ...f, id: randomUUID() }));
  const copy = await prisma.worksheet.create({
    data: {
      title: `${src.title} (copy)`,
      intro: src.intro,
      schema: fields as object[],
      createdById: practitioner.id,
      sourceNote: src.sourceNote,
    },
  });
  revalidatePath(WORKSHEETS);
  redirect(builderPath(copy.id));
}

export async function setWorksheetActive(worksheetId: string, active: boolean) {
  await requirePractitioner();
  await prisma.worksheet.update({ where: { id: worksheetId }, data: { active } });
  revalidatePath(WORKSHEETS);
  redirect(WORKSHEETS);
}

// AMD-05 A5.5 — C9 studio: AI drafts the Spanish version, she approves.
// Creates an INACTIVE es sibling (translationOfId → original) with identical
// field ids/types — translated display text only — then drops her into the
// builder to review. Activating it (the toggle below, or the library toggle)
// is the approval.
export async function createSpanishVersion(worksheetId: string) {
  const practitioner = await requirePractitioner();
  const src = await prisma.worksheet.findUnique({ where: { id: worksheetId } });
  if (!src) redirect(WORKSHEETS);
  if (src.locale !== "en") redirect(builderPath(src.id));

  // Already has a Spanish sibling (either direction of the link)? Go there.
  const existing = await prisma.worksheet.findFirst({
    where: {
      locale: "es",
      OR: [
        { translationOfId: src.id },
        ...(src.translationOfId ? [{ id: src.translationOfId }] : []),
      ],
    },
    select: { id: true },
  });
  if (existing) redirect(builderPath(existing.id));

  const fields = parseFields(src.schema);
  const result = await draftWorksheet("", [], {
    translateFrom: { title: src.title, intro: src.intro, schema: fields },
    targetLocale: "es",
  });
  if (!result.ok) redirect(`${builderPath(src.id)}?error=${result.error}`);

  const spanish = await prisma.worksheet.create({
    data: {
      title: result.title,
      intro: result.intro || null,
      schema: result.fields as object[],
      locale: "es",
      translationOfId: src.id,
      active: false, // a draft until she approves by activating
      createdById: practitioner.id,
      sourceNote: "AI-drafted Spanish version — review, then activate to serve it",
    },
  });

  revalidatePath(WORKSHEETS);
  redirect(`${builderPath(spanish.id)}?drafted=1`);
}

// Activate/deactivate from inside the builder (the library toggle redirects
// away; approving a Spanish draft should keep her where she's reviewing).
export async function toggleWorksheetActiveInBuilder(worksheetId: string) {
  await requirePractitioner();
  const ws = await prisma.worksheet.findUnique({
    where: { id: worksheetId },
    select: { active: true },
  });
  if (!ws) redirect(WORKSHEETS);
  await prisma.worksheet.update({ where: { id: worksheetId }, data: { active: !ws.active } });
  revalidatePath(builderPath(worksheetId));
  redirect(builderPath(worksheetId));
}

// Builder autosave targets.
export async function saveWorksheetField(worksheetId: string, formData: FormData) {
  await requirePractitioner();
  const title = formData.get("title");
  const intro = formData.get("intro");
  await prisma.worksheet.update({
    where: { id: worksheetId },
    data: {
      ...(title != null ? { title: String(title).trim() || "Untitled worksheet" } : {}),
      ...(intro != null ? { intro: String(intro).trim() || null } : {}),
    },
  });
  revalidatePath(builderPath(worksheetId));
}

async function mutateFields(worksheetId: string, fn: (fields: WorksheetField[]) => WorksheetField[]) {
  const worksheet = await prisma.worksheet.findUnique({ where: { id: worksheetId } });
  if (!worksheet) return;
  const fields = fn(parseFields(worksheet.schema));
  // C42 §2.4 — the booking form's structural fields (name, email) are not
  // questions and have no row here; a field that claims one of their ids is
  // refused on save with a NAMED error, never silently dropped.
  if (worksheet.isBooking) {
    const verdict = rejectStructuralIds(fields);
    if (!verdict.ok) redirect(`${builderPath(worksheetId)}?error=structural&field=${encodeURIComponent(verdict.id)}`);
  }
  await prisma.worksheet.update({
    where: { id: worksheetId },
    data: { schema: fields as object[] },
  });
  revalidatePath(builderPath(worksheetId));
}

export async function addField(worksheetId: string, type: FieldType) {
  await requirePractitioner();
  if (!FIELD_TYPES.includes(type)) return;
  await mutateFields(worksheetId, (fields) => [
    ...fields,
    {
      id: randomUUID(),
      type,
      label: type === "SECTION" ? "New section" : "New question",
      ...(type === "SINGLE_CHOICE" || type === "MULTI_CHOICE" ? { options: ["Option one", "Option two"] } : {}),
    },
  ]);
  redirect(builderPath(worksheetId));
}

export async function updateField(worksheetId: string, fieldId: string, formData: FormData) {
  await requirePractitioner();
  const label = formData.get("label");
  const help = formData.get("help");
  const options = formData.get("options");
  const required = formData.get("required");
  // C42 §2.6 — the Spanish label/help, additive; `es` falls back to `en`.
  const labelEs = formData.get("labelEs");
  const helpEs = formData.get("helpEs");

  await mutateFields(worksheetId, (fields) =>
    fields.map((f) => {
      if (f.id !== fieldId) return f;
      const next = { ...f };
      if (label != null) {
        next.label = String(label).trim() || "Untitled";
        if (next.labels) next.labels = { ...next.labels, en: next.label };
      }
      if (help != null) {
        const h = String(help).trim();
        if (h) next.help = h;
        else delete next.help;
        if (next.helps) { if (h) next.helps = { ...next.helps, en: h }; else delete next.helps; }
      }
      if (labelEs != null) {
        const es = String(labelEs).trim();
        if (es) next.labels = { en: next.label, es };
        else if (next.labels) { const { es: _drop, ...rest } = next.labels; void _drop; next.labels = rest; }
      }
      if (helpEs != null) {
        const es = String(helpEs).trim();
        if (es) next.helps = { en: next.help ?? "", es };
        else if (next.helps) { const { es: _drop, ...rest } = next.helps; void _drop; next.helps = rest; }
      }
      if (options != null) {
        const opts = String(options)
          .split("\n")
          .map((o) => o.trim())
          .filter(Boolean);
        if (opts.length) next.options = opts;
        else delete next.options;
      }
      if (required != null) {
        if (String(required) === "on") next.required = true;
        else delete next.required;
      }
      return next;
    }),
  );
}

export async function toggleFieldRequired(worksheetId: string, fieldId: string) {
  await requirePractitioner();
  await mutateFields(worksheetId, (fields) =>
    fields.map((f) => (f.id === fieldId ? { ...f, required: !f.required } : f)),
  );
  redirect(builderPath(worksheetId));
}

export async function moveField(worksheetId: string, fieldId: string, direction: "up" | "down") {
  await requirePractitioner();
  await mutateFields(worksheetId, (fields) => {
    const i = fields.findIndex((f) => f.id === fieldId);
    const j = direction === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= fields.length) return fields;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });
  redirect(builderPath(worksheetId));
}

export async function deleteField(worksheetId: string, fieldId: string) {
  await requirePractitioner();
  await mutateFields(worksheetId, (fields) => fields.filter((f) => f.id !== fieldId));
  redirect(builderPath(worksheetId));
}
