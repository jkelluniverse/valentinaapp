import { headers } from "next/headers";
// Raw client on purpose: tenant resolution is the platform's own plumbing —
// it must see the Tenant table before any scope exists (and the scoped
// client depends on this module, so this also breaks the import cycle).
import { rawPrisma as prisma } from "@/lib/prisma-internal";
import { ambientTenantId } from "@/lib/tenancy/tenant-scope";

// PLATFORM Phase 0 — tenant resolution. Since P1 (ruling 87) the host decides
// the tenant in two steps: the TenantDomain mapping FIRST (custom domains,
// data-driven, host @unique), then the `{slug}.$PLATFORM_DOMAIN` pattern.
//
// P3.3 — THERE IS NO THIRD STEP, AND NO DEFAULT TENANT (ruling 85). A host
// that neither carries a mapping row nor matches the subdomain pattern is
// UNRESOLVED: slugFromHost returns null and this module refuses, where it
// used to answer "valentina". That fallback was the mechanism by which
// psychefolio.com, localhost, staging and every stranger's Host header all
// resolved to tenant #1 — an answer that was correct only for as long as
// there was exactly one practice. The three call sites it used to serve are
// now: her custom domain (a TenantDomain row since P1), practice subdomains
// (the pattern), and everything else (a refusal, ruling 112).
//
// DEFAULT_TENANT_SLUG survives as the identity of tenant #1's OWN subdomain,
// not as an answer for unknown hosts. Nothing resolves TO it by default.
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

