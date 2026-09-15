# Runbook — migration folder zero-padding (UX-AUDIT-2026-07-14 P1)

## Why

Migration folders used unpadded numeric prefixes (`0_` … `18_`). Prisma applies
migrations in **lexicographic** order, so `10_c12_integrative` sorted *before*
`1_c1_accounts` — a fresh `prisma migrate deploy` applied migrations out of order
and failed with `42P01 relation … does not exist`. Every fresh environment was
affected (disaster recovery, new staging, `migrate reset`, new-dev onboarding).
Production was unaffected because it applied each migration incrementally, in
creation order, as it was authored.

## The fix (already in this branch)

Folders `0_*` … `9_*` were renamed to `00_*` … `09_*` so lexicographic order now
equals creation order (`00 … 09, 10 … 18`). The migration `.sql` bodies are
byte-for-byte unchanged, so checksums remain valid — only the folder name (and
therefore `_prisma_migrations.migration_name`) changes.

## Proven on a fresh environment

- `prisma migrate deploy` on an empty DB → **all 19 applied in order, 47 tables**
  (previously failed with `42P01`).
- `db:seed:staging` then ran clean end-to-end.
- Production-simulation: an existing ledger on the OLD names + the renamed folders
  reports "migrations not yet applied" (would fail); after the reconcile SQL it
  reports "Database schema is up to date!" (0 pending, no re-run).

## Production deploy procedure (operator — run once, in order)

Production's `_prisma_migrations` ledger still holds the OLD names, so it must be
reconciled to the new folder names **before** the renamed folders are deployed.

1. **Back up the production database** (full dump / point-in-time snapshot).
2. Run the reconciliation against production, inside its transaction:
   ```
   psql "$PRODUCTION_DATABASE_URL" -f scripts/reconcile-migration-names.sql
   ```
   Verify with the two checks noted in that file (19 rows, none left on a
   single-digit prefix).
3. Deploy the branch with the renamed folders. `prisma migrate deploy` now sees
   names matching the ledger → **0 pending, no-op**.

### If steps get reversed

Deploying the renamed folders *before* reconciling fails **safely**: Prisma sees
the padded names as pending, tries `00_init`, hits "relation already exists", and
aborts with **no schema change**. Recover by running the reconcile SQL (step 2)
and redeploying. Nothing is lost.

## Rollback

- Repo: `git revert` the rename commit, or restore from branch
  `backup/pre-migration-rename-2026-07-14` / `/tmp/migrations-backup-2026-07-14.tgz`.
- If the reconcile SQL was already run on production and you revert the folders,
  run the inverse UPDATEs (new → old names) to keep the ledger matching the
  folders.
