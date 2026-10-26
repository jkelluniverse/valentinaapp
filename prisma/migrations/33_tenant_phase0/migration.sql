-- PLATFORM Phase 0 — Valentina becomes tenant #1, invisibly. Creates the
-- tenant tables, stamps tenantId on the root/practice tables, inserts her
-- Tenant row (fixed id — deterministic across environments) and her three
-- panel modules (generic keys; her branded names live in settings), then
-- backfills every existing row to her tenant.

CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "layoutKey" TEXT NOT NULL DEFAULT 'journey-v1',
    "skinKey" TEXT NOT NULL DEFAULT 'warm-clay',
    "branding" JSONB,
    "featureFlags" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

CREATE TABLE "TenantModule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL,
    "settings" JSONB,

    CONSTRAINT "TenantModule_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TenantModule_tenantId_moduleKey_key" ON "TenantModule"("tenantId", "moduleKey");
ALTER TABLE "TenantModule" ADD CONSTRAINT "TenantModule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Invite" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Lead" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Worksheet" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Prompt" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "Course" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "PriceBook" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "PracticeSetting" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "SchedulingConfig" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "PatternArchetype" ADD COLUMN "tenantId" TEXT;
ALTER TABLE "PatternLink" ADD COLUMN "tenantId" TEXT;

-- Tenant #1: Valentina, exactly as she runs today.
INSERT INTO "Tenant" ("id", "slug", "displayName", "status", "layoutKey", "skinKey", "branding", "featureFlags")
VALUES (
    'tnt_valentina_000000001',
    'valentina',
    'Valentina Vélez',
    'ACTIVE',
    'journey-v1',
    'warm-clay',
    '{"portalTitle": "veritas"}',
    '{"sessionPipeline": false}'
);

-- Her three panels as modules — generic keys (Rule 0.4); HER names in settings.
INSERT INTO "TenantModule" ("id", "tenantId", "moduleKey", "enabled", "position", "settings") VALUES
    ('tm_valentina_bodygraph01', 'tnt_valentina_000000001', 'body-graph', true, 1, '{"displayLabel": "Human Design"}'),
    ('tm_valentina_archkeys001', 'tnt_valentina_000000001', 'archetypal-keys', true, 2, '{"displayLabel": "Gene Keys"}'),
    ('tm_valentina_valspiral01', 'tnt_valentina_000000001', 'values-spiral', true, 3, '{"displayLabel": "Values spiral"}');

-- Everything she has belongs to her tenant.
UPDATE "User" SET "tenantId" = 'tnt_valentina_000000001';
UPDATE "Invite" SET "tenantId" = 'tnt_valentina_000000001';
UPDATE "Lead" SET "tenantId" = 'tnt_valentina_000000001';
UPDATE "Worksheet" SET "tenantId" = 'tnt_valentina_000000001';
UPDATE "Prompt" SET "tenantId" = 'tnt_valentina_000000001';
UPDATE "Course" SET "tenantId" = 'tnt_valentina_000000001';
UPDATE "PriceBook" SET "tenantId" = 'tnt_valentina_000000001';
UPDATE "PracticeSetting" SET "tenantId" = 'tnt_valentina_000000001';
UPDATE "SchedulingConfig" SET "tenantId" = 'tnt_valentina_000000001';
UPDATE "PatternArchetype" SET "tenantId" = 'tnt_valentina_000000001';
UPDATE "PatternLink" SET "tenantId" = 'tnt_valentina_000000001';
