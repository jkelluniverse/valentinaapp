# C20-AGREEMENTS-SPEC.md — Agreements & Signatures ("Signed, and kept")
### Send contracts and scope-of-work agreements, collect legally-binding e-signatures, seal and store them in the record. Built in-house on existing rails.

**Depends on:** AMD-01 (the consent pattern this generalizes) · EMAIL (send/remind) · AMD-05 (locale, settings)
· C1/C18 (onboarding + leads) · R2 storage · the audit pattern (money-grade, append-only).
**Legal frame (engineering it, not lawyering it):** US ESIGN/UETA make e-signatures binding when the system
shows **(1)** signer authentication/attribution, **(2)** clear intent to sign, **(3)** consent to do business
electronically, **(4)** the record delivered/retained tamper-evident, **(5)** an audit trail. Every element is
explicit below. **🟡 Standing flag: her attorney blesses the agreement texts + the e-records disclosure before
first real use — the machinery is ours; the words are law.**

---

## 1. Templates (hers, versioned, bilingual)

- **Agreement templates** live beside worksheets in the library: rich text + merge variables
  (`{{client_name}} {{date}} {{package_name}} {{price}} {{term}}`…), **versioned like consent docs** —
  a signed agreement pins the exact version text forever.
- Starter set she'll want: *Client Services Agreement* · *Scope of Work / Package Agreement* (merges the
  package + price) · *Recording Addendum* (pairs with C19's RecordingConsent) — texts drafted by her +
  attorney; the seed ships fixture-grade placeholders clearly marked.
- **en/es siblings** per AMD-05's content model; client is served their locale, signature binds to the
  version they actually read.

## 2. Send (manual + automatic)

- **Manual:** Portrait → Agreements → pick template → preview merged → **Send** (Envelope email + portal task).
  Works for **Leads too** (post-discovery, pre-portal: signed scope before they're even a client — same
  signed-link pattern as discovery reschedule).
- **Automatic triggers (per-template toggles, her Settings → Practice → Agreements):**
  - on invite acceptance → send + **optionally require before booking/first session** (a gate, plainly worded
    in the portal: "One thing to read and sign before we begin")
  - on package purchase → send the merged Scope of Work
  - on recording-consent grant → the Recording Addendum
- Reminders: one-tap + the standard gentle auto-cadence; states on the row: **Draft → Sent → Viewed → Signed
  → (Declined / Expired / Voided)** — voiding is hers, attributed, never deletes the history.

## 3. Sign (the flow that makes it binding)

In the portal (or the signed no-login link for Leads), the client:
1. **Reads the document** (full scroll; "viewed" timestamped).
2. Sees the **electronic-records disclosure** (ESIGN consumer-consent line: agreeing to receive/sign
   electronically, right to paper copy — one plain paragraph, her attorney's wording).
3. **Types their full legal name** (attribution) + optional drawn signature (canvas — warmth, not legality).
4. Taps **"I agree and sign"** — unambiguous intent, wine button, no dark patterns.
- **Attribution stack recorded:** authenticated session (or verified-email signed link for Leads) + typed
  name + timestamp + IP + user agent. Valentina **countersigns** the same way where the template asks
  (dual-signature docs) — her signing is one tap from the same row.

## 4. Seal & store (tamper-evident, theirs and hers)

On final signature the system generates the **sealed record**:
- A **PDF**: the exact agreement text (their locale version) + signature page (names, drawn marks if given,
  timestamps) + **audit certificate page** (every event: sent, viewed, disclosure shown, signed, countersigned
  — with attribution details) — branded, Envelope-calm.
- **SHA-256 hash of the sealed PDF** stored with the record; any future download re-verifies the hash
  (tamper-evidence). Original stored in R2 (signed URLs), append-only audit events alongside.
- **Both parties keep it:** client gets the PDF by email + a permanent "Your agreements" section in the You
  tab (part of their data export per AMD-05 — it's their document too); she gets the Portrait Agreements tab
  + library-wide list with states.
- Signed agreements are **excluded from deletion-request scope by default** (legal-records retention) — 🟡
  exact retention wording is an attorney/Valentina item on the standing list.

## 5. Build order & verify

- **G.1** Template model (versioned, merge vars, es/en) + starter placeholders + settings toggles.
- **G.2** Send paths (manual, triggers, Lead signed-link) + states + reminders.
- **G.3** Sign flow (scroll-view → disclosure → typed name + canvas → intent tap) + countersign.
- **G.4** Sealing (PDF + audit certificate + hash + R2) + both-party surfaces + export inclusion.
- **Verify:** María signs a merged Scope end-to-end (both locales tested); Lead Carmen signs pre-portal via
  signed link; hash re-verification catches a tampered byte; declined + voided states behave; the
  before-first-session gate blocks booking until signed and reads warmly; every event lands in the audit
  trail; her countersign completes a dual-signature doc.

## 6. Flags

1. **Attorney pass** on: agreement texts, the e-records disclosure, retention language. The build ships with
   placeholders; nothing real goes out before this.
2. **Notarization/wet-ink edge cases** (rare, e.g., certain jurisdictions/doc types) are out of scope — the
   row supports "mark as signed on paper" (upload scan, attributed) as the escape hatch.
3. **Provider adapter later if ever needed:** if a counterparty someday insists on DocuSign-style third-party
   certificates, an adapter can slot in behind the same Agreement model — the in-house path stays the default.
4. Platform-business note (from the practitioner-SaaS conversation): this component is *practice-scoped* by
   design; if multi-tenant ever happens, each practice brings its own templates — nothing here assumes otherwise.
