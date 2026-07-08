# Valentina's Coaching Platform — C0 (Foundation)

This is the **C0 foundation** from the engineer charter: repo + Postgres + Auth.js login +
a deployed "hello, authenticated world". Nothing more. Each later component (C1–C8) builds
on top of this once C0 is verified.

## Stack
- Next.js 14 (App Router)
- Auth.js / NextAuth v5 (Credentials provider, JWT sessions)
- Prisma + PostgreSQL
- Tailwind CSS

## What C0 proves
1. The app **deploys** on Railway.
2. A user can **log in** (Auth.js).
3. The app **reads from Postgres** (the dashboard loads your user record; `/api/health`
   pings the DB). That's the deploy + login + DB round-trip the charter asks for.

---

## Run it locally
```bash
npm install
cp .env.example .env         # then fill in DATABASE_URL + AUTH_SECRET
npx auth secret              # generates AUTH_SECRET for you (writes to .env)
npm run db:push              # creates the User table in your database
npm run db:seed              # creates Valentina's practitioner login
npm run dev                  # http://localhost:3000
```
Log in at `/login` with the SEED_PRACTITIONER_EMAIL / PASSWORD from your `.env`.

## Deploy on Railway
1. Push this repo to GitHub.
2. In Railway: **New Project → Deploy from GitHub repo** (select this repo).
3. **Add a Postgres database** to the project. Railway sets `DATABASE_URL` automatically.
4. Add these variables to the app service:
   - `AUTH_SECRET` — run `openssl rand -base64 32` and paste the result.
   - `SEED_PRACTITIONER_EMAIL` and `SEED_PRACTITIONER_PASSWORD`.
5. Deploy. Then, once, from the Railway service shell (or locally against the Railway DB):
   ```bash
   npm run db:push
   npm run db:seed
   ```
6. Visit the deployed URL → `/login` → you should land on the dashboard.
   Visit `/api/health` → should return `{"ok":true,"db":"up"}`.

C0 is "done" only when steps 5–6 succeed on the live URL.

## Security notes (carried from the charter)
- Passwords are hashed with bcrypt; never stored in plain text.
- Secrets live only in environment variables — never commit `.env`.
- HTTPS is handled by Railway (encryption in transit).
- This app holds sensitive personal reflections. Even though the practice is not a HIPAA
  covered entity, we build to a high standard: consent, least-privilege access, and a
  retention/deletion policy get added as we build C1+.

## Next component
**C1 — Accounts & roles:** Valentina can invite and manage client accounts. Do not start
C1 until C0 is verified on the live URL.
