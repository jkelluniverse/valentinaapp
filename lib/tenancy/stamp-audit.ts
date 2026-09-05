// Raw client on purpose: this is the platform-wide null-tenant invariant
// audit — it must see every row regardless of any request scope.
import { rawPrisma } from "@/lib/prisma-internal";
import { SCOPED_MODELS } from "./scope";

// The invariant (post-migration-36, reasserted by migration 48): ZERO rows
// with null tenantId, in every scoped table. The scoped client stamps
// request-path creates INCLUDING nested relation writes at any depth
// (C24-NESTED-STAMP), seeds stamp on completion, and migrations 36 + 48
// converged history — so any null row is drift. The likeliest cause is NOT a
// nested write: it is a CLI script or gate harness importing the SCOPED
// client and creating a scoped row without stating a tenantId, since outside
// a request that client is a passthrough by design.

export type StampAudit = { total: number; byModel: Record<string, number> };

export async function auditNullTenantRows(): Promise<StampAudit> {
  const byModel: Record<string, number> = {};
  let total = 0;
  for (const key of SCOPED_MODELS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const n: number = await (rawPrisma as any)[key].count({ where: { tenantId: null } });
    if (n > 0) byModel[key] = n;
    total += n;
  }
  return { total, byModel };
}
