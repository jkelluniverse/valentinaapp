import { headers } from "next/headers";
// Raw client on purpose: tenant resolution is the platform's own plumbing —
// it must see the Tenant table before any scope exists (and the scoped
// client depends on this module, so this also breaks the import cycle).
import { rawPrisma as prisma } from "@/lib/prisma-internal";

// PLATFORM Phase 0 — tenant resolution. The host decides the tenant:
// `{slug}.$PLATFORM_DOMAIN` resolves that slug; every other host (Valentina's
// custom domains, localhost, staging) resolves the default tenant. A
// TenantDomain table takes over custom-domain mapping when a second tenant
// with a custom domain exists.

export const DEFAULT_TENANT_SLUG = "valentina";

export type TenantConfig = {
  id: string;
  slug: string;
  displayName: string;
  status: string;
  layoutKey: string;
  skinKey: string;
  // welcomeVideoUrl — ONBOARDING §6.4: optional practitioner welcome video,
  // shown on the intake Done step. Pure config; unset for Valentina today.
  branding: { portalTitle?: string; welcomeCopy?: string; accentOverride?: string; welcomeVideoUrl?: string } | null;
  featureFlags: Record<string, boolean> | null;
};

// Per-instance cache: tenant config is read on every request (root layout),
// so it must not cost a query every time. 60s TTL keeps config edits fresh.
const cache = new Map<string, { at: number; tenant: TenantConfig | null }>();
const TTL_MS = 60_000;

export function slugFromHost(host: string | null): string {
  const platformDomain = process.env.PLATFORM_DOMAIN; // e.g. "portaldomain.com"
  if (!host || !platformDomain) return DEFAULT_TENANT_SLUG;
  const clean = host.split(":")[0].toLowerCase();
  if (clean === platformDomain || !clean.endsWith(`.${platformDomain}`)) {
    return DEFAULT_TENANT_SLUG;
  }
  const sub = clean.slice(0, -(platformDomain.length + 1));
  return sub.includes(".") ? DEFAULT_TENANT_SLUG : sub || DEFAULT_TENANT_SLUG;
}

export async function tenantBySlug(slug: string): Promise<TenantConfig | null> {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.tenant;
  // A FAILED query must never enter the cache: caching an error as "no such
  // tenant" makes one transient DB blip resolve an existing practice's host
  // to the default tenant for a full TTL, locking its practitioner out
  // (login filters users by the resolved tenant). Errors serve the last
  // known value if there is one, else null for THIS request only.
  let row;
  try {
    row = await prisma.tenant.findUnique({ where: { slug } });
  } catch {
    return hit?.tenant ?? null;
  }
  const tenant = row
    ? ({
        id: row.id,
        slug: row.slug,
        displayName: row.displayName,
        status: row.status,
        layoutKey: row.layoutKey,
        skinKey: row.skinKey,
        branding: (row.branding as TenantConfig["branding"]) ?? null,
        featureFlags: (row.featureFlags as TenantConfig["featureFlags"]) ?? null,
      } satisfies TenantConfig)
    : null;
  cache.set(slug, { at: Date.now(), tenant });
  return tenant;
}

// The request's tenant. Never throws: a missing row (fresh database before
// seeding) falls back to Valentina-shaped defaults so her portal cannot break
// on a config hiccup.
export async function getTenant(): Promise<TenantConfig> {
  let host: string | null = null;
  try {
    const h = headers();
    host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host");
  } catch {
    /* outside a request scope (jobs, scripts) — default tenant */
  }
  const slug = slugFromHost(host);
  const tenant = (await tenantBySlug(slug)) ?? (await tenantBySlug(DEFAULT_TENANT_SLUG));
  return (
    tenant ?? {
      id: "tnt_valentina_000000001",
      slug: DEFAULT_TENANT_SLUG,
      displayName: "Valentina Vélez",
      status: "ACTIVE",
      layoutKey: "journey-v1",
      skinKey: "warm-clay",
      branding: { portalTitle: "veritas" },
      featureFlags: null,
    }
  );
}
