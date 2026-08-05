# C20 v3.1 install verify — 2026-08-05

Harness: `v31-verify.ts` against the built app on a seeded scratch DB —
the attorney master install per CLAUDE-CODE-AGREEMENT-INSTALL.md. 25/25.
Regression: `c20-verify.ts` re-run after, 28/28.

## Verbatim install (the "not a comma" rule)
- ✓ installed body is byte-identical to the repo content file, which is
  SHA-256-matched to counsel's upload — zero edits
- ✓ every v3.0 continuation marker left intact (nothing reconstructed);
  the missing-sections list is reported, not filled
- ✓ re-running the installer is a no-op (idempotent); body refresh only
  happens while the template is still DRAFT

## DRAFT semantics (not sendable until Jacob flips it)
- ✓ template lands as DRAFT; desk shows "DRAFT — not sendable" badge and
  excludes it from the send dropdown
- ✓ createAndSendAgreement refuses the DRAFT with a hard error — every
  send path (manual, invite, package, recording triggers) goes through it
- ✓ DRAFT preview works: live values resolve (24-hour window, formatted
  fee) and are highlighted; unmapped SOW vars stay visibly {{unresolved}}
- ✓ preview page renders the DRAFT banner, <mark> highlights, key-terms
  table, and no send form
- ✓ flipping status→ACTIVE (simulating Jacob) makes the same template
  sendable; booking gate blocks until signed, releases on completion

## Per-item acknowledgments + key-terms freeze
- ✓ sign page renders all 10 ack items (9 typed-initials + Exhibit B
  checkbox), text verbatim from counsel
- ✓ signing with missing initials is refused; complete set stores all 10
  attributed acknowledgments (initialsCaptured)
- ✓ sealed PDF carries KEY TERMS (resolved merge values frozen) and
  INITIALED ACKNOWLEDGMENTS (initials + timestamp + full item text)

## Addenda wiring
- ✓ Addendum P: election is real — 5 probe clients clear the k-floor,
  one setPatternElection(false) drops the archetype count to 4 (below
  floor); stale-archetype zeroing proven; practice switch restored
- ✓ Addendum R: retention note ("retained for 3 years", RETENTION_YEARS
  config) renders in the client settings agreements section
- ✓ Addendum M: under-18 intake completion blocked with the guardian
  notice, flow stays IN_PROGRESS, practitioner evented + emailed —
  document present, product support intentionally absent (by spec)

## Notes
- Deviation (reported, not resolved): the spec's "block at invite" gate
  lives at intake completion — invites carry no DOB; intake is the first
  moment the platform knows age.
- Null-tenant fix: CLI aggregatePatterns was creating unstamped
  patternArchetype rows; now stamps tenantId via getTenant(); scratch
  backfilled (43 rows) and the invariant audit is green again.
- Gates on this run: baseline 16/16 (two recaptures — greeting rollover
  incl. the noon knife-edge, documented classes; final BASELINE MATCH),
  GET smoke, write smoke, tenant-stamp audit, platform isolation verify
  (PatternElection B-fixture added) all green. Reconciliation report for
  Jacob: docs/AGREEMENT-V31-INSTALL-REPORT.md.

ALL CHECKS PASS — 25/25 · template stays DRAFT until Jacob flips
`AgreementTemplate.status` → ACTIVE for slug `client-services-agreement`.

# C20-AGREEMENTS verify — 2026-08-04

Harness: `c20-verify.ts` against the built app on a seeded scratch DB —
the spec §5 verify list end-to-end. 25/25.

## Templates (G.1)
- ✓ starter set seeds 3 templates × en/es siblings, ALL marked placeholder
  (the 🟡 attorney flag renders on the practitioner desk until real texts land)
- ✓ scope-of-work requires countersign (dual-signature)
- ✓ es-locale client is served the es sibling; signature binds to the
  version they actually read

## Send (G.2)
- ✓ merged Scope sent to María — bodySnapshot pins the merged text forever
  (package/price/term resolved, zero {{vars}} left)
- ✓ automatic triggers wired: invite acceptance, package purchase (merged
  from the price book), recording-consent grant — each per-template
  toggles on the desk, each dedupes against a live/signed same-slug doc
- ✓ tick reminder cadence: one gentle auto-reminder at 3 days, evented
- ✓ before-first-session gate blocks booking warmly ("One thing before we
  begin") and lifts the moment it's signed
- ✓ declined + voided behave; voiding is attributed and history intact

## Sign (G.3)
- ✓ portal flow: full document + e-records disclosure + typed legal name
  + optional drawn mark + ONE wine "I agree and sign"
- ✓ viewed + disclosure timestamped; attribution stack recorded (name,
  IP, user agent, session/signed-link basis); signing twice refused
- ✓ Lead Carmen signs pre-portal via the signed no-login link
- ✓ countersign completes the dual-signature doc

## Seal & store (G.4)
- ✓ sealed PDF (agreement text + signature page + audit certificate)
  generated on completion, SHA-256 stored, object in the storage adapter
  (local driver now; R2 is a config change)
- ✓ both parties download; every download re-verifies the hash
- ✓ a single flipped byte in the stored object → download refused (409)
- ✓ audit trail append-only: created→sent→viewed→disclosure→signed→
  countersigned→sealed→downloaded
- ✓ client shelf: /space/agreements + a settings section that exists only
  once an agreement does (María's settings byte-identical before)

## Notes
- Portrait "Agreements" tab deliberately deferred: adding a tab changes
  Valentina's baselined Portrait chrome — the desk lives at
  /practitioner/agreements (settings-linked) until she accepts a chrome
  change. Escape hatch §6.2 ("mark signed on paper") shipped on the desk.
- Gates on this run: baseline 16/16 (one practitioner-home diff eyeballed
  = the documented three-week inactivity rollover, recaptured), GET smoke
  (+ /practitioner/agreements), write smoke, tenant-stamp audit, platform
  isolation verify (B-fixtures + agreement rows) all green.

ALL CHECKS PASS — 25/25 · 🟡 attorney pass on texts/disclosure/retention
remains the hard gate before ANY real use.
