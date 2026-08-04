# ONBOARDING v1.1 Stage-6 (discovery layer) verify — 2026-08-04

Browser-driven acceptance (`discovery-verify.ts`) against the built app on a
seeded scratch DB. Earlier stage verifies (engine, completion, UI, birth-time
UPDATE, preview, invite lifecycle) are recorded in their commit messages and
runnable harnesses in this directory.

## Hints (§6.2)
- ✓ getting-started card on home
- ✓ card starts 0/5
- ✓ first home hint visible
- ✓ only ONE hint at a time
- ✓ hint marked SEEN on first render
- ✓ hint persists until dismissed
- ✓ dismiss recorded as DISMISSED
- ✓ dismissed hint never returns
- ✓ next hint takes the slot
- ✓ no hint left on home after both dismissed
- ✓ design hint on first design visit

## Getting-started card (§6.3)
- ✓ card auto-checked the map item (1/5) after a real design visit
- ✓ card auto-disappears when every item is done (real rows: reflection,
  first map, message, session)
- ✓ auto-completion recorded DISMISSED (permanent)

## Activation gate (Rule 0.1)
- ✓ María (pre-engine, no COMPLETE INITIAL IntakeFlow) sees no card
- ✓ María sees no hints
- ✓ María gained no hint rows
- ✓ baseline: space-design and space-settings byte-identical WITH the new
  HintCallout code in place — the gate holds by construction; remaining
  screen diffs were the documented clock/seed-drift class (eyeballed:
  standing-line rotation, 4-week-window rollovers, "quiet lately"
  thresholds), baseline recaptured per the standing rule

## Drop-off view (Stage 6 ◆)
- ✓ "Where clients are" renders on the practitioner intake-preview page
- ✓ counts the started intake from ActivityEvents

## Design notes
- Hint semantics: a hint shows from first visit and persists until ITS × is
  tapped (DISMISSED, never again). The first cut marked hints consumed on
  first render ("shown once"); the verify itself caught the flaw — the
  login-redirect render burned the first hint before the client ever looked,
  and dismissal would have been meaningless. SEEN now records first render
  only (telemetry + "surface visited" detection for the card).
- Messages surface carries no §6.2 hint: the thread's permanent topNote
  (away note / response rhythm) already teaches in place, and the thread is
  a full-screen overlay on mobile where a callout above it would never be
  seen.
- §6.1: journey/sessions teaching empty states already existed; the design
  no-chart state now shows COPY.discovery.mapPending for engine-onboarded
  clients only (their birth details came from intake — "add your details"
  would be wrong). The sessionsEmpty string stays in the table until a
  client sessions-summary surface exists.
- §6.4: `branding.welcomeVideoUrl` renders a <video> on the intake Done
  step. Unset for Valentina's tenant — pure config, zero production change.

ALL CHECKS PASS — 19/19
