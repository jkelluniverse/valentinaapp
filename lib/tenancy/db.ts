import { prisma } from "@/lib/prisma";

// PLATFORM Phase 0.5 — the tenant-scoped data-access layer, now covering
// EVERY table directly (per-client scoping pulled forward from later phases).
// One factory, one code path: the tenant filter is injected structurally, so
// a scoped accessor CANNOT forget it. Legacy rows (tenantId null) belong to
// the DEFAULT tenant only; every other tenant sees strictly its own rows.
//
// Feature code migrates onto tenantDb as it is touched; the enforced boundary
// at the door (getSessionUser host↔tenant check) holds regardless.

// The default tenant's id is fixed by the Phase 0 migration.
export const DEFAULT_TENANT_ID = "tnt_valentina_000000001";

const scope = (tenantId: string) =>
  tenantId === DEFAULT_TENANT_ID
    ? { OR: [{ tenantId }, { tenantId: null }] }
    : { tenantId };

// Every tenant-scoped Prisma delegate (all models except Tenant/TenantModule).
export const SCOPED_MODELS = [
  "user", "consentGrant", "pushSubscription", "emailChangeRequest", "passwordResetToken",
  "deletionRequest", "entryDeepening", "psycheNode", "psycheEdge", "psycheExtraction",
  "psycheAudit", "patternArchetype", "patternLink", "libraryFolder", "libraryItem",
  "clientProfile", "humanDesignChart", "birthChartCore", "lensResult", "integrativeProfile",
  "artifactVersion", "integrativeReading", "resonanceMark", "integrationGuide", "clientGoal",
  "beliefWork", "interventionOutcome", "askRecordAnswer", "practiceSetting", "note",
  "handwrittenNote", "recordingConsent", "recordingDraft", "sessionTranscript", "noteScan",
  "conversation", "message", "stageChange", "package", "sessionCredit",
  "priceBook", "charge", "squareCustomerLink", "externalPayment", "worksheet",
  "worksheetAssignment", "worksheetResponse", "assistGrant", "auditEvent", "course",
  "chapter", "lesson", "enrollment", "lessonProgress", "sessionPrep",
  "recordItem", "prompt", "assignment", "promptResponse", "logEntry",
  "invite", "schedulingConfig", "availabilityRule", "availabilityException", "appointment",
  "lead",
] as const;

export type ScopedModel = (typeof SCOPED_MODELS)[number];

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
