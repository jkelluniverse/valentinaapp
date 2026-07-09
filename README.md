# Valentina's Coaching Platform

An engineer-charter build, one verified component at a time.

- **C0 — Foundation** ✅ verified live: repo + Postgres + Auth.js login + deployed "hello,
  authenticated world".
- **C1 — Accounts & roles** ✅ verified live: Valentina invites clients, they set a password and
  record consent, and the practitioner/client boundary is enforced everywhere.
  *(Note: the client area lives at `/space`, not `/app` — a route directory named `app` inside
  Next's `app/` router broke production routing and was renamed.)*
- **C2 — Self-awareness log** (this build): a client records moments of awareness — triggers,
  insights, wins, reflections — in seconds, and reviews their own timeline. Valentina gets a
  thin read-only per-client view for session prep.

## Stack
- Next.js 14 (App Router)
- Auth.js / NextAuth v5 (Credentials provider, JWT sessions)
- Prisma + PostgreSQL (migrations)
- Tailwind CSS (styled to `BRAND.md`)

---

## What C1 adds
- **Invite by link.** The practitioner creates an invite and gets a one-time, copyable link
  (7-day expiry) to send however she likes. Tokens are 256-bit and stored **hashed** — the raw
  token is shown once and never persisted.
- **Client onboarding.** The invited person sets a password (bcrypt cost 12) and records
  consent, then is signed in to their own private space.
- **Role-based access.** `PRACTITIONER` → `/practitioner/clients`, `CLIENT` → `/app`. Enforced
  in middleware **and** re-checked server-side in every protected layout.
- **Management.** Resend/refresh, revoke, and deactivate/reactivate clients. Revoked, expired,
  and already-used links are rejected; deactivated clients can't log in.

## What C2 adds
- **Low-friction capture** at `/space/new`: an autofocused text area is the entry — only the
  body is required. Optional one-tap extras: type chips (Trigger / Insight / Win / Reflection),
  mood 1–5, "what prompted this?", tags, backdating.
- **Timeline** at `/space`: the client's own entries, reverse-chronological, grouped by day,
  with a light type filter, edit and hard-delete of their own content.
- **Practitioner read-only view** at `/practitioner/clients/[clientId]` — one client's entries
  for session prep. No editing, no cross-client search (that's C8).
- **Authorization:** every entry query is scoped to the session user; probing another client's
  entry id returns not-found. Consent (`consentAt`, from C1) is asserted before entries can be
  created. No entry content is ever logged.
- The entry taxonomy is the spec default — **to be confirmed with Valentina**; labels live in
  `lib/entry-meta.ts` and enum renames are a small migration away.

### Routes
| Route | Who |
|-------|-----|
| `/login` | public |
| `/invite/[token]` | public (accept an invite) |
| `/privacy` | public |
| `/practitioner/clients` | practitioner only |
| `/practitioner/clients/[clientId]` | practitioner only (read-only client record) |
| `/space` | client only (timeline) |
| `/space/new` | client only (capture) |
| `/space/entries/[id]` | client only (own entry: view/edit/delete) |
| `/api/health` | public health check |

---

## Run it locally
```bash
npm install
cp .env.example .env         # then fill in DATABASE_URL + AUTH_SECRET
npx auth secret              # generates AUTH_SECRET for you (writes to .env)
npm run db:migrate           # applies migrations (creates User + Invite)
npm run db:seed              # creates Valentina's practitioner login
npm run dev                  # http://localhost:3000
```
Log in at `/login` with the `SEED_PRACTITIONER_EMAIL` / `PASSWORD` from your `.env`.

> **Migrations, not `db push`.** Now that real data exists, schema changes ship as Prisma
> migrations (`prisma/migrations/`). `npm run db:migrate` runs `prisma migrate deploy`.

## Deploy on Railway
The app service and Postgres are already set up from C0. To ship C1:

1. Push this branch; Railway builds and deploys it.
2. **One-time migration baseline** (the C0 database was created with `db push`, so tell Prisma
   the initial state is already there, then apply C1). In the app service **Console**:
   ```bash
   npx prisma migrate resolve --applied 0_init   # baseline: mark C0 as already applied
   npm run db:migrate                            # applies the C1 migration (User.active, consentAt, Invite)
   ```
   After this first baseline, future deploys just need `npm run db:migrate`.
3. Verify on the live URL — see the checklist below.

### C1 done checklist (run on the live URL)
1. Practitioner creates an invite → working copyable link → client shows **Invited**.
2. Open the link in a fresh browser → set password + consent → auto-signed-in → `/app`.
3. Client now shows **Active**.
4. A client can't reach `/practitioner/**` (redirected to `/app`).
5. Reused link rejected; expired link rejected; revoked link dead; deactivated client can't log in.
6. Build clean; `/api/health` returns `{"ok":true,"db":"up"}`.

---

## Security notes (carried from the charter)
- Passwords hashed with bcrypt (cost 12); never stored in plain text.
- Invite tokens: 256-bit CSPRNG, stored as a SHA-256 hash, single-use, 7-day expiry.
- No enumeration: invite and login errors are generic; they never reveal whether an email exists.
- Consent is recorded (`User.consentAt`) before a client account is usable.
- Authorization is enforced server-side; the client is never trusted. Middleware is a
  convenience, not the boundary.
- Deletion in v1 is soft (deactivation). Hard-delete + purge is defined with the data it
  touches in a later component.
- Secrets live only in environment variables — never commit `.env`. HTTPS handled by Railway.

## Optional fast-follow: email invites
C1 ships with copyable links (no new secrets). To send invite links automatically, add a
transactional-email provider (Resend/Postmark) behind the same invite record — set
`RESEND_API_KEY` and `INVITE_FROM_EMAIL` (see `.env.example`). No schema change required.

## Next component
**C2 — Self-awareness log:** writes into the client accounts created here. Do not start C2
until C1 is verified on the live URL.
