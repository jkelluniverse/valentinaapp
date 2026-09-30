# C42-PRACTITIONER-FORMS

**Status:** spec only. Nothing built. Queued after C40.
**Governing ruling:** 225 (Jacob) — practitioner-authored intake questions,
per practice: label, input type, required flag, order, both locales. Booking
form first; the model must extend to other forms without a redesign.
**Origin:** Valentina wants every question on her booking form required.
Under C40 that cannot be expressed per practice; under this spec it is her
choice, per question.

Every claim is against code read on 2026-09-30, quoted where it governs.

---

## 0. The finding that decides the design: three question systems already exist

The dispatch's A2 said "if a question model already exists, EXTEND it." There
are three, and they are not equivalent:

| | `Worksheet.schema` | intake engine | `/book` form |
|---|---|---|---|
| authored by | **practitioner** | generated from tenant modules — "never hardcoded, Rule 0.1" (`lib/intake/engine.ts:9`) | nobody — hardcoded in `app/(public)/book/BookingFlow.tsx:138-170` |
| editor | **exists** — `app/practitioner/worksheets/[worksheetId]/page.tsx`: add/retype/reorder, `required` toggle at `:158-162` | none | none |
| field type | `WorksheetField { id, type, label, help?, options?, required? }` (`lib/worksheet-meta.ts:16-23`), 7 types | `ConcreteField` from question sets | four `<input>`s |
| bilingual | sibling worksheet via `locale` + `translationOfId` (`schema.prisma:943-944`) | — | **English only** |
| answers keyed by | `fieldId` → `WorksheetResponse.answers Json` (`:974`) — **a reference** | `fieldKey` + **`questionTextSnapshot`** — "the question EXACTLY as rendered to this client (Rule 0.8)" (`:1937`) | `Lead.name/email/phone/note` |
| "at most one" flag | `isIntake` (`:941`) — set from the Library, `library/actions.ts:157` | — | — |

**Decision: C42 extends `Worksheet` and borrows the intake engine's Rule 0.8.**
The worksheet system has the model, the editor, the required flag and the
"exactly one designated" pattern already; what it lacks is the snapshot
discipline that keeps history honest when a question is edited. The intake
engine has that discipline and nothing else C42 needs. Building a fourth
system beside three is the failure A2 exists to prevent.

---

## 1. A1–A5, verified

**A1 — where questions and answers live.** Questions: hardcoded JSX,
`BookingFlow.tsx:138-170` — `name` (required attr), `email` (required attr),
`phone` ("· optional"), `note` "What brings you?" ("· optional"). The file is
`"use client"` but posts a plain `<form action={action}>` server action
(`:121`), so it degrades without JS. Answers: `lib/discovery.ts:76-84` writes
`Lead.name/email/phone/note` as four columns. There is no per-question
structure on the answer side at all.

**A2 — verified above.** Extend `Worksheet`.

