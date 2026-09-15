# Client Services Agreement v3.1 — Install Report
**For Jacob** · August 2026 · per the install spec's "surface, never resolve silently" rule.
Counsel's text installed **byte-for-byte verbatim** (SHA-256-matched against the upload) as a
**DRAFT** template — preview works everywhere, every send path refuses it until you flip it live
from the database (`AgreementTemplate.status: DRAFT → ACTIVE` for slug `client-services-agreement`).

## 1. Missing v3.0 sections (markers left intact — nothing reconstructed)
The v3.1 delta references these; assembling the complete document = pasting v3.0's text at the
markers, verbatim, when you supply it:
- Sections 9–13 · Sections 15–21 · Sections 23–24 · Sections 26–27
- Exhibit A: content through Part 2, and Parts 3–6
- Addendum M: body (only the new custody/subpoena checkbox is in the delta)
- **Addendum R: entire text** · **Addendum P: entire text**

## 2. Merge variables — mapped vs. unmapped
**Mapped to live data** (never hardcoded): `client_name`, `date`, `practitioner_name`,
`notice_window_hours` ← SchedulingConfig.cancelCutoffHours, `late_change_fee` ← the live fee
setting (formatted), `single_session_rate` ← the active SESSION price-book rate,
`payer_name_or_self` ← the client's payee field (else "Self"). `package_name`, `price`,
`session_count` come from the send form / package trigger.

**Unmapped — no data source exists yet** (the spec says add to a SOW model; flagging instead of
inventing one): `late_cancellation_credit_treatment`, `personalized_deliverables_and_value`,
`credit_expiration`. They render as visible `{{variables}}` in the DRAFT preview and must be
supplied at send time until a SOW model carries them. **Note: `credit_expiration` is also a
product decision — packages currently never expire in the system.**

**`[practice email address]`** (Exhibit B, 4 occurrences): filled at render from
`PRACTICE_EMAIL` (falling back to `NOTIFY_FROM_EMAIL`) — **the env var needs setting in
Railway**; until then the bracketed placeholder shows, which is honest for a draft.

## 3. Vendor-list reconciliation (§7) — text ↔ platform, per the no-silent-fixes rule
| §7 names | Reality in the codebase | Who moves |
|---|---|---|
| **AssemblyAI** (session-audio transcription, vendor copy deleted) | **MATCHES.** The shipped pipeline's transcription adapter IS AssemblyAI, and the vendor-copy deletion is implemented and verified. The install spec's claim that "our C19 architecture uses Pocket — AssemblyAI is not in the stack" is **outdated/incorrect**: Pocket is an unbuilt backlog item; AssemblyAI is the built adapter. | Nobody — but reconcile the internal notes so the next doc doesn't re-flag it. |
| **Cloudflare R2** (file storage) | **NOT YET LIVE.** The storage adapter runs its local-disk driver; R2 is the planned config swap. | Either counsel softens to "cloud file storage" or we prioritize the R2 cutover before release. |
| **Twilio (optional SMS)** | **NOT IN THE STACK** — no SMS anywhere. | Fine as "optional" if truly optional; otherwise strike. |
| "astrology-chart computation service and geocoding provider" | astrology-api.io + the geocoding service — real. Counsel asked them named in the Privacy Policy; the subprocessor table in `docs/ATTORNEY-BRIEF-CLIENT-CONTRACT.md` has the authoritative list. | Privacy Policy naming. |
| Railway, Square, Resend, Anthropic | All match. | — |

## 4. Other reconciliations
- **§2 credentials paragraph** (dual BS degrees, USF, Master/Advanced facilitator level): needs
  **Valentina's personal confirmation** — it's her CV under oath, effectively.
- **`feeEnabled` toggle:** the spec says the fee merge "respects feeEnabled" — **no such flag
  exists**; the system has a fee amount + auto-apply toggle, and the fee is always assessable.
  If a kill-switch is wanted, that's a small build on request.
- **Late-fee proportionality** (counsel's liquidated-damages note): a soft warning now shows in
  her fee settings when the fee exceeds the current session rate. Never blocks — her call.

## 5. Engine features built for this document (all verified, 25/25)
- **Per-item acknowledgments:** the signature page's 9 initial points + Exhibit B's checkbox are
  captured individually (typed initials / checkbox), required-before-signing, attributed, stored,
  and rendered on the sealed PDF with their full text and timestamps.
- **Key-terms freeze:** the signature-page terms render as a table and the resolved values are
  frozen into the sealed record (mergeData + a KEY TERMS section in the sealed PDF).
- **Booking gate:** the master carries require-before-booking; the portal blocks new booking
  until required signatures complete and releases on completion (family-aware: every required
  doc gates independently).
- **Addendum P is a real feature:** a versioned, revocable per-client election now gates the
  Pattern-Library aggregation — opting one client out verifiably drops the k-count below the
  floor. **Two decisions pending you/counsel:** (a) default direction — currently
  participate-by-default (preserves existing behavior; one constant flips it to strict opt-in);
  (b) the client-facing election control ships together with Addendum P's text (an election
  without its document would be contextless — capture surface is ready to wire).
- **Addendum R:** retention drafted at 3 years lives in ONE config (`RETENTION_YEARS` env,
  default 3) and the client-facing schedule note reads from it. **Automated purge-at-expiry
  machinery does not exist yet** — it gets built against this same constant when R's final text
  lands.
- **Addendum M:** document family supported; **minors pathway intentionally absent.** Deviation
  from the spec's "block at invite": invites carry no date of birth — the platform first learns
  DOB in intake, so the gate lives at intake completion: under-18 completion is refused with a
  calm client message, nothing is lost, and Valentina is notified (event + email). Report line:
  *Addendum M — document present, product support intentionally absent.*

## 6. Outstanding before release (from counsel's summary — people, not code)
Late-fee reasonableness vs session price · cyber-liability insurance in place (§22 references
it) · qualified Spanish legal translation (the es sibling must be counsel-blessed before an
es-locale client can be served this master) · final Ch. 490 title blessing · `PRACTICE_EMAIL`
env value · Addendum R retention period confirmation (3-year default) · supply v3.0 text ·
then flip the template ACTIVE.
