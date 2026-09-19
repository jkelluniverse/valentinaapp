// PLATFORM — the OUT-OF-REQUEST tenant scope (C24.1-TENANT-SCOPE §1,
// implementing Architect ruling 24).
//
// WHY THIS EXISTS. The scoped client (lib/prisma.ts) resolves the tenant from
// `headers()`. Outside an HTTP request `headers()` throws, so the client is a
// deliberate PASSTHROUGH — which means a CLI script or gate harness that
// imports `@/lib/prisma` and creates a scoped row without stating a tenantId
// writes a NULL one. That, not nested relation writes, is what has been
// failing the null-tenant invariant audit (C24's finding).
//
// This module is the opt-in remedy: a CLI caller wraps its body once, and
// every scoped write beneath it — including writes performed by product
// libraries it drives, which cannot be told a tenant from the call site —
// inherits that tenant.
//
// THE PRECEDENCE, and it is load-bearing (lib/prisma.ts:requestTenantId):
//   1. the request's tenant from `headers()` — UNCHANGED, and it ALWAYS WINS.
//      This scope is consulted ONLY on the path where `headers()` was
//      unavailable. If a wrapper could override a request's tenant, this
//      would be a cross-tenant WRITE mechanism rather than a fix.
//   2. else this scope's value, when the code runs inside one.
//   3. else exactly today's behaviour: passthrough, unstamped, and VISIBLE to
//      the null-tenant audit.
//
// WHAT THIS IS DELIBERATELY NOT. It is not an implicit default-tenant stamp
// for unscoped writes — ruling 24 REJECTED that: it would remove most of the
// audit's detection surface and would silently record a second practice's
// forgotten rows as Valentina's. Absence of a scope must stay loud. An
// explicit `tenantId` in a payload still beats everything, at any nesting
// depth (lib/tenancy/stamp.ts).
//
// SAFETY OF THE MECHANISM. `AsyncLocalStorage` propagates across `await`
// boundaries and is per-async-context, so concurrent scopes cannot bleed into
// one another; it is a core `node:async_hooks` primitive available in the
// Node.js runtime this app and its CLI tooling run in. It is NOT available on
// the Edge runtime — which is why this module is imported only from
// lib/prisma.ts, itself Node-only (Prisma cannot run on Edge), and why
// nothing in middleware.ts reaches it.

import { AsyncLocalStorage } from "node:async_hooks";

const store = new AsyncLocalStorage<string>();

/**
 * Run `fn` with `tenantId` as the ambient tenant for every scoped write that
 * happens beneath it OUTSIDE an HTTP request. Inside a request the request's
 * own tenant still wins.
 *
 * Returns whatever `fn` returns (so it wraps both sync and async bodies):
 *
 *   await withTenantScope(DEFAULT_TENANT_ID, async () => { await main(); });
 */
export function withTenantScope<T>(tenantId: string, fn: () => T): T {
  if (typeof tenantId !== "string" || tenantId.length === 0) {
    // Loud, not lenient: an empty tenant would silently degrade to
    // passthrough and reintroduce the exact defect this closes.
    throw new Error("withTenantScope: tenantId must be a non-empty string");
  }
  return store.run(tenantId, fn);
}

/**
 * The ambient scope's tenant, or null when not inside one. Consulted by
 * lib/prisma.ts ONLY when the request-header path is unavailable.
 */
export function ambientTenantId(): string | null {
  return store.getStore() ?? null;
}
