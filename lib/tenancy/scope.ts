// PLATFORM — the tenant-scope vocabulary, dependency-free so that both the
// scoped prisma client (lib/prisma.ts) and the explicit DAL (lib/tenancy/db.ts)
// share one definition without import cycles.

// The default tenant's identity is fixed by the Phase 0 migration.
export const DEFAULT_TENANT_ID = "tnt_valentina_000000001";
export const DEFAULT_TENANT_SLUG = "valentina";

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
  "lead", "connectedPaymentAccount", "payment", "sessionCapture",
  "intakeFlow", "clientHintState", "activityEvent", "tenantBilling", "reading",
  "agreementTemplate", "agreement", "agreementEvent", "patternElection", "agreementFile",
] as const;
// NOT scoped:
//  - webhookEvent (platform-level, like Tenant/TenantModule): provider event
//    ids are global idempotency keys across all tenants.
//  - intakeAnswer: has NO tenantId column — it is scoped transitively through
//    its parent IntakeFlow (cascade delete). Access is always gated by a
//    flowId obtained from a tenant-scoped IntakeFlow query, so a scoped
//    filter here would be both wrong (no column) and redundant.

export type ScopedModel = (typeof SCOPED_MODELS)[number];

export const SCOPED_MODEL_SET: ReadonlySet<string> = new Set(SCOPED_MODELS);

// Legacy rows (tenantId null) belong to the DEFAULT tenant only; every other
// tenant sees strictly its own rows.
export const scopeFilter = (tenantId: string) =>
  tenantId === DEFAULT_TENANT_ID
    ? { OR: [{ tenantId }, { tenantId: null }] }
    : { tenantId };
