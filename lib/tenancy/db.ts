// Raw client on purpose: this DAL states its tenant explicitly per call —
// self-scoping over the scoped client would double-filter, and audit
// scripts use it outside any request scope.
import { rawPrisma as prisma } from "@/lib/prisma-internal";
import { scopeFilter as scope, SCOPED_MODELS, DEFAULT_TENANT_ID, type ScopedModel } from "./scope";

export { SCOPED_MODELS, DEFAULT_TENANT_ID };
export type { ScopedModel } from "./scope";

// PLATFORM Phase 0.5 — the tenant-scoped data-access layer, now covering
// EVERY table directly (per-client scoping pulled forward from later phases).
// One factory, one code path: the tenant filter is injected structurally, so
// a scoped accessor CANNOT forget it. Legacy rows (tenantId null) belong to
// the DEFAULT tenant only; every other tenant sees strictly its own rows.
//
// Feature code migrates onto tenantDb as it is touched; the enforced boundary
// at the door (getSessionUser host↔tenant check) holds regardless.

type Args = { where?: Record<string, unknown>; [k: string]: unknown };
export type ScopedDelegate = {
  findMany(args?: Args): Promise<Record<string, unknown>[]>;
  findFirst(args?: Args): Promise<Record<string, unknown> | null>;
  count(args?: Args): Promise<number>;
};

export function tenantDb(tenantId: string): Record<ScopedModel, ScopedDelegate> {
  const out = {} as Record<ScopedModel, ScopedDelegate>;
  for (const key of SCOPED_MODELS) {
    // One dynamic hop onto the Prisma client; the surface stays typed above.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = (prisma as any)[key];
    out[key] = {
      findMany: (args = {}) =>
        d.findMany({ ...args, where: { AND: [scope(tenantId), args.where ?? {}] } }),
      findFirst: (args = {}) =>
        d.findFirst({ ...args, where: { AND: [scope(tenantId), args.where ?? {}] } }),
      count: (args = {}) =>
        d.count({ ...args, where: { AND: [scope(tenantId), args.where ?? {}] } }),
    };
  }
  return out;
}
