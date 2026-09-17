import { headers } from "next/headers";
// Raw client on purpose: tenant resolution is the platform's own plumbing —
// it must see the Tenant table before any scope exists (and the scoped
// client depends on this module, so this also breaks the import cycle).
import { rawPrisma as prisma } from "@/lib/prisma-internal";

// PLATFORM Phase 0 — tenant resolution. Since P1 (ruling 87) the host decides
// the tenant in two steps: the TenantDomain mapping FIRST (custom domains,
// data-driven, host @unique), then the host-pattern fallback —
// `{slug}.$PLATFORM_DOMAIN` resolves that slug; every other host (localhost,
// staging, unmapped domains) resolves the default tenant. P3 removes the
// default fallback; until then net behavior for unmapped hosts is unchanged.

// Duplicated as a literal in middleware.ts:44 (middleware cannot load this
// module — it imports the raw prisma client); an edit here must edit there.
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

// C26-FAIL-CLOSED-TENANCY §1 — the checked lookup: callers that must tell
// "no such tenant" (a successful answer) apart from "the lookup FAILED" (no
// answer at all) get the distinction explicitly. A FAILED query never enters
// the cache (ruling 33), and on failure the last known value is served if one
// exists — a stale identity that was correct within the TTL is a KNOWN
// identity, not a guess.
export type CheckedLookup =
  | { ok: true; tenant: TenantConfig | null } // the database answered
  | { ok: false; stale: TenantConfig | null }; // the lookup errored

// One mapping for both lookups (slug and domain), so a tenant resolved through
// either path is field-identical by construction.
type TenantRow = {
  id: string;
  slug: string;
  displayName: string;
  status: string;
  layoutKey: string;
  skinKey: string;
  branding: unknown;
  featureFlags: unknown;
};
function toConfig(row: TenantRow): TenantConfig {
  return {
    id: row.id,
    slug: row.slug,
    displayName: row.displayName,
    status: row.status,
    layoutKey: row.layoutKey,
    skinKey: row.skinKey,
    branding: (row.branding as TenantConfig["branding"]) ?? null,
    featureFlags: (row.featureFlags as TenantConfig["featureFlags"]) ?? null,
  } satisfies TenantConfig;
}

export async function tenantBySlugChecked(slug: string): Promise<CheckedLookup> {
  const hit = cache.get(slug);
  if (hit && Date.now() - hit.at < TTL_MS) return { ok: true, tenant: hit.tenant };
  let row;
  try {
    row = await prisma.tenant.findUnique({ where: { slug } });
  } catch {
    return { ok: false, stale: hit?.tenant ?? null };
  }
  const tenant = row ? toConfig(row) : null;
  cache.set(slug, { at: Date.now(), tenant });
  return { ok: true, tenant };
}

// PLATFORM SPLIT P1 (ruling 87) — the data-driven mapping, same C26 contract as
// the slug lookup: a FAILED query never enters the cache; on failure the last
// known value is served if one exists. Its own cache map — a host is not a
// slug, and the two must never collide as keys. Both outcomes LOG (ruling 78),
// bounded to once per host per TTL because the log sits on the cache-fill
// path, never on a cache hit.
const domainCache = new Map<string, { at: number; tenant: TenantConfig | null }>();

export async function tenantByDomainChecked(host: string): Promise<CheckedLookup> {
  const hit = domainCache.get(host);
  if (hit && Date.now() - hit.at < TTL_MS) return { ok: true, tenant: hit.tenant };
  let row;
  try {
    row = await prisma.tenantDomain.findUnique({ where: { host }, include: { tenant: true } });
  } catch {
    return { ok: false, stale: hit?.tenant ?? null };
  }
  const tenant = row ? toConfig(row.tenant) : null;
  if (tenant) {
    console.info(`[tenancy] host=${host} resolved via TenantDomain -> slug=${tenant.slug}`);
  } else {
    console.info(`[tenancy] host=${host} has no TenantDomain row — host-pattern resolution decides`);
  }
  domainCache.set(host, { at: Date.now(), tenant });
  return { ok: true, tenant };
}

/** Collapsed view for callers that only need "a tenant or not". */
export async function tenantBySlug(slug: string): Promise<TenantConfig | null> {
  const r = await tenantBySlugChecked(slug);
  return r.ok ? r.tenant : r.stale;
}

