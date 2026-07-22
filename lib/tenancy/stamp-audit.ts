// Raw client on purpose: this is the platform-wide null-tenant invariant
// audit — it must see every row regardless of any request scope.
import { rawPrisma } from "@/lib/prisma-internal";
import { SCOPED_MODELS } from "./scope";

// The invariant (post-migration-36): ZERO rows with null tenantId, in every
// scoped table. The scoped client stamps request-path creates, seeds stamp
// on completion, migration 36 converged history — so any null row is drift,
// most likely the documented nested-relation-write gap (task: auto-stamp
// nested writes; this audit is the safety net until that lands).

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
