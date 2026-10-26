-- C25-PRACTICE-SETTING-TENANCY §2 — give a practice setting a PRACTICE.
--
-- WHAT WAS WRONG. "PracticeSetting" had no "id" column: its primary key was
-- "key", which is a UNIQUE index on the key GLOBALLY. Two practices could
-- therefore never hold the same setting key, which is to say the table could
-- not represent more than one practice's settings at all. (The same shape
-- also broke the scoped client's fail-closed ownership pre-check, which
-- selected "id" — fixed separately in lib/tenancy/model-identity.ts.)
--
-- WHAT THIS DOES, in order:
--   1. adds "id" (cuid-shaped text) and backfills it, one value per row;
--   2. moves the primary key from "key" to "id";
--   3. backfills null "tenantId" values to the default tenant, following
--      36_stamp_null_tenants and 48_stamp_null_tenants_nested;
--   4. adds UNIQUE ("tenantId", "key") — settings are now per-practice.
--
-- WHAT THIS ASSUMES, OUT LOUD (the same assumption migration 48 states): in a
-- SINGLE-PRACTICE database every row with a null tenantId belongs to that one
-- practice, so stamping them with the default tenant id changes nothing about
-- who owns them. Null already MEANS "default tenant" to the read path
-- (lib/tenancy/scope.ts ORs `tenantId IS NULL` in for the default tenant and
-- for no one else), so this changes no visibility. THAT ASSUMPTION STOPS
-- BEING TRUE THE MOMENT A SECOND PRACTICE HAS DATA IN THIS DATABASE.
--
-- NO VALUE, MEANING OR DEFAULT CHANGES. Every ("key", "value") pair present
-- before this migration is present after it, with the same value and the same
-- owner. That includes the engage kill-switch and pause (ruling 19): the gate
-- is stored, not computed, so an absent row still reads as CLOSED exactly as
-- before.
--
-- IDEMPOTENT: each of the four steps is guarded by a catalog check, so a
-- second run adds nothing, stamps nothing, records nothing, and reports 0.
--
-- LOUD ON DRIFT: a missing "key" or "value" column, a pre-existing "id"
-- column of the wrong shape, or a (tenantId, key) duplicate that would make
-- the unique index impossible all RAISE EXCEPTION rather than guess.
--
-- REVERSIBLE: the rows whose tenantId this migration stamped are recorded in
-- "_PracticeSettingTenancy49" (key, id_assigned) — only rows that were NULL
-- before are recorded, so a reversal restores exactly the prior state. To
-- undo this migration and nothing else:
--
--   DO $reverse$
--   BEGIN
--     ALTER TABLE "PracticeSetting" DROP CONSTRAINT IF EXISTS "PracticeSetting_tenantId_key_key";
--     DROP INDEX IF EXISTS "PracticeSetting_tenantId_key_key";
--     UPDATE "PracticeSetting" t SET "tenantId" = NULL
--       FROM "_PracticeSettingTenancy49" b WHERE b.id_assigned = t."id";
--     ALTER TABLE "PracticeSetting" DROP CONSTRAINT IF EXISTS "PracticeSetting_pkey";
--     ALTER TABLE "PracticeSetting" ADD CONSTRAINT "PracticeSetting_pkey" PRIMARY KEY ("key");
--     ALTER TABLE "PracticeSetting" DROP COLUMN "id";
--     DROP TABLE "_PracticeSettingTenancy49";
--   END $reverse$;
--
-- Two things about that reversal, stated rather than discovered later:
--   · Restoring a PRIMARY KEY on "key" requires "key" to be globally unique
--     again. Once a second practice holds a key the first practice also
--     holds, the reversal will FAIL on a duplicate — correctly, because at
--     that point the old shape can no longer represent the data. Reverse this
--     migration before a second practice saves settings, or not at all.
--   · Reverse 49 BEFORE reversing 48. Migration 48's documented reversal sets
--     "tenantId" back to NULL keyed on pk_column 'key'; that still works
--     after 49 (the "key" column survives), but running it while 49's unique
--     index is in place can collide on (NULL, key) semantics. Undo in reverse
--     order, as with any migration pair.

CREATE TABLE IF NOT EXISTS "_PracticeSettingTenancy49" (
  "key"           text        NOT NULL,
  "id_assigned"   text        NOT NULL,
  "backfilled_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("key", "id_assigned")
);

DO $practice_setting_tenancy$
DECLARE
  n_ids     bigint := 0;
  n_tenants bigint := 0;
  n_rows    bigint := 0;
  n_dupes   bigint := 0;
  pk_cols   text;
