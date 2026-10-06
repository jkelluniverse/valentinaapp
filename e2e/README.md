# e2e — UX audit harness

The regression suite behind the UX-AGENT audit cycle (see `UX-AUDIT-*.md` at the
repo root). It stands up a **seeded staging** copy of the app and walks it in a
real browser as its users, capturing screenshots at every judgment point.

> **Hard rule:** never point this at production or any database holding real
> client data. It seeds and mutates fictional fixtures.

## What's here

- `../prisma/staging-seed.ts` — idempotent-by-email fixtures: practitioner
  *Valentina Vélez* + clients *Jacob / Mira / Sam* (all `audit-pass-1`), a
  pending invite, reflections, threads (Mira carries a crisis-signal message),
  appointments, First-Map stars, consent grants.
- `walk.mjs` — the Playwright journey walk (mobile 390×844 + desktop 1440×900),
  step-wrapped so one missing element never aborts the run. Writes PNGs to
  `audit/<date>/` (git-ignored) plus `_shots.json` / `_notes.json`.

## Run it

```bash
# 1. a throwaway Postgres (any empty DB works)
export DATABASE_URL="postgresql://postgres@localhost:5433/veritas"
npm run db:migrate         # prisma migrate deploy — now applies in order on a fresh DB
npm run db:seed:staging    # prints the onboarding invite token

# 2. build + serve on :3100
AUTH_SECRET="<32+ chars>" AUTH_TRUST_HOST=true PORT=3100 npm run build && \
AUTH_SECRET="<32+ chars>" AUTH_TRUST_HOST=true PORT=3100 npm start &

# 3. save the printed invite token, then walk
echo "<token>" > /tmp/invite.txt
npm run e2e:walk           # → audit/<date>/*.png
```

Browser binary is the pre-installed headless shell
(`/opt/pw-browsers/chromium_headless_shell-*/chrome-linux/headless_shell`); the
walk points at it directly — do not run `playwright install`.

## Migration ordering (P1 — fixed 2026-07-14)

The old unpadded folder prefixes (`10_` sorting before `1_`) made a fresh
`migrate deploy` fail with `42P01`. Prefixes are now zero-padded, so `db:migrate`
applies in order on an empty DB. See `scripts/migration-reorder-runbook.md` for
the one-time production ledger reconciliation.