// The SECOND step only: `{slug}.$PLATFORM_DOMAIN` → that slug. NULL means "this
// host carries no practice slug" — it is not "the default practice", and callers
// must treat it as a refusal, not a value (ruling 112). Returning null rather
// than throwing keeps the two callers' different refusals theirs to choose: the
// chrome resolver renders the unresolved shell, the data layer throws.
//
// Note for reviewers: the compiler caught the one call site that PASSES this
// value on (lib/prisma.ts) and none of the four in audits/platform/verify.ts
// that COMPARE it — `===` against a string literal is legal on a nullable
// string, so those four would have flipped from true to false at runtime with
// no build error. The gate, not the compiler, is what holds that half.
export function slugFromHost(host: string | null): string | null {
  const platformDomain = process.env.PLATFORM_DOMAIN; // e.g. "portaldomain.com"
  if (!host || !platformDomain) return null;
  const clean = host.split(":")[0].toLowerCase();
  if (clean === platformDomain || !clean.endsWith(`.${platformDomain}`)) {
    return null;
  }
  const sub = clean.slice(0, -(platformDomain.length + 1));
  // A nested subdomain ("a.b.portaldomain.com") is not a slug and never was —
  // it used to fall to the default, which is exactly the leak P3.3 closes.
  return !sub || sub.includes(".") ? null : sub;
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

// P3.3 — resolution by STATED id, for the out-of-request path only. It shares
// the by-slug cache keyed on an id-prefixed string so an id and a slug can never
// collide in it. This is the chrome half of ruling 24's "ops tooling states its
// own tenant": the data layer has had withTenantScope since C24.1, and without
// this the two layers disagreed outside a request — the data layer honoured the
// stated tenant while getTenant() still answered "the default practice".
export async function tenantByIdChecked(tenantId: string): Promise<CheckedLookup> {
  const key = `id:${tenantId}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return { ok: true, tenant: hit.tenant };
  let row;
  try {
    row = await prisma.tenant.findUnique({ where: { id: tenantId } });
  } catch {
    return { ok: false, stale: hit?.tenant ?? null };
  }
  const tenant = row ? toConfig(row) : null;
  cache.set(key, { at: Date.now(), tenant });
  return { ok: true, tenant };
}

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
  // P3.3 — no mapping row and no practice subdomain is an ANSWER, and the answer
  // is "we do not know whose host this is". C26's unresolved shell renders: no
  // practice name, no borrowed wordmark, 503. It is not the default practice.
  const slug = slugFromHost(host);
  if (slug === null) {
    console.error(
      `[tenancy] UNRESOLVED host "${clean ?? "(none)"}" — no TenantDomain row and no {slug}.$PLATFORM_DOMAIN pattern (P3.3: the default-tenant fallback is gone)`,
    );
    return { kind: "unresolved" };
  }
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
  // P3.3 — FRESH_DB_SHELL is GONE. It was a hardcoded copy of tenant #1's
  // identity (id, display name, skin) served when the default row was absent on
  // a fresh database — the one place her practice existed as a literal in
  // application code rather than as data. An empty database is now unresolved,
  // which is what it actually is.
  if (!d.tenant) {
    console.error(`[tenancy] UNRESOLVED — no tenant row for the default slug while resolving unknown slug "${slug}"`);
    return { kind: "unresolved" };
  }
  return { kind: "unknown-slug", tenant: d.tenant };
}

/** The current request's resolution (never throws). P3.3 — OUTSIDE a request
 *  there is no host, so there is no tenant: the result is `unresolved`, where
 *  it used to be the default practice. Every caller in this app is
 *  request-scoped (pages, server actions, route handlers); a CLI that needs a
 *  tenant states it via withTenantScope, which is the data layer's contract and
 *  was always the correct one (ruling 24). */
/** The host of the CURRENT request, or null when there is none to have.
 *
 *  P3.3 — "there is no request" and "this host resolves to nobody" used to be
 *  the same thing, because both ended at the host-pattern fallback and both
 *  answered "the default practice". They are not the same thing, and collapsing
 *  them is how removing the fallback baked `/unavailable` into the STATIC
 *  marketing home: `next build` renders that page with no visitor, the public
 *  layout read `unresolved`, and C26's redirect fired at BUILD time. Caught by
 *  audits/event-chrome-verify.ts (`/` -> 307, her identity counts 35 -> 0) and
 *  audits/signup/verify.ts, which fetches `/` and looks for the signup link.
 *
 *  THE FIRST ATTEMPT AT THIS WAS WRONG AND THE BUILD OUTPUT SAID SO. It used
 *  `try { headers() } catch` to detect build time, on the assumption that
 *  `headers()` throws during static generation. Under `export const dynamic =
 *  "force-static"` -- which the marketing home sets -- Next does NOT throw: it
 *  returns an EMPTY headers object. So the probe answered "yes, a request", the
 *  redirect ran anyway, and `NEXT_REDIRECT;replace;/unavailable;307` was still
 *  sitting in `.next/server/app/index.html`. Reading the artifact rather than
 *  trusting the reasoning is what found it.
 *
 *  A HOST is the honest discriminator: a build has none, and every request
 *  through Railway's edge has one. C26 is untouched -- it refuses a request
 *  whose host cannot be PLACED, and this says only that a render with no host
 *  at all is not such a request. The static root is byte-identical either way
 *  (`force-static`, content from @/content/site-content, and the chrome names
 *  no practice when none is resolved). */
export function requestHost(): string | null {
  try {
    const h = headers();
    return h.get("x-forwarded-host")?.split(",")[0]?.trim() || h.get("host") || null;
  } catch {
    return null;
  }
}

export async function getTenantResolution(): Promise<TenantResolution> {
  // One reader of the host for the whole module (requestHost above).
  const host: string | null = requestHost();
  try {
    headers();
  } catch {
    // Outside a request scope (CLI scripts, gate harnesses) there is no host.
    // P3.3 — the answer is NOT "the default practice" any more (ruling 85). A
    // caller that needs a tenant out here STATES one, with the same
    // withTenantScope(T, fn) the data layer has required since C24.1. The
    // request path never reaches this branch, so nothing a wrapper does can
    // override a real request's tenant (C24.1 §1 precedence 1).
    const stated = ambientTenantId();
    if (!stated) return { kind: "unresolved" };
    const r = await tenantByIdChecked(stated);
    if (!r.ok) return r.stale ? { kind: "tenant", tenant: r.stale } : { kind: "unresolved" };
    if (!r.tenant) {
      console.error(`[tenancy] UNRESOLVED — stated tenant scope "${stated}" matches no tenant row`);
      return { kind: "unresolved" };
    }
    return { kind: "tenant", tenant: r.tenant };
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
