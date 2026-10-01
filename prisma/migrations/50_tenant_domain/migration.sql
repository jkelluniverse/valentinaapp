-- PLATFORM SPLIT P1 (ruling 87) — the host→tenant mapping. The resolver
-- consults this table FIRST; the host-pattern fallback (PLATFORM_DOMAIN
-- suffix / default slug) second. The UNIQUE host is invariant I4 enforced by
-- the schema: no host can map to two practices. Seeds exactly one row:
-- valentinavelez.com → the valentina tenant (created by migration 33, which
-- this migration runs after on every fresh replay). www.valentinavelez.com is
-- deliberately NOT seeded — it is not a Railway custom domain and does not
-- serve today (A4/P1 evidence); adding it is an ops decision with its own row.

CREATE TABLE "TenantDomain" (
    "id" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantDomain_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantDomain_host_key" ON "TenantDomain"("host");

CREATE INDEX "TenantDomain_tenantId_idx" ON "TenantDomain"("tenantId");

ALTER TABLE "TenantDomain" ADD CONSTRAINT "TenantDomain_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "TenantDomain" ("id", "host", "tenantId")
VALUES ('td_valentina_domain0001', 'valentinavelez.com', 'tnt_valentina_000000001');
