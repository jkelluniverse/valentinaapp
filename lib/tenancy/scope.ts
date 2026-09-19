// PLATFORM — the tenant-scope vocabulary, dependency-free so that both the
// scoped prisma client (lib/prisma.ts) and the explicit DAL (lib/tenancy/db.ts)
// share one definition without import cycles.

// The default tenant's identity is fixed by the Phase 0 migration.
export const DEFAULT_TENANT_ID = "tnt_valentina_000000001";

// P4 item 5 (rulings 82/133) — THE PLATFORM'S OWN TENANT. An attribution target
// for platform activity (founding-partner captures, engage sends and
// unsubscribes) so that the platform's marketing stops being recorded as
// Valentina's practice data. Created by migration 52.
//
// IT IS NOT A PRACTICE AND NO HOST MAY RESOLVE TO IT. Both resolvers refuse any
// tenant whose status is PLATFORM_TENANT_STATUS, and the refusal lives in CODE
// rather than in the slug's shape because Railway's wildcard *.psychefolio.com
// matches whatever Host a caller sends — an "un-typeable" slug would still be
// reachable with a crafted header. A status check cannot be spoofed that way.
export const PLATFORM_TENANT_ID = "tnt_platform_00000000001";
export const PLATFORM_TENANT_STATUS = "PLATFORM";
// P3.3 — middleware's duplicate of this literal is GONE with its short-circuit,
// so this constant no longer has a copy anywhere. It is tenant #1's OWN slug,
// not an answer for unknown hosts: nothing resolves TO it by default.
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

// P5 / RULING 86 — EVERY TENANT SEES STRICTLY ITS OWN ROWS, INCLUDING THIS ONE.
//
// This read:
//
//     tenantId === DEFAULT_TENANT_ID
//       ? { OR: [{ tenantId }, { tenantId: null }] }
//       : { tenantId }
//
// which was the DEEPEST form of the default-tenant assumption: a row with no
// owner was treated as HERS. It was true when it was written — migration 36
// converged the legacy rows and tenant #1 was the only practice — but it means
// an unowned row is silently readable and writable by one specific practice,
// and by no other. A row belonging to nobody now belongs to nobody.
//
// REMOVED ON EVIDENCE, NOT ON ARGUMENT (ruling 144). Jacob's production census
// discovered every table carrying a tenantId column dynamically — 82 of them,
// against P3.2's hardcoded 79 — and every one reported ZERO null-tenant rows.
// The instrument was proven in both directions on scratch first: 82 zeros, a
// deliberately planted null surfacing at the top, then 82 zeros again. No live
// row relies on this equivalence.
//
// It was load-bearing in ONE gate, found by looking BEFORE removing rather than
// by the sweep going red (ruling 162's lesson, applied forward): audits/platform
// /verify.ts nulled a row and asserted HER DAL could still see it. That check is
// INVERTED, NOT RELAXED — a null-tenant row is now visible to nobody, which is
// strictly stronger than what it asserted before.
export const scopeFilter = (tenantId: string) => ({ tenantId });
