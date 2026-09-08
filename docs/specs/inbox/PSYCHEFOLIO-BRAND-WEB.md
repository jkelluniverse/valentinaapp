# PSYCHEFOLIO-BRAND-WEB — intake note (assets landed, awaiting Architect spec)

**Status: INTAKE.** This is not yet a buildable spec — it registers the track, pins the
source-of-truth documents, and records the constraints Jacob stated when he delivered the
brand system (2026-09-08). The Architect turns this into a dispatchable spec (or splits it);
nothing here authorizes UI changes on its own.

## What Jacob asked for (verbatim intent, 2026-09-08)
> "please save all assets and add to build plan for the psychfolio branded website
> (do not change any design schemes for the veritas branded tenant)"

Two deliverables: (1) all brand assets saved into the repo — DONE, manifest below;
(2) the Psychefolio-branded website registered as a planned build track — this file +
the BUILD-STATE queue entry.

## Sources of truth (in priority order)
1. **`/BRAND_HANDOFF.md`** (repo root) — Psychefolio brand system **v1.1**, saved verbatim
   from Jacob's upload. Its own §10 states this consolidated v1.1 file supersedes any earlier
   handoff. Visual identity ONLY — tokens, type, logo, shape/motion, page structures.
2. **`/docs/DESIGN-BRIEF-UI-FEATURES.md`** — the UX/feature inventory the handoff defers to
   for feature behavior. Where the two disagree on behavior, the UX brief wins; on visual
   identity, the handoff wins.
3. **`/docs/brand/renderings/`** — the eight reference renderings the handoff's §8 says to
   match visually (saved locally; the a.lovart.ai URLs may not live forever).

## Asset manifest (all fetched 2026-09-08, byte-verified as SVG/PNG)
Logo files, in `/public/brand/` (the handoff's §9/§10 nominate this path; reference by
`<Logo>` variant once that component exists):

| file | variant / use | sha256 |
|---|---|---|
| `lockup-vertical.svg` | PRIMARY — standalone vertical lockup (web headers, marketing, print, light bg) | `0ed7e3e8…272a1cc4` |
| `lockup-horizontal-reversed.svg` | horizontal lockup for nav bars + reversed (white/gold on indigo) — both in one file | `94091790…5ea04509` |
| `app-icon.svg` | SECONDARY — boxed indigo tile; favicon / app icon / avatar / dark surfaces ONLY | `be9359eb…fa44b00d` |
| `app-icon-small.svg` | simplified/flat variant for 16–32 px | `953e70e1…8047f676` |
| `mark-transparent.png` | transparent-bg standalone mark, 2016×1344 (overlay / Canva) | `cdb5ea19…412ff4f777` (matches source URL hash) |

Reference renderings, in `/docs/brand/renderings/` (design references — deliberately NOT in
`public/`, they are not shipped site assets): `brand-spec-sheet.png` ·
`public-homepage.png` · `practitioner-study.png` · `client-sanctuary.png` ·
`dusk-variants.png` · `stationery.png` · `business-card-front.png` ·
`business-card-back.png`.

## Scope of the eventual build (from the handoff's §6 build targets)
a. **Public marketing homepage `/`** — full Psychefolio brand, 8 banded sections.
b. **Practitioner portal "The Study"** — full-brand reskin of the existing portal.
c. **Client portal "The Sanctuary"** — WHITE-LABEL: wears the TENANT's brand, Psychefolio
   at most a tenant-toggleable "powered by" footer whisper.
d. **Signing experience `/agree/[token]`** — already built (C22); the handoff's §6d matches
   what shipped, so this is polish-to-token-palette at most, not a rebuild.

## Hard constraints (standing — carry into any spec cut from this track)
1. **Tenant #1 (Valentina / Veritas-branded, "Warm Stone" wine/mocha) is UNTOUCHED.**
   Jacob's parenthetical is a law, not a preference. The 16-screen visual baseline
   (ruling 11 protocol) is the enforcement mechanism for her client-visible chrome.
2. The handoff itself forbids wine/mocha on Psychefolio surfaces — the two identities must
   never bleed into each other in either direction.
3. White-label rule: the client portal wears the tenant's brand; a client must never feel
   they are inside business software.
4. Gold is the ONLY action color on Psychefolio surfaces; one primary action per signing screen.
5. Language rails (handoff §0): no therapy/treatment/patients/EHR/clinical/diagnosis/
   "HIPAA-compliant" wording; verbatim legal text; "AI proposes. You decide."
6. **Naming caution (ruling 22 note):** the "Psychefolio" USPTO check (Classes 042 + 044) is
   recorded as OUTSTANDING. Publishing a Psychefolio-branded public marketing site asserts
   the mark far louder than an email sender name — the Architect should sequence this
   against clearance, or Jacob should accept the risk explicitly.

## Dependencies / sequencing notes for the Architect
- **C25 (PracticeSetting PK + global-unique defect, ruling 32) outranks this** — it is
  event-critical; this track is not tied to Sept 23.
- The "powered by" whisper must be a tenant-controllable setting (handoff §4) — i.e. a
  `PracticeSetting` write for non-default tenants, which TODAY CANNOT WORK until C25 lands.
  Real dependency, not just priority ordering.
- PUBLIC-I18N (ruling 1) intersects: the marketing homepage wants the EN/ES toggle; the
  handoff's §7 demands externalized strings. Cutting the homepage spec after (or with)
  PUBLIC-I18N avoids building it twice.
- The existing `/` currently serves tenant portals by host; the marketing homepage needs a
  platform-domain-vs-tenant-host routing decision (likely: Psychefolio brand on
  `PLATFORM_DOMAIN` only, tenant hosts unchanged).
- Theme toggle: `data-theme="dusk"` on `<html>`, system preference respected, choice
  persisted; signing paper stays warm-white even in Dusk (handoff §5/§6d).

## Suggested spec cuts (Architect's call)
1. **BRAND-FOUNDATION** — tokens as CSS custom properties, Lora/Poppins loading, `<Logo>`
   component (6 variants), favicon wiring, Dusk theme plumbing. No page changes.
2. **BRAND-HOME** — the public marketing homepage on the platform domain (+ routing decision).
3. **BRAND-STUDY** — practitioner portal reskin (default-tenant safe: the Study is
   practitioner-facing, but tenant #1's practitioner chrome changes need Jacob's eyes too).
4. **BRAND-SANCTUARY** — white-label theming layer + "powered by" whisper setting (post-C25).
