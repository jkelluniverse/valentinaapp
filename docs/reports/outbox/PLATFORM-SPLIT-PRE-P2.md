# PRE-P2 REPORT — exit-code audit · postal-address census · apex/MX check

All three read-only deliverables, plus the ordered harness-guard standing check
(ruling 92 item 1, regress.sh scope). Nothing else was fixed, per the dispatch.

## 1. Exit-code audit — regress.sh was the ONLY offender; every other runner is clean

Method: read the exit logic of every script the sweep calls and every audits/*
runner outside it; force one red empirically; cite the reds already observed live.

**The uniform idiom, verified file by file** (line numbers in the report's
commit): every tsx gate ends with `if (failed > 0) process.exit(1)` — or the
equivalent `process.exit(failed.length === 0 ? 0 : 1)` in email-identity,
fail-closed-tenancy, event-chrome — AND wraps main in `.catch(→ process.exit(1))`.
Confirmed individually: signup, capture, referral, engage, tenant-scope,
nested-stamp, settings-i18n, platform/verify + phase2/3/5 (and phase1/phase4
outside the set), c21, c20, v31, c12x fixture, onboarding ×5, password-reset,
amd06, practice-setting, email-identity, fail-closed-tenancy, event-chrome,
demo-path, gate-hygiene (explicit exit(0)/exit(1)), port-uniqueness (same),
stamp-audit (refusal path exit(1) + catch), smoke, smoke-writes, baseline,
billing b1–b4, pipeline/p12, remarkable-recording. lint-wall
(check-public-wall.mjs) and guard-prisma exit(1) on violations explicitly.
`npx tsc` and `next build` propagate their own exit codes (with the one KNOWN
exception already on the ledger: ruling 60 — a DB-less build exits 0 while
baking the unresolved root; that is a build-output gap, not exit handling, its
remedy is operational, and demo-path/event-chrome now assert the rendered root).

Mid-file `process.exit(0)` calls in email-identity/fail-closed/event-chrome are
their explicit FIXTURE-CAPTURE re-pin modes (and one subprocess probe), not
failure paths — read in context.

Empirical reds: smoke-writes forced against an unreachable database → exit 1
(quoted in the transcript). Already observed live: nested-stamp 42/43 → exit 1
(P1's sweep), gate-hygiene red (C29), port-uniqueness red (its first run).

Out-of-set one-shot scripts (audits/c12x-ai-pass/run.ts, run2-fixes.ts) carry a
single exit(1) each; nothing standing calls them. Listed for completeness.

**Ruling 92 item 1 built:** `REGRESS_SELFTEST=red|green` modes in regress.sh +
`audits/harness-guard-verify.ts` (5 checks) which runs the REAL script in both
modes every sweep and asserts exit-agrees-with-lines both ways. Standing set
36 → 37, the addition named; harness-guard sits after port-uniqueness,
stamp-audit stays LAST. Standalone run: 5/5, red `exit=1` with
"REGRESSION RUN FAILED — 1 entry red", green `exit=0` with COMPLETE.

## 2. Postal-address census — the street address renders in exactly ONE place

Every render site of any postal address, enumerated:

1. **emails/platform-envelope.ts:34** — footer `` `${legalEntity} · ${postalAddress}` ``,
   UNCONDITIONAL. This is the only place PLATFORM_POSTAL_ADDRESS (the home
   address) renders. It rendered in the A4 email.
2. **emails/practice-envelope.ts:25** — footer `` `${displayName} · ${postalAddress}` ``
   only when the PRACTICE set `practicePostalAddress` in its settings
   (app/practitioner/settings — practitioner-entered, per-practice; unset for
   every current tenant). This is the practice's own address by the practice's
   own choice — scope call is the Architect's, flagged not changed.
3. **emails/envelope.ts:42,47** (the legacy default envelope, i.e. Valentina's
   mail incl. the W8 welcome email) — hardcoded footer
   "Valentina Vélez · Veritas Consulting · Orlando, Florida": CITY/STATE only,
   no street address.
4. **lib/invoice-pdf.ts:34,48,132** — same "Orlando, Florida" city/state line in
   her invoice/receipt PDFs. No street address.
5. **lib/agreements/install-c21.ts:132,187** — "VIIIV CORP (d/b/a Veritas
   Consulting) · Orlando, Florida" inside installed LEGAL agreement text —
   verbatim-legal-text law applies; also within ruling 96's legal-terms
   exception. Untouched.
6. **lib/invoice-context.ts:88** — the practitioner's own Square business
   profile city/state/postalCode on charge emails (practice data, Square-sourced).
7. Public site, .ics files, robots/sitemap: NO postal address found anywhere.

So: Jacob's home street address appears ONLY via PLATFORM_POSTAL_ADDRESS →
platform-envelope footer. Nothing else on any surface carries a street address.

**Transactional vs commercial — the distinguishing code EXISTS, at the send-args
level, not in the renderer.** lib/notify.ts (SendArgs.envelope.unsubscribe):
"C23-ENGAGE — marketing follow-up carries a working unsubscribe link;
transactional mail passes nothing here". Only lib/engage.ts passes `unsubscribe`
— engage sequences are the ONLY commercial mail, and they send under the
platform identity. The platform-envelope renderer does NOT branch on it: the
footer (legal entity · postal address) renders identically for both. Therefore
the P4 change ruling 96 implies: the renderer drops the postal address when the
envelope is transactional (no unsubscribe) and keeps a physical address — whose
VALUE is Jacob's decision — when commercial (unsubscribe present). One
interlock to design around, reported not fixed: **platformIdentity() FAILS
CLOSED on a missing PLATFORM_POSTAL_ADDRESS (lib/notify.ts:71)** — if Jacob
blanks the variable before P4 lands, ALL platform mail (including engage and
any P2 signup mail on the platform host) stops with "no platform identity".
P4 must relax that requirement to commercial-only in the same commit that stops
rendering it on transactional mail. Until then the variable should stay set
(the PO box replacing the home address is exactly right).

## 3. Apex/MX hard-stop check — NOT the hard-stop; a safe path exists, with one
## confirmation for Jacob

Live DNS facts (DoH, quoted): `psychefolio.com` MX = mx.zoho.com (10),
mx2.zoho.com (20), mx3.zoho.com (50) — mail-bearing, confirmed. NS =
ns1kpv/ns2cvx/ns3gnv/ns4fpy.name.com — **the DNS zone is hosted at name.com**
(Railway registers domains through name.com; "Railway manages the DNS" is true
only in the sense that the domain was bought via Railway — the records live in a
name.com zone). Apex A record: NONE today.

Railway's own docs (networking/domains, "Adding a root domain", quoted):
Railway's flow does NOT create records — it hands you a CNAME **value** plus a
TXT verification record, and "when adding a root or apex domain … you must add
the appropriate DNS record … Railway supports CNAME Flattening and dynamic
ALIAS records." A LITERAL CNAME at the apex is the hard-stop case (RFC 1912:
CNAME coexists with nothing, so it would shadow Zoho's MX) — and that is a
record-type CHOICE at the DNS host, not something Railway forces.

**The safe path:** an ALIAS/ANAME-type record at the apex pointing at the
Railway-provided target — it synthesizes A records and COEXISTS with MX.
**The one thing to confirm before P2 executes (Jacob, in the name.com zone UI):
that name.com offers an ANAME/ALIAS record type for this zone.** If it does
not, two fallbacks, both mail-safe: (a) apex URL-forward (301) to
www.psychefolio.com, which ALREADY routes via the `*.psychefolio.com` wildcard —
zero new apex records beyond name.com's forwarding A records; (b) move the zone
to Cloudflare for CNAME flattening — bigger move, every Zoho MX/SPF/DKIM record
must be recreated exactly, mail-risk during transition, last resort.
One standing caution from the same docs page: Railway's own "email forwarding"
feature for Railway domains "refuses a mail exchange record for another provider
at the domain apex" — NEVER enable Railway email forwarding on psychefolio.com;
it is structurally incompatible with the Zoho MX records.

Also noted for P2 scheduling: the apex custom domain must be added to the
Railway service with the TXT verification record; the wildcard
`*.psychefolio.com` does not cover the apex (ruling 70's finding, still true).

## State

Standing set now 37 (harness-guard named; full sweep green with SWEEP EXIT 0 —
see the commit). Nothing else changed: no runner beyond regress.sh touched, no
postal-address code edited (census only), no DNS action taken. HOLDING for:
Jacob's name.com ANAME confirmation (or his pick of fallback a), his
PLATFORM_POSTAL_ADDRESS decision for commercial mail, and the P2 go on this
report. psf-rehearsal STANDS.
