# Attorney Brief — Client Contract & Consent Documents
### Engineering-side inventory of legal exposure, grounded in what the app actually does
**Prepared:** August 2026 · **For:** counsel drafting the Client Services Agreement, Scope of Work, Recording Addendum, e-records disclosure, privacy policy, and retention language.
**Framing:** This is a factual briefing from the people who built the system — what it does, what data flows where, and where we see exposure. It is not legal advice; every judgment call here is counsel's to make. Where the app already displays consent or disclaimer language, the file path is given so the contract and the screens can be kept word-for-word consistent — divergence between what a client signs and what the app tells them is itself a risk we want to eliminate.

---

## 1. Nature of the services — the single most important framing

- The practice is **coaching/consulting, not healthcare**. The app already footers every email with "Coaching — not medical or psychological treatment." The contract needs the load-bearing version: no diagnosis, no treatment, no therapist–patient relationship, not a substitute for medical or mental-health care, client remains responsible for their own decisions.
- **Title/scope caution:** public-facing materials describe Valentina as a "Neuropsychology Specialist & PSYCH-K® Consultant." Florida regulates psychology titles and practice (Ch. 490, Fla. Stat.). Counsel should confirm the title and all marketing/app copy stay safely outside licensed-practice territory, and that the contract's services definition matches.
- **Esoteric/reflective modalities:** the app computes and displays astrology-style charts, an energetic "body graph," archetypal keys, values assessments, numerology, and offers in-session card draws. All app copy frames these as *reflective tools* ("a map to explore with curiosity," "keep what rings true"). The contract should mirror that: for self-reflection and conversation only; no predictive, medical, financial, or legal reliance. Some jurisdictions regulate divinatory services — worth a check for Florida/Orlando.
- **PSYCH-K®** is a licensed/trademarked modality — confirm her facilitator license permits the use and that the contract's descriptions comply with its terms. (In code we deliberately use neutral, trademark-free module names; her branded labels are her own data entries.)

## 2. AI involvement — disclose it, bound it

What the AI actually does, so the disclosure can be accurate rather than generic:
- **AI-generated readings:** the "integrative reading" woven from chart data is LLM-generated (Anthropic). A practitioner review-and-hold toggle exists before publishing to the client.
- **Session-note extraction:** recorded sessions are transcribed (AssemblyAI) and an LLM produces *draft* observations. **Hard boundary, verified in code:** nothing AI-generated reaches a client's record without an explicit practitioner approval action — drafts are authored by her, not the machine. The contract can honestly say AI output is always practitioner-reviewed before it becomes part of the record.
- **Pattern analysis:** an AI layer surfaces themes from client writing for the practitioner, with pseudonymization applied before content leaves our systems for the pattern-analysis pipeline.
- Suggested contract elements: disclosure that AI tools assist the practitioner; accuracy not warranted; outputs are interpretive aids, not conclusions; consent to AI processing of session and journal content; list of AI vendors as subprocessors (below).

## 3. Session recording — likely the sharpest liability point

- **Florida is an all-party-consent state (Fla. Stat. §934.03).** The app enforces this mechanically: the recording pipeline refuses to run without a stored, versioned, revocable `RecordingConsent` for that client. The Recording Addendum text must satisfy §934 and match the consent text stored in the app (constant `RECORDING_CONSENT_TEXT`, surfaced at intake Review and in client Settings).
- Facts counsel can rely on: consent is captured before any recording is processed; consent is revocable in-app; the **vendor's transcript copy is deleted after we normalize it** (verified behavior); recordings/transcripts live in our storage with practitioner-gated access.
- Open items for the addendum: what happens to *existing* recordings when consent is withdrawn (current behavior: pipeline stops going forward; retention of prior materials is a policy decision that needs words); sessions where a third party is present (partner, guest) — whose consent is collected; virtual vs in-person capture.

## 4. Crisis language, safety features, and the duty question

This one is subtle and worth counsel's specific attention. The app *detects crisis-adjacent language* in client messages, shows the client crisis resources (988 etc.), and flags the message for the practitioner. Messaging is deliberately asynchronous, with an on-screen "response rhythm" note that replies come in the practitioner's own time.

- The exposure: having built detection, we must not let the contract or marketing imply *monitoring*. The contract should state plainly: the platform and practitioner do not monitor communications in real time; the service is not an emergency or crisis service; in an emergency call 911/988; automated safety prompts are a courtesy, not a duty undertaken.
- Counsel should draft so the safety features cannot be read as an assumed duty of care, while remaining consistent with what the screens actually show.

## 5. Data: what we hold, where it flows, what we've already promised

**Held:** identity/contact; birth date, time, and place with coordinates (needed for charts); journals and reflections (often mental-health-adjacent content); the full message thread; worksheet and assessment answers; session recordings and transcripts (with consent); billing history; e-signature attribution (typed name, IP address, user agent, timestamps); signed agreement PDFs with SHA-256 integrity hashes.