BEGIN
  -- ---------------------------------------------------------------- drift ---
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = current_schema() AND table_name = 'PracticeSetting'
  ) THEN
    RAISE EXCEPTION '49_practice_setting_tenancy: table "PracticeSetting" does not exist — schema drift, refusing to guess';
  END IF;

  FOR pk_cols IN SELECT unnest(ARRAY['key', 'value', 'tenantId']) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'PracticeSetting' AND column_name = pk_cols
    ) THEN
      RAISE EXCEPTION '49_practice_setting_tenancy: "PracticeSetting" has no "%" column — schema drift, refusing to guess', pk_cols;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'PracticeSetting'
      AND column_name = 'id' AND data_type <> 'text'
  ) THEN
    RAISE EXCEPTION '49_practice_setting_tenancy: "PracticeSetting"."id" already exists and is not text — schema drift, refusing to guess';
  END IF;

  SELECT count(*) INTO n_rows FROM "PracticeSetting";

  -- ------------------------------------------------------ 1. the id column ---
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = 'PracticeSetting' AND column_name = 'id'
  ) THEN
    ALTER TABLE "PracticeSetting" ADD COLUMN "id" text;
    -- cuid-shaped ("c" + 24 lowercase alphanumerics) so the column looks like
    -- every other id in this schema and nothing downstream has to special-case
    -- it. Uniqueness comes from gen_random_uuid(), not from the shape.
    UPDATE "PracticeSetting"
      SET "id" = 'c' || substr(translate(gen_random_uuid()::text, '-', '') || md5(random()::text), 1, 24)
      WHERE "id" IS NULL;
    GET DIAGNOSTICS n_ids = ROW_COUNT;
    ALTER TABLE "PracticeSetting" ALTER COLUMN "id" SET NOT NULL;
    RAISE NOTICE '  · id column added; % existing row(s) given an id', n_ids;
  ELSE
    RAISE NOTICE '  · id column already present — nothing to add (idempotent re-run)';
  END IF;

  -- ------------------------------------------------------ 2. primary key ----
  SELECT string_agg(a.attname, ',' ORDER BY a.attnum) INTO pk_cols
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
   WHERE c.conrelid = '"PracticeSetting"'::regclass AND c.contype = 'p';

  IF pk_cols IS NULL THEN
    ALTER TABLE "PracticeSetting" ADD CONSTRAINT "PracticeSetting_pkey" PRIMARY KEY ("id");
    RAISE NOTICE '  · primary key created on (id) — there was none';
  ELSIF pk_cols = 'key' THEN
    ALTER TABLE "PracticeSetting" DROP CONSTRAINT "PracticeSetting_pkey";
    ALTER TABLE "PracticeSetting" ADD CONSTRAINT "PracticeSetting_pkey" PRIMARY KEY ("id");
    RAISE NOTICE '  · primary key moved from (key) to (id)';
  ELSIF pk_cols = 'id' THEN
    RAISE NOTICE '  · primary key is already (id) — nothing to move (idempotent re-run)';
  ELSE
    RAISE EXCEPTION '49_practice_setting_tenancy: unexpected primary key (%) on "PracticeSetting" — schema drift, refusing to guess', pk_cols;
  END IF;

  -- ------------------------------------------- 3. null-tenant convergence ---
  INSERT INTO "_PracticeSettingTenancy49" ("key", "id_assigned")
    SELECT "key", "id" FROM "PracticeSetting" WHERE "tenantId" IS NULL
    ON CONFLICT DO NOTHING;

  UPDATE "PracticeSetting" SET "tenantId" = 'tnt_valentina_000000001' WHERE "tenantId" IS NULL;
  GET DIAGNOSTICS n_tenants = ROW_COUNT;
  IF n_tenants > 0 THEN
    RAISE NOTICE '  · %: null-tenant row(s) stamped to the default tenant', n_tenants;
  ELSE
    RAISE NOTICE '  · 0 null-tenant rows to stamp (migrations 36/48 already converged them)';
  END IF;

  -- --------------------------------------- 4. the tenant-scoped unique key --
  IF EXISTS (
    SELECT 1 FROM pg_class WHERE relname = 'PracticeSetting_tenantId_key_key'
  ) THEN
    RAISE NOTICE '  · unique (tenantId, key) already present — nothing to add (idempotent re-run)';
  ELSE
    SELECT count(*) INTO n_dupes FROM (
      SELECT "tenantId", "key" FROM "PracticeSetting" GROUP BY 1, 2 HAVING count(*) > 1
    ) d;
    IF n_dupes > 0 THEN
      RAISE EXCEPTION '49_practice_setting_tenancy: % duplicate (tenantId, key) pair(s) in "PracticeSetting" — refusing to invent a winner; resolve them and re-run', n_dupes;
    END IF;
    CREATE UNIQUE INDEX "PracticeSetting_tenantId_key_key" ON "PracticeSetting" ("tenantId", "key");
    RAISE NOTICE '  · unique index (tenantId, key) created';
  END IF;

  RAISE NOTICE '49_practice_setting_tenancy: % row(s) in "PracticeSetting" — % given an id, % stamped to the default tenant, 0 values changed',
    n_rows, n_ids, n_tenants;
END $practice_setting_tenancy$;
