# Psychefolio — UI/UX Feature Summary for Design Renderings

**Audience:** an AI/visual designer producing renderings of the website and both portals
(functional layout + look-and-feel). Everything under "Current" exists and is live;
"Planned" is specced or queued. Screens are listed with their purpose, key components,
and states, so each can be rendered faithfully.

**What the product is:** a private practice platform for a personal-development
practitioner (PSYCH-K® facilitation, human-design/astrology-informed coaching — strictly
non-clinical). One practitioner serves a roster of clients. Two portals share one design
system: the **Client Portal ("The Sanctuary")** — a calm, journal-like private space —
and the **Practitioner Portal ("The Study")** — the practice's working desk. The platform
is multi-tenant (other practitioners can be provisioned with their own branding), but
Valentina Vélez's practice is the reference implementation to render.

---

## 1. Current design language (the baseline to honor or consciously evolve)

- **Palette "Warm Stone":** cream/ivory canvas (#FEF4EA-ish), white cards, deep
  **wine** (#580C22) as the single action color, **blush** pink tints for selected/soft
  states, **mocha/tan** (#B79175) for eyebrows and accents, warm gray "whisper" text.
  A full **"Dusk" dark mode** exists (deep plum-brown surfaces, same accent logic).
- **Type:** serif display face (Georgia-family) for headings and the wordmark
  ("veritas ✦"), humanist sans for body/UI. Small uppercase letter-spaced eyebrows
  label every page ("AGREEMENTS", "YOUR MAP").
- **Shape language:** generous rounded cards (~14px), soft shadows, pill chips for
  statuses and filters, a short tan "signature rule" underline beneath page titles.
- **Voice:** warm, unhurried, second-person, no dark patterns ("Read it in your own
  time", "Nothing else happens without you"). Bilingual en/es — every client-facing
  surface renders fully in Spanish for es-locale clients.
- **Layout chrome:** desktop = slim top nav (client) / top nav or sidebar (practitioner);
  mobile = bottom tab bar (4 tabs + "More" sheet) with the wordmark up top. Action
  sheets slide up on mobile for menus.
- **Non-negotiables for any redesign:** legal/consent text renders verbatim (chrome may
  change, words may not); one unambiguous primary action per signing screen; calm over
  dense; the client side must never feel like software for a business.

---

## 2. Client Portal — "The Sanctuary" (/space)

Nav: Your map · Your path · Your journey · Sessions · Your design · Settings · Messages.

| Screen | Purpose & key components |
|---|---|
| **Home** (/space) | The centering screen: time-of-day greeting ("Good morning, María."), one rotating short quote, a single wine **"Begin a reflection"** button, quiet links to Map/Path/Journey. Deliberately near-empty — render the calm. |
| **New reflection** (/space/new) | Journaling capture: mood selector, free-writing area, tag chips, save. |
| **Entry view/edit** (/space/entries/[id]) | A kept reflection with edit/delete; "Deepening" follow-through prompts can appear beneath (AI-assisted, gentle). |
| **Your journey** (/space/journey) | The Growth Vault: chronological timeline of reflections, prompt responses, session moments, worksheets — cards on a soft vertical spine, with mood dots and tag chips. |
| **Your map** (/space/first-map) | First-map ceremony/overview of their inner-work map (themes, beliefs surfaced so far) presented as a keepsake, not a dashboard. |
| **Your path — prompts** (/space/prompts, /[id]) | Assigned exercises/prompts from the practitioner: to-do list of cards, a response screen (Reflection Portal) with the prompt text and a writing area, done list below. |
| **Worksheets** (/space/worksheets/[assignmentId]) | Structured fill-in worksheets (field system: text, choices, scales) assigned by the practitioner; progress saves as they go. |
| **Courses** (/space/courses…) | Course shelf → course outline → lesson player (rich text lesson, inline exercises, next/prev, progress ticks). |
| **Your design** (/space/design, /design/reading) | Their Human Design chart (bodygraph rendering), plus computed panels (western natal positions, vedic, numerology) and the long-form **personal Reading** — chaptered, reveal-as-you-scroll, downloadable as a keepsake PDF. |
| **Sessions** (/space/schedule + sub-screens) | Booking: calendar of open slots, confirm screen, package purchase (/packages/[id]), pay screen for session charges (/pay/[chargeId]), self-reschedule and cancel flows with the 24-hour policy explained in plain words. A warm gate card ("One thing before we begin") blocks booking when a required agreement is unsigned. |
| **Messages** (/space/messages) | The Open Line: a single thread with the practitioner — bubbles, reference cards (a reflection or worksheet can be attached), the practitioner's response-rhythm note, safety-net copy. |
| **Agreements** (/space/agreements, /[id]) | Their document shelf: each sent document with state; the **signing experience** (see §4). Sealed PDFs downloadable forever. |
| **Intake** (/space/intake) | Guided multi-step intake wizard (one section per screen, autosave, birth data with "time unknown" reassurance, guardian-notice screen if under-18). |
| **Consent** (/space/consent) | First-run consent ceremony: plain-language consent text (verbatim), one affirmative action. |
| **Pay link** (/space/pay-link/[paymentId]) | A single payment card for a quick-pay request (amount, memo, Square checkout button). |
| **Profile & Settings** (/space/profile, /space/settings…) | Profile (birth data, payee), settings: language toggle (en/es), appearance (light/Dusk), consent review, data export & deletion requests, agreements + retention note, keepsake download, account security. |

---

## 3. Practitioner Portal — "The Study" (/practitioner)

Nav: Clients · Leads · Messages · Library · Courses · Schedule · Billing · Agreements ·
Notes · Settings (+ Search; mobile More-sheet adds Worksheets, Patterns, Availability).

| Screen | Purpose & key components |
|---|---|
| **Today** (/practitioner) | Home: greeting, today's session list, **"Worth a look"** attention feed (crisis flags first, then care-suggested, inactivity, mood dips, stale invites, agreements awaiting signature/countersign), "Quietly, this week" activity murmur, quick actions (Invite a client, New worksheet, Search). |
| **Clients** (/practitioner/clients) | Roster: filter pills (Everyone / Worth a look / program stages), enriched client rows (name, stage, last activity, signal dots), invite flow. |
| **The Portrait** (/clients/[clientId]) | The client file — one header (name, stage-setter, "since" line, assist-mode entry) over **14 tabs**: Record (unified timeline), Map, Guide (integration guide), Margins (private notes), Messages, Prep, Between (prompts/worksheets sent), Goals, Beliefs, Outcomes, Ask (ask-the-record AI), Courses, Profile, Billing, **Agreements** (per-client document list with states + sealed PDFs). Sub-screens: session **Prep Room**, book-for-client, their design + reading (practitioner view with edit/regenerate). |
| **Leads** (/practitioner/leads) | Discovery-call pipeline: lead cards with status, convert-to-client. |
| **Messages** (/practitioner/messages, /[clientId]) | Inbox across clients with unread badges; per-client thread with reference cards and safety-flag surfacing. |
| **Library** (/practitioner/library…) | The content library as **folders on a computer**: breadcrumb, grid/list toggle, sort, search; items = worksheets, prompts, courses, docs, links; drag-to-move, rename, ⋯ action sheets; "＋ New" sheet. |
| **Worksheet studio** (/practitioner/worksheets…) | Builder for structured worksheets (field palette, AI authoring studio, preview-as-client). |
| **Prompt studio** (/practitioner/library/new, /[promptId]) | Compose/edit prompts & exercises; assign to clients. |
| **Courses** (/practitioner/courses…) | Course outline builder, lesson editors, publish + preview-as-client. |
| **Schedule** (/practitioner/schedule) | Her calendar: sessions with video links, reschedule/cancel, ICS feed. |
| **Availability** (/practitioner/availability) | Hours, session length, buffers, video-link config. |
| **Billing** (/practitioner/billing, /rates) | Six-box owner dashboard (money in motion, owed, packages, renewals, reconciliation "Worth a look"), ledger with actions (charge saved card, invoice, renewal email, waive late fee), rates & packages page. |
| **Payments** (/practitioner/payments) | Square payment ledger + quick-pay link creator. |
| **Agreements desk** (/practitioner/agreements) | **Action-first**: four door-cards — *Send a document · Create a sign link · Upload a document · Manage documents* (badge when updates pending) — a one-line "Your signature" card (stored mark preview), a wine **"Waiting on your countersign"** alert block with one-click countersign, and **"In motion"**: recent sends as cards with a **colored journey bar** (Sent → Opened → Signed → [Countersigned] → Sealed; struck-through for declined/expired/voided) + Remind/PDF actions. |
| **Agreements sub-pages** | **/send** (to a client with merged preview, or to anyone by email), **/link** (create a no-email sign link; link appears in place with Copy button), **/upload** (3 fields → visual preview page showing the converted document with every detected field pilled in place → Send now / Save as template / Discard), **/templates** (library rows: triggers as toggle pills, DRAFT preview, self-sign, Retire; install/update buttons), **/all** (archive: one tile per document with counts → shelves + grid/list of its requests with journey bars), **/preview** (merged preview with highlighted values before a client send). |
| **Notes — The Margins** (/practitioner/notes…) | Her private notebook: jots and notes, threads, tags, link-to-record, AI connection-scan; **Inbox** for reMarkable-scanned pages and session-recording extraction drafts (review → accept/edit/discard; drafts never touch the client record until accepted). |
| **Captures** (/practitioner/captures) | Session-audio capture list (consent-gated recording pipeline). |
| **Patterns** (/practitioner/patterns) | The Pattern Library: k-anonymous archetype vocabulary (label + counts only, k≥5 floor), never client-identifiable. |
| **Tools** (/practitioner/tools, /draw, /lookup) | Session tools: tarot-style draw tool, lookup console (astrology/numerology probes). |
| **Search** (/practitioner/search) | Everything-search across clients, record, notes, library. |
| **Settings** (/practitioner/settings…) | Account/security, language & appearance, practice links, **Your signature** (draw or upload once; auto-applies with date), session-change policy (late-fee with proportionality soft warning), assist-session transparency toggle, deletion requests, intake preview, payments connection (Square OAuth), platform plan & billing (Stripe portal). |

---

## 4. The signing experience (no-login surfaces — shared by both portals)

- **/agree/[token]** — the signature page anyone can open from an email button or a
  passed-along link (client, lead, or a third party like a payer; renders in Spanish
  for Spanish documents). Layout: eyebrow + one-line reassurance → sticky **guide bar**
  ("6 to complete · We'll walk you through each field" + **Next field →** button that
  scrolls/flashes the next empty box) → **the document as PAPER**: white letterhead
  sheet (practice name + VIIIV CORP), serif body at full length (no inner scroll box),
  **fillable boxes rendered in place** (classic light-blue bordered inputs with labels,
  inline in the sentences), and the document's own signature line live: dashed wine
  **"Sign here ✍" box** (tap → draw pad slides up; the drawn mark lands in the box),
  auto-date box, printed-name box. Below the sheet: e-records disclosure card,
  any standalone fields, required acknowledgment checkboxes/initials, one wine
  **"I agree and sign"** button (drawn signature is required — blocked with a clear
  message otherwise), and a quiet "I'd rather not sign" link. Done state offers
  "Download your sealed copy". Attached files (uploaded PDFs) list above with open links.
- **Sealed PDF** — the permanent record: the document with values and signatures placed
  at their in-document spots, key-terms table (master agreement only), acknowledgments,
  file hashes for attachments, and a final **Audit Certificate** page (every event,
  timestamped, attributed).
- **/invite/[token]** — client invitation acceptance (name, password, consent hand-off).
- **Login family** — /login (platform-branded), /forgot, /reset, /must-change.
- **Emails** — one branded "envelope": cream background, white card, serif heading,
  tan rule, one wine pill button, per-send timestamp whisper, warm signoff. Used for
  invites, session reminders, payment links/invoices (PDF attached), agreement sends,
  sealed copies.

---

## 4b. Public front door (no login — the marketing & growth surfaces)

| Screen | Purpose & key components |
|---|---|
| **Landing one-pager** (/) | The practice's ad: banded editorial layout, her brand assets, static and fast. |
| **Discovery booking** (/book, /book/confirmed) | Prospect books a free discovery call: live open slots, simple form, warm confirmation; /discovery/[token] is the no-login reschedule/cancel page from the confirmation email. |
| **Join** (/join, /join/thanks) | The "event floor" capture: ONE phone-first, thumb-reachable screen (name + contact, optional referral code) for signing up interest in seconds at a live event; thanks screen. |
| **Practitioner signup** (/signup, /signup/welcome) | Self-serve practitioner onboarding: one bilingual phone-first screen (practice name, subdomain with live availability probe, email, password, optional referral) → a real working portal on their own subdomain; welcome screen hands them their door. |
| **Referral** | Referral codes thread through /join and /signup (attribution chips, share moments). |
| **Privacy** (/privacy) · **Unsubscribe** (/unsubscribe/[token]) | Plain document page; one-click calm unsubscribe for prospect emails. |

Prospect-facing **engagement emails** (C23-ENGAGE) use the same branded envelope.
Practitioner-side counterparts to render: a **Prospects/capture review** surface in The
Study (captured leads from events, engagement status).

## 5. Platform & admin (light-touch, worth one rendering each)

- **/admin/tenants/new** — platform-owner provisioning: create a practitioner tenant
  (name, subdomain, layout/skin, modules, demo data toggle).
- **Demo tenants** — same portals re-skinned (portal title wordmark swaps per tenant;
  login stays platform-branded); a demo banner ribbons non-production tenants.

---

## 6. Planned / queued (design ahead of build)

1. **Uploaded-PDF render-and-fill ("phase 2")** — DocuSign-class: real PDF pages
   rendered in-browser; practitioner drags labeled field boxes onto the pages (or
   auto-detected form fields appear pre-placed); signer taps box-to-box on the actual
   pages; values + signature stamp into the PDF itself. Needs: placement editor UI,
   signer page-viewer UI.
2. **Recording/Pipeline continuation (C19 phase 3+)** — richer session-recording
   review: per-session transcript view with speaker lanes, extraction-draft review
   flow already lives in Notes Inbox; future capture/organization layer ("Pocket").
3. **Canvas v1 (Platform phase 6)** — a freeform practitioner canvas/whiteboard
   surface for mapping client work (spec held; design freedom welcome).
4. **Client-facing Addendum P election** — a settings control for pattern-library
   participation (ships when its legal text lands).
5. **Master agreement release** — the v3.1 Client Services Agreement goes live once
   counsel items land; it uses the same paper signing experience (9 initials + a
   checkbox on its signature page).
6. **Client "keepsake" polish** — reading/keepsake PDFs and the first-map ceremony are
   candidates for elevated art direction.

---

## 7. Rendering checklist for the designer

Priority screens that define the product's feel:
1. Client Home (the calm) · 2. Client Journey timeline · 3. The signing page (paper +
guide bar + sign-here box) · 4. Practitioner Today ("Worth a look") · 5. The Portrait
(client file with tabs) · 6. Agreements desk (four doors + journey bars) · 7. Booking
flow · 8. Messages (both sides) · 9. The Reading (client design) · 10. Library folders ·
11. Billing dashboard · 12. The branded email envelope.
Render each in light "Warm Stone" and at least Home/Journey/Today in "Dusk" dark mode,
desktop + mobile (bottom tab bar) variants.