// C26 §1 — the discriminated resolution. Three answers, and callers can
// finally tell them apart:
//   tenant       — the host resolved to a practice (a stale-but-known identity
//                  counts: it was correct within the TTL).
//   unknown-slug — the database ANSWERED and no practice owns this slug; the
//                  documented, intentional behavior is default-host content.
//   unresolved   — the lookup ERRORED and nothing is cached. We do not know
//                  whose host this is, and nothing may pretend we do.
export type TenantResolution =
  | { kind: "tenant"; tenant: TenantConfig }
  | { kind: "unknown-slug"; tenant: TenantConfig }
  | { kind: "unresolved" };

const FRESH_DB_SHELL: TenantConfig = {
  // Layer-3 literal, kept ONLY for its stated purpose: a lookup that SUCCEEDED
  // and found nothing on the default slug (a fresh database before seeding).
  id: "tnt_valentina_000000001",
  slug: DEFAULT_TENANT_SLUG,
  displayName: "Valentina Vélez",
  status: "ACTIVE",
  layoutKey: "journey-v1",
  skinKey: "warm-clay",
  branding: { portalTitle: "veritas" },
  featureFlags: null,
};

// What an unresolved request renders around the 503: platform-shaped, no
// practice name, no practice branding, no borrowed wordmark. The id matches
// no tenant row and the data layer refuses independently (lib/prisma.ts), so
// nothing can read or write through this shell even by accident.
export const UNRESOLVED_TENANT_ID = "tnt_unresolved_000000000";
const UNRESOLVED_SHELL: TenantConfig = {
  id: UNRESOLVED_TENANT_ID,
  slug: "",
  displayName: "",
  status: "UNRESOLVED",
  layoutKey: "journey-v1",
  skinKey: "warm-clay",
  branding: { portalTitle: "" },
  featureFlags: null,
};

export async function resolveTenant(host: string | null): Promise<TenantResolution> {
  // P1 — the mapping decides FIRST. No mapping row (the database answered) is
  // not a failure: today's host-pattern behavior takes over, unchanged. A
  // FAILED mapping lookup serves its stale value if one exists; with nothing
  // cached it falls through to the slug path, which carries its own cache and
  // C26 handling — so a database outage degrades exactly as it did before P1.
  const clean = host ? host.split(":")[0].toLowerCase() : null;
  if (clean) {
    const m = await tenantByDomainChecked(clean);
    if (m.ok && m.tenant) return { kind: "tenant", tenant: m.tenant };
    if (!m.ok && m.stale) return { kind: "tenant", tenant: m.stale };
    if (!m.ok) {
      console.error(`[tenancy] TenantDomain lookup failed for host "${clean}" with nothing cached — host-pattern resolution decides`);
    }
  }
  const slug = slugFromHost(host);
  const r = await tenantBySlugChecked(slug);
  if (!r.ok) {
    if (r.stale) return { kind: "tenant", tenant: r.stale };
    console.error(`[tenancy] UNRESOLVED host — tenant lookup failed for slug "${slug}" with nothing cached`);
    return { kind: "unresolved" };
  }
  if (r.tenant) return { kind: "tenant", tenant: r.tenant };
  // The database answered: no such slug. Default-host content, per the
  // documented unknown-slug behavior — which itself needs the default row.
  const d = slug === DEFAULT_TENANT_SLUG ? r : await tenantBySlugChecked(DEFAULT_TENANT_SLUG);
  if (!d.ok) {
    if (d.stale) return { kind: "unknown-slug", tenant: d.stale };
    console.error(`[tenancy] UNRESOLVED host — default-tenant lookup failed while resolving unknown slug "${slug}"`);
    return { kind: "unresolved" };
  }
  return { kind: "unknown-slug", tenant: d.tenant ?? FRESH_DB_SHELL };
}

/** The current request's resolution (never throws; outside a request the
 *  default slug is resolved, matching getTenant's contract). */
export async function getTenantResolution(): Promise<TenantResolution> {
  let host: string | null = null;
  try {
    const h = headers();
    host = h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host");
  } catch {
    /* outside a request scope (jobs, scripts) — default tenant */
  }
  return resolveTenant(host);
}

// The request's tenant. NEVER THROWS — the root layout calls this on every
// request, and a config hiccup must not blank the site. Its one C26 behavior
// change: when the host CANNOT be resolved (the lookup errored, nothing
// cached), it no longer answers "Valentina's" — rendering one practice's
// identity on another's domain was the bug, not the fallback. It returns a
// neutral practice-less shell instead; the data layer refuses scoped access
// independently (lib/prisma.ts), so the shell can render chrome and nothing
// else.
export async function getTenant(): Promise<TenantConfig> {
  const r = await getTenantResolution();
  return r.kind === "unresolved" ? UNRESOLVED_SHELL : r.tenant;
}
