# C43-AGREEMENTS-LIBRARY

**Status:** spec only. Nothing built. Queued after C42's spec.
**Surface:** `/practitioner/agreements/templates` ("Manage documents").
**Governing rulings:** 229 (full title, never ellipsised), 230 (triggers into a
disclosure with a closed-state summary), 231 (categories, mirroring Files).
**Out of scope:** agreement content, the signing flow, the DRAFT→ACTIVE flip
(Jacob's alone), C34's audit items.

Every claim is against code read on 2026-09-30, quoted where it governs.

---

## 0. The DRAFT-trigger check (reported separately; recorded here because A3 depends on it)

**Answer: NO — the trigger is set and IGNORED.** Nobody's booking is blocked.

`bookingBlockedByAgreement` (`lib/agreements/index.ts:586-599`) never reads
templates directly. It starts from **agreements**:

```ts
const open = await prisma.agreement.findMany({
  where: { clientId, status: { in: ["SENT", "VIEWED"] } }, … });
if (open.length === 0) return { blocked: false };
const templates = await prisma.agreementTemplate.findMany({
  where: { id: { in: open.map((o) => o.templateId) }, requireBeforeBooking: true }, … });
```

An agreement from a DRAFT template cannot exist, because sending refuses it
(`:318-319`: `` `template is ${sibling.status} — not sendable` ``). So `open`
never contains a DRAFT's id, the flag is never consulted, and the pill on
row three is a control that does nothing. **Valentina's booking is not
affected today.** The gate is also only wired to the client portal
(`app/space/schedule/page.tsx:52-53`); `/book` has no clientId and is never
gated by any template.

**And the row is not debris — it is the designed install state.**
`install-v31.ts:72` sets `requireBeforeBooking: true` on the DRAFT master
deliberately ("portal may block booking until required signatures
complete"), and `v31-verify.ts:154` asserts exactly that: *"installed as
DRAFT v3.1 with countersign + booking gate."* The intent is that the flip to
ACTIVE arms the gate with no second step. The defect is not the data; it is
that the UI shows an armed control as if it were live.

The three **send** triggers are consistent with this: `triggers.ts:19-20`
filters `status: "ACTIVE"` before firing, so a DRAFT's `sendOnInviteAccept`
is equally inert.

**Debris reachability.** Clients only ever see `Agreement` rows
(`app/space/agreements/page.tsx:23`, `where: { clientId: user.id }`); no
client-facing surface lists templates. A DRAFT is unreachable from any
client surface by construction. An **ACTIVE** test template *is* offered in
the practitioner's send menu (`send/page.tsx:19`, `status: "ACTIVE"`) and
could be sent by hand — that is C33's archive, not today's problem. I cannot
read production to say which of "nk" / "memornadum" are ACTIVE (ruling 73).

---

## 1. A1–A5, verified

**A1 — booleans, toggled by a server action.** Four columns on
`AgreementTemplate` (`schema.prisma:1744-1747`): `sendOnInviteAccept`,
`requireBeforeBooking`, `sendOnPackagePurchase`, `sendOnRecordingConsent`,
all `Boolean @default(false)`. The pills post to `toggleTemplateTrigger`
(`app/practitioner/agreements/actions.ts:295-307`), which allowlists the
field name, reads the row, and writes `{ [field]: !current }`. **The
disclosure's checkboxes write the same four columns through the same action
— one change: it gains an explicit `on: boolean` instead of flipping, so a
checkbox's state is what gets written, not "whatever it wasn't."**

**A2 — Files HAS folders, and a full move UI.** `LibraryFolder`
(`:293-305`): `name`, `parentId` ("nesting unlimited"), `isDefault` ("the
seeded four — renameable, not deletable"), `order`, `deletedAt`.
`LibraryItem` (`:311-313`): `folderId`, `kind` ("WORKSHEET | PROMPT | COURSE
| FILE | LINK | DOC"), `refId` ("points at the C9 Worksheet / C3 Prompt / C6
Course — no duplication"). `folder-actions.ts` exports `createFolder`,
`renameFolder`, `moveItem`, `moveFolder`, `trashFolder`, `restoreFolder`,
`duplicateItem`. `lib/library.ts:11-15` seeds "Worksheets", "Exercises &
Prompts", "Courses", "Resources" idempotently and files unfiled items into
their home. **C43 mirrors this exactly — §3.**

**A3 — DRAFT + trigger.** Decided in §4: **IGNORED on read (already true),
made VISIBLE in the UI, and gated.** Not refused on write. Reasoning there.

**A4 — verified.** Version/status/placeholder/file-count are one `<span>`
(`templates/page.tsx:119-124`) sharing a flex row with the title, Preview,
Sign & seal, four pills, and Retire. Nine controls, one row, `flex-wrap` —
which is the two-line wrap on DRAFT rows in Jacob's screenshot.

**A5 — verified; stays.** `:60-61`: "Your library. Retire what you don't
use — retired documents disappear from every menu, and anything already
sent or signed is untouched." Correct and kept verbatim.

---

## 2. The row (rulings 229, 230, A4)

```
┌─────────────────────────────────────────────────────────────────────┐
│ ▸ Client Services Agreement                              [Retire]    │
│   v3.1 · DRAFT — not sendable · 2 triggers armed                     │
└─────────────────────────────────────────────────────────────────────┘
   ▾ opened:
   ☐ Send on invite acceptance      ☑ Require before booking
   ☐ Send on package purchase       ☑ Send on recording consent
   Preview · Sign & seal myself                      (secondary actions)
```

- **Title**: `<h3>` full width, `overflow-wrap: anywhere`, never `truncate`.
  Ruling 229 is a CSS class removed (`:118` has `truncate`) and a gate that
  measures: no title element narrower than its text (the founders gate's
  crushed-text measure, reused).
- **Meta line** beneath the title: version, kind/file count, placeholder,
  status, and the **closed-state summary** — "2 triggers" when ≥2, the single
  name when 1, nothing when 0. On a DRAFT: "2 triggers **armed**" — the word
  chosen because §0 found they are set-and-waiting, not live. One word turns
  a silent nothing into an honest state.
- **Disclosure**: a real `<button aria-expanded aria-controls>` wrapping the
  arrow and title (the whole line is the target — 44px min, ruling 207's tap
  rule), toggling a panel of four **checkboxes**, each its own `<form>` to
  `toggleTemplateTrigger(id, field, on)`. No JS needed to open: the panel is
  `<details>`/`<summary>` (the /founders mobile-menu precedent, opens with
  JS disabled) with the summary styled as the row head. Keyboard: Enter/Space
  on the summary; Tab through four checkboxes.
- **Retire** stays on the row head, right-aligned, the one destructive
  action; Preview and Sign & seal move into the open panel as secondary
  links. Nine controls become one visible plus one.
- **Bilingual**: the four trigger labels, "triggers armed", "Retire",
  "Preview", "Sign & seal myself", the intro, and the category names get a
  catalogue — the page is hardcoded English today (no `Copy(` import, no
  `messages/en/agreements*.json`). `lib/agreements-copy.ts`, the
  `practitionerSettingsCopy` shape, declared in `settings-i18n-verify`'s
  `NEW_SINCE_PASS` under this build.

**Mobile** (ruling 207, from the start): the row head stacks — arrow+title,
then meta line, then Retire full-width beneath; the open panel's checkboxes
go one per line. Baselines at 375, 390, 768, 1440 captured with the page
green, never before.

---

## 3. Categories (ruling 231) — mirror Files, do not rebuild it

**Decision: reuse `LibraryFolder` and `LibraryItem` outright.** A template
becomes a `LibraryItem` with `kind: "AGREEMENT"` and `refId: template.id` —
the `refId` mechanism already points items at worksheets, prompts and
courses "with no duplication," and an agreement is the fourth thing it
points at. Zero new tables. `moveItem`, `createFolder`, `renameFolder`,
`moveFolder`, trash/restore and nesting come for free, from
`folder-actions.ts`, unchanged.

Seeded defaults, the `lib/library.ts:11-15` shape, under a separate root so
agreements never mix into the worksheet tree:

```ts
const AGREEMENT_DEFAULTS = [
  { key: "core",      name: "Core agreements",  order: 0 },  // client services, scope
  { key: "addenda",   name: "Addenda",          order: 1 },  // recording, payment auth
  { key: "uploads",   name: "Uploaded files",   order: 2 },  // kind === "FILES"
  { key: "drafts",    name: "Drafts & tests",   order: 3 },  // status === "DRAFT", first-filing only
];
```

`ensureAgreementLibrary()` runs on page load like `ensureLibrary` — creates
the four idempotently, files every template not yet pointed at into its
home by `kind`/`slug`/`status`, and never re-files a moved one (the
`update: {}` discipline). A practice that never touches it sees today's
templates in four sensible groups; one that does gets folders, renames and
nesting identical to Files. The templates page renders the tree with the
same `LibraryBrowser` grouping components, rows as §2.

**Why not a `category` column on `AgreementTemplate`:** it would be the
second grouping mechanism ruling 231 forbids, with no move UI, no nesting,
no rename, and a per-practice enum to maintain.

**What does NOT move to Files:** the templates page stays its own page.
Ruling 231 asks for Files' *model*, not for agreements to be a folder inside
the worksheet library — a signed legal document and an exercise prompt
should not share a trash.

---

## 4. A3 — DRAFT + active trigger: IGNORED on read, VISIBLE, GATED

**Not refused on write**, for the reason §0 found: the install path SETS
the flag on the DRAFT on purpose so that Jacob's flip arms the gate in one
step. Refusing the write would break `install-v31.ts:72` and the v31 gate's
assertion at `:154`, and would make every practitioner re-arm four triggers
the morning a document goes live — the moment they are least likely to
remember. The data is right; the UI was lying about it.

So the disclosure on a DRAFT row shows the checkboxes **checked but marked
armed**: "Require before booking — armed; takes effect when this document
is released." Not disabled — she can still un-arm one.

**The gate** (`audits/agreements/library-verify.ts`, plus the existing
`c20`/`v31` untouched):
1. A DRAFT with `requireBeforeBooking: true` → `bookingBlockedByAgreement`
   returns `blocked: false` for a client with no open agreement. Positive
   control: the same template ACTIVE, sent → `blocked: true`. (Today's
   behaviour, now asserted rather than assumed.)
2. The closed summary reads "N triggers armed" on a DRAFT and "N triggers"
   on ACTIVE, N counted from the four columns.
3. A checkbox POST with `on: false` writes `false` regardless of prior
   state (the explicit-write change to `toggleTemplateTrigger`).

---

## 5. What the gate proves — textual AND visual (ruling 191)

**Textual** (`library-verify.ts`): §4's three; every template appears
exactly once across the tree; the four defaults exist after first load;
`moveItem` on an agreement item relocates it and a reload keeps it; a
retired template leaves the tree; every label renders in both locales.

**Visual** (`library-visual-verify.ts`, the founders-visual harness with
its ruling-214 header): at 375/390/768/1440, mobile first — no title
narrower than its text (the crushed-text ratio); no row head taller than
two lines at desktop; no horizontal overflow; every disclosure summary
≥44px; contrast AA on every node; the four-checkbox panel single-column at
mobile. Baselines captured from the green page. Scope line printed per
ruling 208. This page failed by LOOKING wrong; a green from grep alone
would repeat ruling 206.

Neither page is in `scripts/baseline.ts`'s sixteen screens today
(`/practitioner/library` and `/practitioner/agreements/templates` are both
absent), so the visual gate adds its own rather than extending a list it
was never on.

---

## 6. Order of work

Catalogue (both locales) → `LibraryItem kind: "AGREEMENT"` + `ensureAgreementLibrary`
(migration-free: `kind` is a free string, `refId` nullable) → row markup per §2
→ `toggleTemplateTrigger(id, field, on)` → tree rendering with the Files
components → textual gate → visual gate with baselines → sweep.
