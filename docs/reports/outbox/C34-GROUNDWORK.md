# C34-SIGNATURE-AUDIT — GROUNDWORK (read-only). NO SPEC EXISTS.

**First, the finding that shapes this document: there is no C34 spec.** The only
occurrence of "C34" in the repository is the queue line written into BUILD-STATE.md
from the Architect's own dispatch. There are therefore **no A1–A6 assumptions to
test**, and none were invented. What follows is a census of the signature system as
it actually is — observed facts a future C34 spec can be written against, explicitly
NOT answers to assumptions that do not exist.

## The data model

- **`Agreement`** carries the full attribution stack: `signerName` (typed legal
  name), `signerDrawn` (canvas data-URL), `signerIp`, `signerAgent`, `signedAt`,
  plus the pre-signature evidence `viewedAt` (full scroll recorded) and
  `disclosureShownAt` (ESIGN consumer-consent line shown). `bodySnapshot` and
  `titleSnapshot` pin the exact merged text sent — "pinned forever" — and
  `mergeData` pins the variables as resolved at send time. `initialsCaptured` holds
  per-item acknowledgments `[{id, value, at}]`. Countersignature has its own
  parallel set (`countersignedAt`/`countersignName`/`countersignDrawn`).
  `voidedAt`/`voidReason` void without deleting history; `paperSignedAt` is the
  documented paper escape hatch.
- **`AgreementEvent`** is the trail: `kind` ∈ created|sent|reminded|viewed|
  disclosure|signed|countersigned|declined|voided|sealed|downloaded|paper-signed,
  with `actor` ∈ practitioner|client|lead|system, `at`, and `meta`.
  Indexed `[agreementId, at]`. Append-only **by convention** — observed: nothing at
  the database level enforces immutability (no trigger, no constraint).
- **`AgreementFile`** is content-addressed: `sha256` + storage `key`, frozen onto an
  agreement at send time.
- **Link token**: `tokenHash` is `@unique` and **hashed at rest** — the raw token is
  returned exactly once at creation and never stored. `expiresAt` set from
  `AGREEMENT_LINK_TTL_DAYS`.

## Server-side enforcement at signing (`signAgreement`, lib/agreements/index.ts)

Verified by reading the function end to end, in order:
1. status must be `SENT` or `VIEWED` — a signed/declined/voided agreement cannot be
   re-signed;
2. `disclosureShownAt` must be set — **refuses with "disclosure not shown"**;
3. typed legal name required, minimum 3 characters;
4. **the drawn signature is REQUIRED and enforced server-side** — the value must
   exist and start with `data:image/`, else the refusal
   "drawn signature required — sign in the box" (localized ES/EN). C22.1, Jacob's
   Aug 2026 rule, with the comment naming the UI block as the front half and this
   as "the server backstop".
   *Method note:* a grep first suggested the opposite (`signerDrawn: args.drawn ?? null`
   at the update site looks permissive). Reading the function in context showed the
   guard above it. Recorded because pattern-matching would have produced a false
   finding.
5. every `required` acknowledgment must be captured; initials length 2–5; text
   fields capped at 2000 chars.
   Then the row is written and a `signed` event logged with name, ip, agent and the
   acknowledgment count.

## Tamper evidence

`sealIfComplete` refuses unless status is `SIGNED` and any required countersign is
present; it is idempotent (returns early when `sealedKey`+`sealedSha256` exist). It
renders the sealed PDF from the pinned snapshot plus the event trail and stores
bytes + SHA-256. **`readSealedPdf` re-hashes the stored bytes on every download and
refuses with `"tampered"` on mismatch** (also `"unsealed"`, `"missing"`), and logs a
`downloaded` event. The only consumer is `app/api/agreements/[id]/pdf/route.ts` —
i.e. the download path does re-verify, which is the claim seal.ts makes.

## Template integrity

An agreement pins `templateId` to an exact version+locale sibling, and
`createAndSendAgreement` refuses to send unless that template is `ACTIVE`
("a DRAFT master never sends — counsel/Jacob flips it live").

## Open questions a C34 spec would need to settle — NOT answered here

1. **Is the link token single-use?** `tokenHash` is unique and expiring, but whether
   it is invalidated at signing was NOT verified. Stated as unverified, not assumed.
2. **AgreementEvent immutability** is convention, not constraint — is that the
   intended posture for a legal audit trail?
3. `signerIp`/`signerAgent` are nullable — under what conditions do they end up null,
   and does a null weaken attribution?
4. Does the sealed PDF's embedded trail cover every event kind, including events
   recorded after sealing (e.g. `downloaded`)?
5. **Stale comment, flagged not fixed:** the schema annotates `signerDrawn` as
   "canvas strokes data-url — warmth, not legality", which predates C22.1 making it
   mandatory. Comment and behavior disagree; behavior is authoritative.

Nothing was built, changed, or fixed.
