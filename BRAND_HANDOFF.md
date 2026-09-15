# Psychefolio — Brand & UI Handoff (Build Spec for Claude Code) · v1.1

> Purpose: implement the Psychefolio marketing site and both portals (Practitioner "The Study", Client "The Sanctuary") to match the approved brand system. This file is ground truth for visual identity. Product feature behavior is defined separately in the UX/UI feature brief.
>
> Register: **warm precision** — cosmic but grounded, editorial, premium, calm. Never cold clinical SaaS-gray, never wine/mocha (that is tenant #1's "Warm Stone" palette — do NOT use), never crystal/lens-flare mysticism.
>
> Brand spec sheet (visual reference): `https://a.lovart.ai/artifacts/agent/e29gfFukZz8peBLN.png`

---

## 1. Brand essence (copy & tone)

- **What it is:** the entire operating system for a solo transformational practice — client portal, journaling, scheduling, billing, e-sign/consent, session recording + transcription, bilingual EN/ES, and an evidence-mandatory AI practice manager.
- **Tagline (lockup):** "The operating system for inner work."
- **Trust line:** "AI proposes. You decide."
- **Three pillars:** (1) Depth, not just admin · (2) Evidence over vibes · (3) The practitioner is supreme.
- **Voice:** warm, unhurried, second-person, plain English, no dark patterns. Non-clinical always.

### Hard rails (never cross, in any copy or UI)
- No "therapy / treatment / patients / EHR / clinical / diagnosis / HIPAA-compliant." Use "practitioner," "client," "facilitator/coach." Strong security + disclosed sub-processors, NOT HIPAA claims.
- Never "AI replaces." The practitioner's irreplaceability is the point.
- No outcome promises, no guru aesthetics.
- Legal/consent text renders **verbatim** — chrome may change, words may not.
- One unambiguous primary action per signing screen. Calm over dense.
- Client-facing surface must never feel like business software.
- **White-label rule:** client-facing portal wears the TENANT's brand; Psychefolio appears at most as a toggleable "powered by Psychefolio" whisper. Practitioner-facing surfaces use the full Psychefolio brand.

---

## 2. Color tokens

Implement as CSS custom properties. Gold is the ONLY action color — one primary gold action per view.

### Light mode (default for marketing + Sanctuary)
```css
:root {
  --pf-indigo:   #2E2749;  /* Indigo Night — primary brand, nav, dark sections */
  --pf-ink:      #141A2E;  /* Deep Ink — near-black, footer, headings on light */
  --pf-gold:     #D8A441;  /* Starlight Gold — single action/accent color */
  --pf-gold-soft:#E8B85C;  /* lighter gold for highlights/hover */
  --pf-sage:     #7FA99B;  /* Sage Teal — secondary/status accent */
  --pf-cream:    #FAF0EF;  /* Cream — light canvas */
  --pf-ivory:    #F5F0E6;  /* warm ivory alt canvas */
  --pf-slate:    #5A5B66;  /* Slate — secondary text */
  --pf-card:     #FFFFFF;  /* card surface on cream */
  --pf-text:     #2A2733;  /* body text on light */
  --pf-muted:    #8A8597;  /* whisper text */
}
```

### Dusk / dark mode (toggle; Sanctuary, Study, signing available in Dusk)
```css
[data-theme="dusk"] {
  --pf-indigo:   #16132A;  /* Dusk Base — app background (deep plum-indigo) */
  --pf-ink:      #0E0B1C;  /* Dusk Ink — top bar / deepest surface */
  --pf-surface:  #211C3A;  /* Dusk Surface — raised cards */
  --pf-gold:     #E0B45A;  /* brightened gold for dark */
  --pf-sage:     #8FB8AB;  /* brightened sage for dark */
  --pf-text:     #F2ECDF;  /* warm off-white primary text (NOT pure white) */
  --pf-muted:    #9A93B0;  /* muted lavender-gray */
  --pf-card:     #211C3A;
}
```
- Dark mode uses warm off-white text, never `#FFFFFF` body text.
- The signing "paper" document stays a warm white/cream sheet even in Dusk (legal readability); only the surrounding chrome goes dark.

---

## 3. Typography

**Locked pair: Lora (display/wordmark) + Poppins (supporting/UI/captions).**
Load via Google Fonts (or self-host). `font-display: swap`.

```css
--pf-font-display: 'Lora', Georgia, 'Times New Roman', serif;   /* wordmark, headlines, greetings */
--pf-font-body:    'Poppins', 'Inter', system-ui, -apple-system, sans-serif; /* UI, nav, body, captions */
```

Type scale (desktop / mobile):
| Token | Font | Size / weight | Use |
|---|---|---|---|
| display | Lora 600 | clamp(2.5rem, 5vw, 4rem) | Marketing hero |
| h1 | Lora 600 | 2–2.5rem | Page titles, portal greeting |
| h2 | Lora 600 | 1.5–1.75rem | Section/card titles |
| body | Poppins 400 | 1rem / 1.6 | Paragraphs, UI |
| label | Poppins 500 | 0.875rem | Form labels, nav |
| eyebrow | Poppins 600 | 0.7rem, uppercase, letter-spacing .12em | Section labels ("WORTH A LOOK", "YOUR MAP") |
| caption | Poppins 400 | 0.75rem | Whisper/helper text |

- Every portal page title gets an **eyebrow** above it and a short **gold "signature rule"** underline (~40px, 2px, gold).
- Wordmark "Psychefolio" = Lora 600, indigo on light / cream on dark.

---

## 4. Logo system  (v1.1 — standalone lockup is PRIMARY)

The mark = a constellation monogram **P** (thin gold lines connecting small round gold star-nodes, one larger four-point sparkle star at the upper-right of the bowl) rising from **delicately fanned open-book pages** in lighter, semi-transparent gold. Three meanings: **P** monogram · **constellation** (psyche map / evidence) · **open folio** (the practice record).

### Asset files
- **PRIMARY — standalone vertical lockup (no box)** — default for web headers, marketing, stationery, print, light backgrounds. Gold mark above indigo "Psychefolio" Lora wordmark + tagline:
  `https://assets-persist.lovart.ai/agent_images/4fae3b7a-9ca0-4f18-8af3-85493bb50954.svg`
- **Horizontal lockup (mark left of wordmark) — for nav bars; + REVERSED (white/gold on indigo) for dark & Dusk** (both in one file):
  `https://assets-persist.lovart.ai/agent_images/01641bfd-5556-4e57-9ccb-aff18538546e.svg`
- **SECONDARY — app icon (boxed indigo tile)** — favicon, app icon, social avatar, dark surfaces ONLY:
  `https://assets-persist.lovart.ai/agent_images/33d9b12f-12bb-4e63-9146-a414e832b22a.svg`
  (simplified/flat for 16–32px: `https://assets-persist.lovart.ai/agent_images/9f493e59-03ee-4953-b7e3-e04aa83c1068.svg`)
- **Transparent-background standalone mark (PNG)** for Canva / overlay / white-bg placement:
  `https://assets-persist.lovart.ai/tool/remove_background/cdb5ea19df05bc08fd8a85649b5989f2dfb7c2ef1d6bac5d936616412ff4f777.png`

> Note: the SVG wordmark is outlined vector (renders/scale perfectly). For live editable text, rebuild "Psychefolio" in Lora as a text element in the `<Logo>` component.

### Usage rules
- **Default to the standalone lockup.** Use the boxed **app icon only** for favicon / app icon / avatar contexts. Do not put the boxed tile where a free lockup belongs.
- **Clear space** = the height of the P on all sides; no crowding.
- On light: gold mark + indigo wordmark. On dark/Dusk: brightened gold `#E0B45A` + cream wordmark (use reversed asset).
- Client portal: show only the tiny **"powered by Psychefolio"** whisper (minute mark + muted text) in the footer — and it must be a tenant-controllable on/off setting.
- Don't stretch, rotate, recolor outside the palette, or add shadow/glow beyond a subtle gold glow on dark.

### `<Logo>` component variants
`lockup-vertical` (default) · `lockup-horizontal` · `reversed` · `icon` (boxed, favicon/avatar) · `monochrome` · `whisper` ("powered by").

---

## 5. Shape, elevation, motion

- Cards: `border-radius: 14px`, soft shadow `0 8px 24px rgba(20,26,46,.06)`, 1px hairline border `rgba(46,39,73,.06)`.
- Buttons: pill / fully rounded (`border-radius: 999px`). Primary = gold fill, ink text; secondary = transparent with 1.5px gold/indigo outline; ghost = text only.
- Inputs: rounded 10px, 1.5px border; focus ring = gold. On the signing "paper," fillable fields use classic light-blue-bordered inline boxes.
- Chips/pills: statuses & filters are pill chips; sage = ok/info, gold = attention/primary, muted = neutral.
- Spacing: 8px base grid; section padding 64–96px desktop; generous whitespace. Max content width ~1200px.
- Motion: gentle, slow fades/rises (200–300ms, ease-out); no bouncy/flashy animation. Constellation nodes may have a very subtle slow twinkle on marketing only.

---

## 6. Page structures (build targets)

### 6a. Public marketing homepage (/) — full Psychefolio brand
Banded editorial layout, static and fast:
1. **Top nav** (indigo): use the **horizontal lockup** (or standalone mark + wordmark); links Product / The Constellation / Security / Pricing / For Practitioners; gold "Book a demo" pill; EN/ES toggle.
2. **Hero** (indigo, faint starfield + subtle constellation network): Lora display "The operating system for inner work."; Poppins subhead (client portal, scheduling, billing, signed consent, AI practice manager — built inside a real practice, every insight cited in the client's own words); gold "Start your practice" + outline "See it in action"; trust line "AI proposes. You decide."
3. **Feature band** (cream), 3 cards: The Constellation (living psyche map, stars backed by tappable evidence) · Evidence over vibes (AI cites client's own words or stays silent) · Armor for your practice (consent, sealed audit trails, receipts, contemporaneous records).
4. **Product band** (indigo): dashboard constellation-map panel — glowing connected nodes, one gold node with an evidence citation chip.
5. **Constitution band** (cream), Lora title "Built on a written constitution": Evidence-mandatory AI · Consent precedes capability · No diagnosis, ever · Human gates respected · Bilingual EN/ES by design.
6. **White-label band**: two mini browsers — one Psychefolio indigo, one re-skinned in a neutral tenant palette — caption "Your client portal wears YOUR brand. Psychefolio is the stage, not the star."
7. **Closing CTA** (indigo): gold "Book a founding-cohort demo."
8. **Footer** (ink): link columns, standalone mark, tiny whisper.

### 6b. Practitioner portal — "The Study" (/practitioner) — full brand
- **Top chrome:** indigo bar with the **horizontal/standalone lockup**; nav Today · Clients · Leads · Messages · Library · Courses · Schedule · Billing · Agreements · Notes · Settings; search; bell; avatar + name; sign-out.
- **Today home:** Lora greeting ("Good afternoon, Valentina.") + gold rule; left column = "WORTH A LOOK" attention feed (crisis flags first, then care-suggested/inactivity/mood dips/stale invites/agreements awaiting signature, with sage/gold signal dots) + "QUIETLY, THIS WEEK" activity murmur; right rail = six billing/overview stat cards (Collected · Waiting to be paid [gold outline highlight] · Out of sessions · Sessions not yet billed · Booked ahead 7 days · On last session); a navy **AI Practice Manager** card with chat prompt and gold "AI proposes — you decide" badge; quick-action pills (Invite a client / New worksheet / Search).
- Other surfaces per UX brief: Clients roster, the 14-tab client Portrait, Agreements desk (four door-cards + "Waiting on your countersign" + "In motion" journey bars Sent→Opened→Signed→Countersigned→Sealed), Billing six-box, Library folders, Notes/Margins, etc.

### 6c. Client portal — "The Sanctuary" (/space) — white-label, calm
- **Chrome:** slim cream top bar with the TENANT's wordmark (not Psychefolio), light nav Your map · Your path · Your journey · Sessions · Your design · Messages; bell; client avatar.
- **Home:** deliberately near-empty, centered — Lora time-of-day greeting ("Good morning, María."); one rotating italic serif quote on a white card; single gold "Begin a reflection" button; three quiet links (Your map / Your path / Your journey); two soft cards (Your next session with sage "Join video"; A note from your practitioner); faint constellation watermark; footer tiny "powered by Psychefolio" whisper (toggle).
- Other surfaces: New reflection, Journey timeline (Growth Vault), Your map (first-map keepsake), Path prompts, Worksheets, Courses, Your design/Reading (Human Design chart + chaptered reading), Booking + warm agreement gate, Messages (Open Line), Agreements shelf, Intake wizard, Consent ceremony, Profile/Settings (EN/ES toggle, light/Dusk, data export).

### 6d. Signing experience (/agree/[token]) — no login, shared
- Sticky dark **guide bar** ("6 to complete · We'll walk you through each field" + gold "Next field →").
- The document as **PAPER**: warm white letterhead sheet, serif body at full length (no inner scroll), light-blue-bordered fillable boxes inline in sentences, dashed gold "Sign here ✍" box (tap → draw pad), auto-date + printed-name boxes.
- Below: e-records disclosure, acknowledgments/initials, one gold "I agree and sign" (blocked until signature present), quiet "I'd rather not sign" link. Done state → "Download your sealed copy." Renders fully in Spanish for es-locale.

---

## 7. Responsive & bilingual
- Desktop: slim top nav (client) / top nav or sidebar (practitioner).
- Mobile: bottom tab bar (4 tabs + "More" sheet), wordmark up top; action sheets slide up. Thumb-reachable.
- Bilingual EN/ES is architecture: every client-facing string has a full ES equivalent; locale toggle in settings; Spanish documents render fully in Spanish. Build strings externalized (i18n keys), no hard-coded copy in components.

## 8. Reference renderings (match these visually)
- Brand spec sheet (v1.1, tokens/type/logo): `https://a.lovart.ai/artifacts/agent/e29gfFukZz8peBLN.png`
- Public homepage: `https://a.lovart.ai/artifacts/agent/0LCM8kyzH76yJJfb.png`
- Practitioner Study dashboard: `https://a.lovart.ai/artifacts/agent/XPcVk3Ot642GZAH9.png`
- Client Sanctuary home: `https://a.lovart.ai/artifacts/agent/NA8WXbozXdH64TCL.png`
- Dusk/dark mode variants (Sanctuary + Study + signing): `https://a.lovart.ai/artifacts/agent/iq9wcy9ZgN22xP8X.png`
- Print stationery set: `https://a.lovart.ai/artifacts/agent/ApyW2uvWFdHTtBaP.png`
- Business card front/back: `https://a.lovart.ai/artifacts/agent/jvtXGxjC4SGRIMTt.png` · `https://a.lovart.ai/artifacts/agent/XfkwPh0MfS4R69PB.png`

## 9. Suggested implementation
- CSS custom properties for tokens (§2); if using Tailwind, map `colors`/`fontFamily` to the same names.
- One `<Logo>` component with variants: `lockup-vertical` (default) · `lockup-horizontal` · `reversed` · `icon` (favicon/avatar) · `monochrome` · `whisper`.
- Theme toggle sets `data-theme="dusk"` on `<html>`; respect system preference + persisted choice.
- i18n via a dictionary (en/es); default en, ES parity required for client strings.
- Drop the logo files into `/public/brand/` and reference by variant.

---

## 10. Claude Code handoff notes

- Save this file as `BRAND_HANDOFF.md` in the project root and treat it as the **visual identity source of truth**.
- The asset URLs above are intended to be fetched directly during implementation, or the assets may be downloaded into `/public/brand/` and referenced locally.
- Product behavior remains intentionally lean here. Use the separate UX/UI feature brief for detailed screen-by-screen functionality; this document governs brand, visual language, component styling, and the target page structures.
- The supplied SVG wordmarks use outlined vector text. If editable/live text is preferred, rebuild the "Psychefolio" wordmark in **Lora 600** inside the `<Logo>` component while preserving the approved proportions and spacing.
- Where any earlier Psychefolio brand handoff conflicts with this file, **this consolidated v1.1 file wins**, especially the logo hierarchy: standalone lockup is primary; boxed app icon is secondary and limited to favicon/app/avatar contexts.

