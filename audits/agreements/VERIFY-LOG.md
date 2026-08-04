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
