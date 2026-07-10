"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { draftWorksheet } from "@/lib/worksheet-author";
import { parseFields, FIELD_TYPES, type FieldType, type WorksheetField } from "@/lib/worksheet-meta";

const WORKSHEETS = "/practitioner/worksheets";
const builderPath = (id: string) => `${WORKSHEETS}/${id}`;

// Studio (C9.3): describe or paste a reference → AI draft → straight into the
// builder for her to edit. Or start blank.
export async function draftFromStudio(formData: FormData) {
  const practitioner = await requirePractitioner();
  const description = String(formData.get("description") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim();

  const result = await draftWorksheet(description, reference);
  if (!result.ok) redirect(`${WORKSHEETS}/new?error=${result.error}`);

  const worksheet = await prisma.worksheet.create({
    data: {
      title: result.title,
      intro: result.intro || null,
      schema: result.fields as object[],
      createdById: practitioner.id,
      sourceNote: reference ? "Drafted with AI from a reference (concept/structure only)" : "Drafted with AI from a description",
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

  await mutateFields(worksheetId, (fields) =>
    fields.map((f) => {
      if (f.id !== fieldId) return f;
      const next = { ...f };
      if (label != null) next.label = String(label).trim() || "Untitled";
      if (help != null) {
        const h = String(help).trim();
        if (h) next.help = h;
        else delete next.help;
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
