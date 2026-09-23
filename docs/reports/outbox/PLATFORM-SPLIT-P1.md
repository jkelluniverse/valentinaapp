# PLATFORM SPLIT — A4 SEND-TEST + P1 REPORT (both green; holding for P2 re-plan)

Deploy tip: bf1c20c, production 4001406a SUCCESS 2026-09-17 00:23:13Z, staging
e309de93 SUCCESS 00:23:32Z (each ran `prisma migrate deploy` pre-deploy — migration
50 applied to both databases). Rollback point unchanged:
known-good-pre-platform-split = 7f55bc7.

## A4 — the platform identity WORKS, proven by arrival

One send through POST /api/jobs/email-identity-test (temporary route b58bf6f,
REVERTED beaff52 after its one job; trigger token minted, used once, blanked —
disclosed deviation from the "JOBS_SECRET-guarded" letter, because ruling 73 keeps
JOBS_SECRET out of this session; the route also honored JOBS_SECRET for Jacob).
API answered `{"ok":true}`; the email arrived at jkelluniverse+platform@gmail.com
23:51:23Z, INBOX, not spam. Each field, observed:

- **From address:** `jacob@psychefolio.com`
- **Display name:** NONE — PLATFORM_FROM_EMAIL is a bare address, and the platform
  envelope renders that raw address as its brand header line. P4 flag: the from
  should carry a display name (`Psychefolio <…>`) or the envelope a brand line —
  and whether transactional mail should come from jacob@ at all is Jacob's call.
- **Reply-to:** not exposed by the Gmail connector's payload (same limitation as
  W8's read) — unverified, said plainly.
- **Footer legal entity:** `Kell Systems Consulting, LLC` — matches
  PLATFORM_LEGAL_ENTITY verbatim (comma and all).
- **Postal address:** `6521 Beverly Ave NE Canton, Ohio 44721`.
  **SUPERSEDED AND WRONG — DO NOT COPY.** That address belongs to a DIFFERENT company and was the value in the A4 test email. The platform's postal address is **2202 31st St NE, Canton, OH 44705** (ruling 143), it lives in `PLATFORM_POSTAL_ADDRESS` only, and it renders on COMMERCIAL mail only.
- **Envelope:** the platform envelope rendered with its own palette — not
  Valentina's warm-stone one.

**psychefolio.com IS verified in the platform Resend account** — proven by the
send succeeding and arriving with the from-domain intact, not by configuration.
Jacob's fact of record (two separate Resend accounts) is consistent with what the
code does: the platform identity authenticates with its own key
(lib/notify.ts sendEmail, per-identity credential).

PLATFORM_DOMAIN confirmed = `psychefolio.com` behaviorally: psf-rehearsal
.psychefolio.com resolves as a tenant and www.psychefolio.com as unknown-slug —
both require the suffix match against exactly that value.

## P1 — data-driven host mapping: net behavior change ZERO, mapping proven live

Built exactly as ratified (ruling 87): `TenantDomain` (host @unique — invariant I4
in the schema; many-per-tenant; @@index(tenantId)) + migration 50 seeding one row,
valentinavelez.com → valentina. `resolveTenant` consults the mapping FIRST under
the same C26 contract as the slug lookup (own cache, failed queries never cached,
stale-counts-as-resolved, fall-through with nothing cached — a DB outage degrades
exactly as before P1). Both outcomes log, bounded to once per host per TTL.
**www.valentinavelez.com NOT seeded, with evidence:** it has DNS (same IP as her
apex) but is not a Railway custom domain and does not serve (curl 000) — adding it
is an ops decision with its own row, not P1's job.

- **V1 (byte-identity).** event-chrome 17/17 (16-screen baseline MATCH) in the
  sweep; live: valentinavelez.com root HTTP/2 200, her title, zero digests, all
  surfaces 200, `/api/tenant-kind` → `{"kind":"tenant","isDefault":true}` —
  answers identical to pre-P1 captures. Same on staging.
- **V2 (the mapping is what resolves her — proven live).** Production log,
  first requests after deploy:
  `[tenancy] host=valentinavelez.com resolved via TenantDomain -> slug=valentina`
  (Note: that line appeared 6× with identical timestamps — the deploy-check's
  parallel requests raced the cold cache before its first fill; bounded to once
  per TTL thereafter. Not a defect; named.)
- **V3 (demo path).** Live: `GET https://psf-rehearsal.psychefolio.com/` →
  HTTP/2 307 → its own /book; its log line shows the unchanged path:
  `[tenancy] host=psf-rehearsal.psychefolio.com has no TenantDomain row — host-pattern resolution decides`
  demo-path gate PASS in the sweep.
- **V4 (fail-closed).** fail-closed-tenancy 18/18; unmapped hosts behave exactly
  as before (the no-row answer falls through to today's path by construction).
- **V5 (standing set).** Full 36-entry sweep green, stamp-audit LAST — twice: the
  first run was RED (below), the second all-green with `SWEEP EXIT: 0`.
- **V6 (demonstrated able to fail).** Local, scratch DB, both halves quoted:
  with the row — `[tenancy] host=valentinavelez.com resolved via TenantDomain ->
  slug=valentina`; row DELETEd + fresh server — `[tenancy]
  host=valentinavelez.com has no TenantDomain row — host-pattern resolution
  decides`; /book bodies byte-IDENTICAL both ways; row restored.

## What P1's first sweep caught (both fixed, both named)

1. **nested-stamp went RED (42/43)** — its tenantId-column census found
   TenantDomain outside the scoped set and refused it until classified. That is
   the census doing its job on day one. Classified deliberately: platform-level
   resolution plumbing, read before any scope exists; its tenantId means "the
   tenant this host maps to", not row scope. Rerun 43/43.
2. **regress.sh's exit code lied.** The run that contained `FAIL nested-stamp`
   exited 0 — `run()` printed FAIL but the script exited with the last echo's
   status. Every historical green stands on the printed PASS lines (always the
   real signal, and read each time), but an unwatched caller would have seen
   green on red — the silent-false-green class. Fixed: any FAIL ends the sweep
   with exit 1 and a named count; red path demonstrated in isolation, green path
   proven by the P1 sweep itself (`SWEEP EXIT: 0`).

## Holding

P1 complete, awaiting ratification. P2 awaits the re-plan: Jacob's platform
content (placeholder until then), and the apex/MX hard-stop check (whether
Railway's domain flow creates an apex-safe record type for the mail-bearing
psychefolio.com — if CNAME, STOP). psf-rehearsal STANDS; Blocks 1.5/2/3 queued
past P5.
