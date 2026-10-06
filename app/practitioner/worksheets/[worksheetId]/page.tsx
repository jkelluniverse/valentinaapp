import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { InlineField } from "@/components/InlineField";
import { parseFields, FIELD_TYPES, FIELD_TYPE_META } from "@/lib/worksheet-meta";
import {
  saveWorksheetField,
  addField,
  updateField,
  toggleFieldRequired,
  moveField,
  deleteField,
  createSpanishVersion,
  toggleWorksheetActiveInBuilder,
} from "../actions";
import { PendingButton } from "@/components/PendingButton";

export const dynamic = "force-dynamic";

const iconBtn =
  "rounded-md border border-line bg-white px-2 py-1 text-xs text-slate transition-colors hover:bg-blush hover:text-wine disabled:opacity-30";

// The worksheet builder (C9.2): a plain outline of typed fields. Everything
// autosaves; reorder and retype in place.
export default async function WorksheetBuilderPage({
  params,
  searchParams,
}: {
  params: { worksheetId: string };
  searchParams: { drafted?: string; error?: string; field?: string };
}) {
  await requirePractitioner();

  const worksheet = await prisma.worksheet.findUnique({ where: { id: params.worksheetId } });
  if (!worksheet) notFound();
  const fields = parseFields(worksheet.schema);

  // AMD-05 A5.5 — the locale sibling (either direction of the link).
  const sibling = await prisma.worksheet.findFirst({
    where: {
      id: { not: worksheet.id },
      OR: [
        { translationOfId: worksheet.id },
        ...(worksheet.translationOfId
          ? [{ id: worksheet.translationOfId }, { translationOfId: worksheet.translationOfId }]
          : []),
      ],
    },
    select: { id: true, locale: true, active: true },
  });
  const spanishSibling = sibling?.locale === "es" ? sibling : null;

  return (
    <div className="flex flex-col gap-8">
      {searchParams.drafted && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          Here&apos;s the draft — everything below is yours to reshape. It saves as you go.
        </p>
      )}
      {searchParams.error === "structural" && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine" data-c42="structural-error">
          &ldquo;{searchParams.field}&rdquo; is built into the booking form — name and email are always asked, always
          required. Give this question a different id.
        </p>
      )}
      {searchParams.error && searchParams.error !== "structural" && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          The Spanish draft didn&apos;t come through — give it another try in a moment.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <Eyebrow>Worksheet builder</Eyebrow>
        <InlineField
          action={saveWorksheetField.bind(null, worksheet.id)}
          name="title"
          defaultValue={worksheet.title}
          placeholder="Worksheet title"
          className="font-headline text-2xl font-semibold text-wine"
        />
        <InlineField
          action={saveWorksheetField.bind(null, worksheet.id)}
          name="intro"
          defaultValue={worksheet.intro ?? ""}
          placeholder="A warm line or two to open with (optional)"
          textarea
          rows={2}
        />
        <SignatureRule />
        <div className="flex flex-wrap items-center gap-4 text-sm">
          {worksheet.isBooking ? (
            <Link href="/book" target="_blank" rel="noreferrer" className="font-medium text-wine underline-offset-4 hover:underline" data-c42="preview-visitor">
              Preview as a visitor
            </Link>
          ) : (
            <Link
              href={`/practitioner/worksheets/${worksheet.id}/preview`}
              className="font-medium text-wine underline-offset-4 hover:underline"
            >
              Preview as a client
            </Link>
          )}

          {/* AMD-05 A5.5 — language versions: quiet chips, she stays in charge. */}
          {worksheet.locale === "es" && (
            <>
              <form action={toggleWorksheetActiveInBuilder.bind(null, worksheet.id)}>
                <PendingButton
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                    worksheet.active
                      ? "bg-wine text-white"
                      : "border border-mocha text-mocha hover:bg-blush"
                  }`}
                  title={worksheet.active ? "Deactivate this Spanish version" : "Activate — clients with Spanish preference will see this version"}
                >
                  {worksheet.active ? "Español · active" : "Español · draft — activate"}
                </PendingButton>
              </form>
              {sibling && (
                <Link
                  href={`/practitioner/worksheets/${sibling.id}`}
                  className="text-xs text-slate underline-offset-4 hover:text-wine hover:underline"
                >
                  English original
                </Link>
              )}
            </>
          )}
          {worksheet.locale === "en" && spanishSibling && (
            <Link
              href={`/practitioner/worksheets/${spanishSibling.id}`}
              className="rounded-full border border-mocha px-2.5 py-0.5 text-xs font-medium text-mocha transition-colors hover:bg-blush"
            >
              Español · {spanishSibling.active ? "active" : "draft"}
            </Link>
          )}
          {worksheet.locale === "en" && !spanishSibling && !worksheet.isSpiral && !worksheet.isBooking && (
            <form action={createSpanishVersion.bind(null, worksheet.id)}>
              <PendingButton
                pendingLabel="Drafting…"
                className="text-xs text-slate underline-offset-4 hover:text-wine hover:underline"
              >
                Create a Spanish version
              </PendingButton>
            </form>
          )}

          {worksheet.sourceNote && <span className="text-xs text-slate">{worksheet.sourceNote}</span>}
        </div>
      </div>

      <section className="flex flex-col gap-3">
        {/* C42 §2.4 — the booking form's two structural fields: shown so she
            sees the whole form as the visitor will; not editable, not
            reorderable, never optional. They live in BookingFlow, not here. */}
        {worksheet.isBooking && (
          <>
            <p className="text-xs text-slate" data-c42="booking-explainer">
              These questions appear on your public booking page, under the visitor&apos;s name and email. The
              English label is what English visitors see; add a Spanish label and Spanish visitors see that
              instead.
            </p>
            {[
              { id: "name", label: "Name" },
              { id: "email", label: "Email" },
            ].map((sf) => (
              <div key={sf.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-line bg-canvas px-4 py-3 text-sm" data-c42-structural={sf.id}>
                <span className="font-medium text-ink-strong">{sf.label}</span>
                <span className="rounded-full bg-wine px-2 py-0.5 text-xs text-white">required</span>
                <span className="rounded-full border border-mocha px-2 py-0.5 text-xs font-medium text-mocha">built in</span>
                <span className="text-xs text-slate">Always asked; booking needs it to reach them.</span>
              </div>
            ))}
          </>
        )}
        {fields.map((field, i) => (
          <div
            key={field.id}
            className={`flex flex-col gap-2 rounded-lg border border-line p-4 shadow-soft ${
              field.type === "SECTION" ? "bg-blush" : "bg-white"
            }`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-mocha px-2 py-0.5 text-xs font-medium text-mocha">
                {FIELD_TYPE_META[field.type].label}
              </span>
              {field.type !== "SECTION" && field.type !== "CHECKBOX" && (
                <form action={toggleFieldRequired.bind(null, worksheet.id, field.id)}>
                  <PendingButton
                    className={`rounded-full px-2 py-0.5 text-xs transition-colors ${
                      field.required ? "bg-wine text-white" : "border border-line text-slate hover:bg-blush"
                    }`}
                    title="Toggle required"
                  >
                    {field.required ? "required" : "optional"}
                  </PendingButton>
                </form>
              )}
              <div className="ml-auto flex items-center gap-1">
                <form action={moveField.bind(null, worksheet.id, field.id, "up")}>
                  <PendingButton className={iconBtn} disabled={i === 0} title="Move up">↑</PendingButton>
                </form>
                <form action={moveField.bind(null, worksheet.id, field.id, "down")}>
                  <PendingButton className={iconBtn} disabled={i === fields.length - 1} title="Move down">↓</PendingButton>
                </form>
                <form action={deleteField.bind(null, worksheet.id, field.id)}>
                  <PendingButton className={iconBtn} title="Delete">✕</PendingButton>
                </form>
              </div>
            </div>

            <InlineField
              action={updateField.bind(null, worksheet.id, field.id)}
              name="label"
              defaultValue={field.label}
              placeholder={field.type === "SECTION" ? "Section heading" : "The question"}
              className={field.type === "SECTION" ? "font-headline font-semibold text-wine" : "font-medium"}
            />
            <InlineField
              action={updateField.bind(null, worksheet.id, field.id)}
              name="help"
              defaultValue={field.help ?? ""}
              placeholder="A gentle nudge under the question (optional)"
            />
            {worksheet.isBooking && (
              <>
                <InlineField
                  action={updateField.bind(null, worksheet.id, field.id)}
                  name="labelEs"
                  defaultValue={field.labels?.es ?? ""}
                  placeholder="Spanish label (optional) — Spanish visitors will see the English label until you add one"
                  label="Español"
                />
                {field.type !== "SECTION" && (
                  <InlineField
                    action={updateField.bind(null, worksheet.id, field.id)}
                    name="helpEs"
                    defaultValue={field.helps?.es ?? ""}
                    placeholder="Spanish nudge (optional)"
                    label="Español · nudge"
                  />
                )}
              </>
            )}
            {(field.type === "SINGLE_CHOICE" || field.type === "MULTI_CHOICE") && (
              <InlineField
                action={updateField.bind(null, worksheet.id, field.id)}
                name="options"
                defaultValue={(field.options ?? []).join("\n")}
                placeholder={"One option per line"}
                textarea
                rows={3}
                label="Options"
              />
            )}
          </div>
        ))}
      </section>

      <section className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate">Add:</span>
        {FIELD_TYPES.map((t) => (
          <form key={t} action={addField.bind(null, worksheet.id, t)}>
            <PendingButton className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink transition-colors hover:bg-blush">
              {FIELD_TYPE_META[t].add}
            </PendingButton>
          </form>
        ))}
      </section>

      <Link href="/practitioner/library" className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline">
        Back to the library
      </Link>
    </div>
  );
}
