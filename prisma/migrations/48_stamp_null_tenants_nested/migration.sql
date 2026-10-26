-- C24-NESTED-STAMP §3 — null-tenant backfill. The successor to migration
-- 36_stamp_null_tenants (68 tables); this one covers all 79 tenant-scoped
-- tables as they stand at migration 47.
--
-- WHAT THIS ASSUMES, OUT LOUD: in a SINGLE-PRACTICE database every row with a
-- null tenantId belongs to that one practice, so stamping them with the
-- default tenant id changes nothing about who owns them and makes "zero
-- null-tenant rows" an auditable invariant. THAT ASSUMPTION STOPS BEING TRUE
-- THE MOMENT A SECOND PRACTICE HAS DATA IN THIS DATABASE. Do not run this
-- shape of migration again after multi-tenant conversion without first
-- establishing, per row, whose it is. Note that null already MEANS "default
-- tenant" to the read path — lib/tenancy/scope.ts's scopeFilter ORs
-- `tenantId IS NULL` in for the default tenant and for no one else — so this
-- changes no visibility whatsoever; it removes an ambiguity.
--
-- PLATFORM-LEVEL TABLES ARE DELIBERATELY ABSENT: "Tenant", "TenantModule",
-- "PractitionerProspect" (nullable tenantId by design — the prospect ledger
-- is platform-level), "ProspectMessage", "WebhookEvent", and "IntakeAnswer"
-- (no tenantId column at all; scoped transitively through IntakeFlow).
-- Stamping any of those would be a new bug wearing this fix as a disguise.
--
-- REVERSIBLE: every row this touches is recorded in "_TenantStampBackfill48"
-- (table_name, pk_column, row_id). To undo exactly this backfill and nothing
-- else — see docs/reports/outbox/BUILD-REPORT-C24-NESTED-STAMP.md:
--
--   DO $reverse$
--   DECLARE r record;
--   BEGIN
--     FOR r IN SELECT DISTINCT table_name, pk_column FROM "_TenantStampBackfill48" LOOP
--       EXECUTE format(
--         'UPDATE %I t SET "tenantId" = NULL FROM "_TenantStampBackfill48" b'
--         ' WHERE b.table_name = %L AND b.pk_column = %L AND b.row_id = t.%I::text',
--         r.table_name, r.table_name, r.pk_column, r.pk_column);
--     END LOOP;
--   END $reverse$;
--
-- IDEMPOTENT: a second run finds zero null rows, stamps nothing, records
-- nothing, and reports 0. RAISE NOTICE states the per-table and total counts.

CREATE TABLE IF NOT EXISTS "_TenantStampBackfill48" (
  "table_name"    text        NOT NULL,
  "pk_column"     text        NOT NULL,
  "row_id"        text        NOT NULL,
  "backfilled_at" timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY ("table_name", "pk_column", "row_id")
);

DO $backfill$
DECLARE
  tbl     text;
  pk      text;
  n       bigint;
  total   bigint := 0;
  touched int    := 0;
  -- All 79 tenant-scoped tables (lib/tenancy/scope.ts SCOPED_MODELS).
  -- "PracticeSetting" is the only one whose primary key is not "id".
  tables text[] := ARRAY[
    'User', 'ConsentGrant', 'PushSubscription', 'EmailChangeRequest', 'PasswordResetToken',
    'DeletionRequest', 'EntryDeepening', 'PsycheNode', 'PsycheEdge', 'PsycheExtraction',
    'PsycheAudit', 'PatternArchetype', 'PatternLink', 'LibraryFolder', 'LibraryItem',
    'ClientProfile', 'HumanDesignChart', 'BirthChartCore', 'LensResult', 'IntegrativeProfile',
    'ArtifactVersion', 'IntegrativeReading', 'ResonanceMark', 'IntegrationGuide', 'ClientGoal',
    'BeliefWork', 'InterventionOutcome', 'AskRecordAnswer', 'PracticeSetting', 'Note',
    'HandwrittenNote', 'RecordingConsent', 'RecordingDraft', 'SessionTranscript', 'NoteScan',
    'Conversation', 'Message', 'StageChange', 'Package', 'SessionCredit',
    'PriceBook', 'Charge', 'SquareCustomerLink', 'ExternalPayment', 'Worksheet',
    'WorksheetAssignment', 'WorksheetResponse', 'AssistGrant', 'AuditEvent', 'Course',
    'Chapter', 'Lesson', 'Enrollment', 'LessonProgress', 'SessionPrep',
    'RecordItem', 'Prompt', 'Assignment', 'PromptResponse', 'LogEntry',
    'Invite', 'SchedulingConfig', 'AvailabilityRule', 'AvailabilityException', 'Appointment',
    'Lead', 'ConnectedPaymentAccount', 'Payment', 'SessionCapture', 'IntakeFlow',
    'ClientHintState', 'ActivityEvent', 'TenantBilling', 'Reading', 'AgreementTemplate',
    'Agreement', 'AgreementEvent', 'PatternElection', 'AgreementFile'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    pk := CASE WHEN tbl = 'PracticeSetting' THEN 'key' ELSE 'id' END;

    -- Fail loudly on schema drift rather than silently skipping a table: a
    -- table this migration cannot key is a table it cannot make reversible.
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = tbl AND column_name = pk
    ) THEN
      RAISE EXCEPTION '48_stamp_null_tenants_nested: table % has no % column — schema drift, refusing to guess', tbl, pk;
    END IF;

    EXECUTE format(
      'INSERT INTO "_TenantStampBackfill48" (table_name, pk_column, row_id)'
      ' SELECT %L, %L, %I::text FROM %I WHERE "tenantId" IS NULL'
      ' ON CONFLICT DO NOTHING',
      tbl, pk, pk, tbl);

    EXECUTE format(
      'UPDATE %I SET "tenantId" = ''tnt_valentina_000000001'' WHERE "tenantId" IS NULL',
      tbl);
    GET DIAGNOSTICS n = ROW_COUNT;

    IF n > 0 THEN
      touched := touched + 1;
      total := total + n;
      RAISE NOTICE '  · %: % null-tenant row(s) stamped to the default tenant', tbl, n;
    END IF;
  END LOOP;

  RAISE NOTICE '48_stamp_null_tenants_nested: % null-tenant row(s) stamped across % of % scoped tables',
    total, touched, array_length(tables, 1);
END $backfill$;