**A3 — server-side required.** `app/(public)/book/actions.ts:47`:
```ts
if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !startIso) redirect("/book?error=missing");
```
Name and email are enforced server-side; phone and note are read (`:42-43`)
and never validated — correct for optional fields. So the HTML `required`
attribute is today a courtesy backed by the server for exactly the two
fields the server checks. C42 makes that general: **the server validates the
submission against the form's schema; the attribute is decoration.** The
`/founders/apply` form (`app/founders/apply/page.tsx:7` — "A PLAIN
SERVER-ACTION FORM. No client component, no JS required") is the precedent
that the public surface must work without JS, and it does here.

**A4 — reference or snapshot.** Worksheets store a reference: editing a
field's label in `Worksheet.schema` re-labels every prior
`WorksheetResponse.answers[fieldId]` on read. That is the "rewrites history"
outcome the dispatch feared, and it is live today for worksheets. The intake
engine stores the snapshot and additionally hashes the whole schema at flow
start (`IntakeFlow.schemaHash`, "drift guard, §4.3") so a mid-flow edit is
detected (`engine.ts:142`). **C42 answers snapshot.** See §2.3.

**A5 — what is structural.** `BookArgs` requires `name` and `email` by type
(`lib/discovery.ts`), the server regex-checks both (`:47`), the Lead row
requires both columns (`schema.prisma:1538-1539`, non-null), and every
notification path reads them. **Name and email are not questions.** They are
the identity of the person booking, and the builder cannot touch them — §2.4.

---

## 2. The model

### 2.1 One flag, the `isIntake` precedent

```prisma
model Worksheet {
  …
  isIntake  Boolean @default(false) // the practice intake (C11) — at most one
  isBooking Boolean @default(false) // C42 — the booking form's questions — at most one
}
```

Set from the Library exactly as `isIntake` is (`library/actions.ts:157-159`
clears all then sets one, in a transaction). The booking form IS a worksheet:
the existing editor edits it with zero changes to the editor. **Nothing about
the seven field types, the `required` toggle, reorder or `help` text is new.**

"Extend to other forms without a redesign" is satisfied by the same move: a
third form is a third `isX` flag or, if that stops scaling, one `purpose`
enum — a rename, not a redesign.

### 2.2 Defaults — nothing changes until she acts

A practice with no `isBooking` worksheet gets today's form, byte-identical.
On first visit to the builder (not on first public render — a stranger's
page view must not write), a worksheet is created from a constant:

```ts
// lib/booking-form-defaults.ts — TODAY'S form, exactly. Frozen; the gate diffs against it.
export const DEFAULT_BOOKING_FIELDS: WorksheetField[] = [
  { id: "phone", type: "SHORT_TEXT", label: "Phone",             required: false },
  { id: "note",  type: "LONG_TEXT",  label: "What brings you?",  required: false },
];
```

The public form renders `DEFAULT_BOOKING_FIELDS` when no `isBooking`
worksheet exists, and the worksheet's fields when one does. The gate proves
a fresh practice's `/book` is field-for-field identical to the pre-C42
fixture. Valentina then opens the builder and flips both to required. Her
choice, per question, applied to her practice only — which is the note the
C40 dispatch carried.

### 2.3 Answers — the snapshot, and where they go

`Lead.intakeAnswers Json` already exists (C37, migration 54) and is
text-keyed by Calendly: `{ "What brings you?": "…" }`
(`lib/scheduling/external/calendly.ts:78-79`). C42 owns this column now and
defines one shape for every writer:

```ts
type IntakeAnswer = { q: string; a: string | string[] | number | boolean };
// Lead.intakeAnswers: Record<fieldId, IntakeAnswer>
//   C42 form:   { note: { q: "What brings you?", a: "…" } }
//   Calendly:   { "ext:1": { q: "What brings you?", a: "…" } }   ← §4
```

**`q` is the label as rendered to that person, at that moment — Rule 0.8.**
Rename the question next week and the stored answer still says what was
asked. The practitioner sees `q`, never the live label, when reading a past
lead. Keyed by `fieldId` so the same question's answers line up across
leads; carrying `q` so a mislabel is impossible. The intake engine's
`schemaHash` drift guard is not needed here — a booking form is a single
page submitted once, with no mid-flow state to drift.

`phone` and `note` keep writing their Lead columns too, for every reader that
exists today (`leads/page.tsx`, `notifyDiscovery`, the C18 conversion
bridge). The columns are the compatibility surface; `intakeAnswers` is the
record. One write, two destinations, until a later change retires the
columns — not this spec.

### 2.4 Structural fields — the builder cannot break the form

`name` and `email` are rendered by `BookingFlow.tsx` itself, above the
practitioner's fields, unconditionally, with the server check at `actions.ts:47`
unchanged. They are **not in the worksheet schema** and the builder has no
row for them. It shows them as two locked lines at the top — "Name ·
required · built in", "Email · required · built in" — so she sees the whole
form as the client will, and cannot remove, reorder below, or make optional
what booking needs to notify anyone.

The gate proves it three ways: the schema `parseFields` accepts has no
`name`/`email` id (a field with either id is rejected on save with a named
error); a POST with the practitioner's questions all answered but no email
is refused at `:47` exactly as today; and a worksheet whose schema is
`[]` still renders a bookable form.

### 2.5 Server-side required — law 5

`submitBooking` (`actions.ts:27`) gains, after the existing `:47` check:

```ts
const fields = await bookingFormFields();          // DEFAULT_BOOKING_FIELDS or the worksheet's
for (const f of answerableFields(fields)) {        // worksheet-meta.ts:50 — SECTION excluded
  const v = formData.get(f.id);
  if (f.required && isBlank(v)) redirect(`/book?error=missing&field=${f.id}`);
}
```

The HTML `required` attribute is still emitted (it is the better experience)
and the gate proves it is not the enforcement: a raw POST omitting a required
field with the attribute stripped is refused. `isBlank` treats
whitespace-only as blank, matching `:40`'s `.trim()`.

### 2.6 Bilingual — decided

**Per-field `labels: { en: string; es?: string }`, with `es` falling back to
`en`.** Not the sibling-worksheet mechanism.

Why not `translationOfId`: a sibling is a second worksheet with its own
schema. For a booking form that means two orderings and two `required`
flags that can silently disagree — Spanish visitors required to answer what
English visitors are not. One form, one order, one required flag per
question, two labels, is the only shape where "required" means one thing.
`help` gets the same treatment. `WorksheetField.label: string` stays as the
`en` accessor for every existing worksheet reader; `labels` is additive and
optional, so no worksheet migrates.

**A dependency to state plainly:** `/book` has no locale today (§1, A1).
C40 §1.12 gives it a copy catalogue and `?lang=` for ruling 224's note. C42's
`es` labels ride on that. If C42 lands first, `es` is stored and unused
until `/book` can choose a language — stored, not lost.

The builder shows both label inputs, `es` marked optional with the fallback
stated beside it ("Spanish visitors will see the English label until you add
one"). No parity gate blocks a save: a half-translated form is a form, not an
error. The gate asserts the fallback renders.

### 2.7 The practitioner-facing editor (Q4-shape, MUST COVER)

- `/practitioner/settings` gains a `LinkRow` "Booking questions" — two i18n
  keys, both locales, declared in `settings-i18n-verify`'s `NEW_SINCE_PASS`
  with this build's name (the C37/C40 pattern).
- It links to the existing worksheet editor for the `isBooking` worksheet,
  creating it from `DEFAULT_BOOKING_FIELDS` if absent. The editor gains two
  things, both gated behind `isBooking`: the two locked structural lines
  (§2.4) at the top, and the `es` label input (§2.6) — which, being additive
  on `WorksheetField`, ordinary worksheets may also use later.
- A "Preview as a visitor" link to `/book` — the real page, her own form.

Nothing else. The editor is reused because it exists; a settings sub-page
that reimplemented field editing would be the fourth system.

---

## 3. C37 — external bookings (MUST COVER)

Calendly asks its own questions and C37 writes them to `Lead.intakeAnswers`
text-keyed. Under §2.3 that becomes `{ "ext:1": { q, a }, … }` — the same
shape, keyed `ext:<n>` because Calendly answers have no `fieldId` and must
not collide with hers. **This is a one-line change in
`calendly.ts:78-79` and it is the only C37 code C42 touches.** It changes
the stored shape, not the webhook's behaviour, and the C37 gate's leg
"the invitee's answers were stored on the contact" is updated to assert the
new shape — a moved assertion, named (ruling 38).

C42 does **not** validate Calendly answers against her form: Calendly
enforced its own required flags, and refusing a webhook because the
practitioner's Psychefolio form differs from her Calendly form would be
refusing a real booking over a configuration mismatch. The leads page shows
external answers under their own heading, "From Calendly", so she knows
which questions she asked where. Ruling 198 is unaffected: `intakeAnswers`
stays unreachable by the citation path regardless of shape.

---

## 4. What the gate proves (`audits/forms/booking-verify.ts`)

Positive controls throughout (ruling 110); each able to fail at build.

1. **Defaults are today.** A fresh practice's `/book` renders exactly the
   four pre-C42 fields with the pre-C42 optionality; the sent-mail and Lead
   row from a submission match the pre-C42 fixture.
2. **Required is server-side.** A raw POST omitting a practitioner-required
   field, `required` attribute stripped, is refused with `error=missing&field=`.
   Positive control: the same POST with the field is accepted.
3. **Structural fields cannot be removed.** Save with `id: "email"` in the
   schema is rejected; POST without email refused at `:47`; empty schema
   still books.
4. **Snapshots survive edits.** Book with label L1 → rename to L2 → the
   stored answer's `q` is L1 and the leads page shows L1; a new booking
   stores L2.
5. **Fallback renders.** Field with `en` only, page requested in `es` → the
   English label appears; with `es` set → the Spanish one.
6. **Exactly one booking form.** Setting `isBooking` on B clears A — the
   `isIntake` transaction, reused.
7. **C37 shape.** A Calendly ingest writes `ext:1 { q, a }`; her own booking
   writes `note { q, a }`; both on one Lead, neither overwriting the other.
8. **Every existing worksheet still parses** — `parseFields` on every fixture
   worksheet is unchanged (the `labels` field is additive).

---

## 5. Out of scope, and one thing Jacob is confirming

Applying `isBooking`'s builder to `/join`, `/founders/apply`, or the client
session note (`/space/schedule` has a single free-text `note`): the model
extends there by the same flag, but Jacob is confirming how far "site-wide"
reaches, and this spec builds the booking form only. The intake engine's
generated questions are a different thing — module-driven clinical intake —
and stay that way.