**Third-party processors (for the privacy policy's subprocessor list):**
| Vendor | What flows there |
|---|---|
| Railway | hosting + database |
| Square | client payments; cards held by Square, never by us (our stored tokens are AES-256-GCM encrypted) |
| Stripe | platform-side subscription billing (practitioner-facing, not client data) |
| Resend | transactional email delivery |
| AssemblyAI | session audio for transcription (vendor copy deleted post-transcription) |
| Anthropic | AI processing of session/journal content (pseudonymized where the pipeline supports it) |
| astrology-api.io | birth date/time/coordinates for chart computation |
| Geocoding provider | birth-place text → coordinates |

**Promises already on-screen that the contract must not contradict** (this exact sentence is shown and stored at intake): *"The details above are kept privately as part of your record with your practitioner, used to prepare your maps and support your work together, and never shared or sold. You can ask to see or remove your data anytime."* (`lib/copy/en.ts`, plus the master consent text in `content/consent.md`.) The app delivers on it: client data export and a deletion-request flow exist. **Carve-out counsel must word:** signed agreements are excluded from deletion scope by design (legal-records retention) — the retention clause needs to say this, and it must sit consistently next to "remove your data anytime."
- Not a HIPAA covered entity (coaching) — the contract should *avoid* implying HIPAA protections while still committing to confidentiality; counsel to word the confidentiality clause and its limits (subpoena, imminent-harm, etc.).
- Breach notification: Florida FIPA (§501.171) timelines should shape the incident clause.
- The app is bilingual (en/es) and clients may reside outside Florida or the U.S.; choice of law/venue and any cross-border data language should account for that. Agreements are served in the client's language — **counsel must bless both language versions**, since the signature binds to the version actually read.

## 6. E-signature mechanics (built to ESIGN/UETA — needs counsel's words)

The signing system records: document viewed, the e-records disclosure shown (timestamped), typed full legal name, optional drawn mark, IP + user agent, authenticated session or verified email link as the identity basis, countersignature, and a sealed PDF whose SHA-256 hash is re-verified on every download (tamper-evidence). An append-only audit trail becomes a certificate page in the PDF.
- **Counsel must supply:** the e-records/consumer-consent disclosure wording (the current text is a marked placeholder), the right-to-paper-copy language, and the retention statement. All agreement template texts are placeholders until this pass — the app displays a standing banner saying so and it stays until real texts land.
- A "mark as signed on paper" escape hatch exists for wet-ink cases.

## 7. Commercial terms the contract must contain (the app already enforces them)

These are live, enforced behaviors — the contract should state them so the machinery has contractual footing:
- **Scheduling policy:** client self-reschedule/cancel allowed up to a **24-hour boundary**; inside it, a **$50 late fee** is assessed (waivable by the practitioner). Counsel: liquidated-fee enforceability wording.
- **Packages/credits:** prepaid session packages with a credit ledger; define expiration (currently none enforced in code — a policy decision), refund treatment (a refund path exists that releases unused credits), and what happens to covered sessions on refund.
- **Card on file / auto-charge:** session fees can be charged to a saved card; the contract needs express card-on-file authorization language (also a Square program requirement).
- **Third-party payer ("payee") arrangements:** the app supports a parent/partner/employer receiving the client's invoices with service descriptions. This intersects confidentiality — the contract should have the client authorize exactly what a payee may see, and clarify the client (not the payee) is the contracting party.
- Price-change notice, chargeback/collections posture, and the required-agreement-before-booking gate (the app can block new bookings until the services agreement is signed — the contract should reference that sequence).

## 8. Entity separation — practice vs. platform

The platform (new LLC, "Veritas") is being built as a multi-practitioner product; Square/Stripe developer accounts sit under the LLC deliberately. Counsel should keep two documents cleanly separated:
1. **Her client-services agreement** — client ↔ practice.
2. **Platform terms/privacy** — the LLC as software vendor/data processor for the practice.
Get the liability flow-down and data-controller/processor roles right now, while there's one practitioner — it's much harder to retrofit at practitioner #2. (Also on counsel's list: the Valentina founding-partner agreement; her billing page already reads "Founding partner — no platform charges" pending it.)

## 9. Gaps we're flagging ourselves (engineering will build to whatever counsel decides)

- **No age verification exists in the app.** The contract should require 18+ (or defined guardian-consent handling), and tell us if an age gate should be built.
- **Data retention schedule** beyond "agreements are kept": how long recordings, transcripts, messages, and journals persist after a client relationship ends is currently unbounded — needs a stated policy we can then enforce in code.
- **Service availability:** hosted on commercial infrastructure with no SLA to clients; the contract should disclaim uninterrupted availability and cap platform-outage liability.
- **Website/ADA accessibility** posture and **CAN-SPAM/TCPA** (email reminders are transactional today; if marketing sends ever start, consent language should already be in place).
- Standard protective set (counsel's domain, listed for completeness): limitation of liability + damages cap, warranty disclaimer, indemnification, dispute resolution/venue (Orlando?), severability, assignment, entire-agreement clause that expressly includes the in-app consents.

## 10. The one coherent set — where every existing legal text lives

For consistency, these should be revised together as a single pass:
| Text | Where it lives | Status |
|---|---|---|
| Master data consent (shown at invite + re-ask) | `content/consent.md` | live wording, needs review |
| Intake data acknowledgment | `lib/copy/en.ts` (`dataAck`) | live wording, needs review |
| Recording consent | `RECORDING_CONSENT_TEXT` constant | live wording, needs review |
| E-records disclosure | `lib/agreements/index.ts` | **placeholder** |
| 3 agreement templates × en/es | seeded `AgreementTemplate` rows | **placeholders, banner-flagged** |
| Crisis resources + response-rhythm copy | messaging surfaces | live wording, needs review |
| Email footer disclaimer | envelope template | live wording, needs review |

New template versions drop in as data — no code changes needed when counsel's texts arrive.
