import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { getTenant } from "@/lib/tenancy";
import { buildIntakeSchema } from "@/lib/intake/schema";
import type { TenantModuleRow } from "@/lib/modules/registry";
import { resolveQuestionSet, concreteFromRequirement, type ConcreteField } from "@/lib/intake/questions";

// CLIENT-ONBOARDING v1.1 — the intake engine service. The intake is GENERATED
// from the tenant's enabled modules (never hardcoded, Rule 0.1); resumable
// (every answer persists on entry, Rule 0.2); and self-contained forever
// (each answer snapshots its question text, Rule 0.8). The completion
// orchestration (§5 — scorer + reading fan-out + ConsentRecord) is in
// lib/intake/complete.ts; this file owns the flow lifecycle.

export type ConcreteStep = {
  key: string; // "identity" | "birth" | "shared" | "module:<key>" | "custom" | "review" | "done"
  title: string;
  moduleKey?: string;
  fields: ConcreteField[];
};

export type ConcreteSchema = {
  steps: ConcreteStep[]; // welcome/review/done are framework steps added by the UI
  hash: string;
  birthTime: { degrades: string[]; hides: string[] };
};

// Read the tenant's module rows and assemble the concrete, answerable schema
// (question sets expanded to real fields). tenantModule is a platform table
// (not tenant-scoped in the DAL), so it is filtered by tenantId explicitly.
export async function concreteSchemaFor(tenantId: string): Promise<ConcreteSchema> {
  const rows = (await prisma.tenantModule.findMany({
    where: { tenantId, enabled: true },
    orderBy: { position: "asc" },
  })) as unknown as TenantModuleRow[];

  const built = buildIntakeSchema(rows);
  const steps: ConcreteStep[] = built.steps.map((s) => ({
    key: s.key,
    title: s.title,
    moduleKey: s.moduleKey,
    fields: s.fields.flatMap((f) =>
      f.kind === "question-set" && f.questionSetRef ? resolveQuestionSet(f.questionSetRef) : [concreteFromRequirement(f)],
    ),
  }));
  // The hash covers the concrete fields — reword a question and the drift
  // guard fires (§4.3). Question text lives in labels, so a label change
  // that alters what's asked changes the hash.
  const hash = createHash("sha256")
    .update(JSON.stringify(steps.map((s) => ({ k: s.key, f: s.fields.map((x) => ({ key: x.key, label: x.label, required: x.required })) }))))
    .digest("hex")
    .slice(0, 16);
  return { steps, hash, birthTime: built.birthTime };
}

// Rough minute estimate for the honest expectation line (§3 Welcome).
export function estimateMinutes(schema: ConcreteSchema): number {
  const fields = schema.steps.reduce((n, s) => n + s.fields.length, 0);
  return Math.max(3, Math.round(fields / 6));
}

export type ActorKind = "client" | "practitioner" | "system";

export async function emitEvent(args: {
  tenantId: string;
  clientId: string | null;
  actor: ActorKind;
  eventKey: string;
  meta?: Record<string, unknown>;
}): Promise<void> {
  // ActivityEvent is scoped; the scoped client stamps tenant on create.
  await prisma.activityEvent
    .create({ data: { clientId: args.clientId, actor: args.actor, eventKey: args.eventKey, meta: (args.meta ?? undefined) as object } })
    .catch(() => undefined); // the event log is best-effort; never block intake on it
}

// The client's active INITIAL flow, created on first need. Existing clients
// (who completed setup before the engine) have no flow and are never forced
// into intake — the routing gate only fires on an IN_PROGRESS flow.
export async function getActiveFlow(clientId: string): Promise<{
  id: string;
  status: string;
  currentStep: string;
  schemaHash: string;
} | null> {
  const flow = await prisma.intakeFlow.findFirst({
    where: { clientId, purpose: "INITIAL", status: "IN_PROGRESS" },
    select: { id: true, status: true, currentStep: true, schemaHash: true },
  });
  return flow;
}

export async function startFlow(clientId: string): Promise<{ id: string; currentStep: string }> {
  const tenant = await getTenant();
  const existing = await getActiveFlow(clientId);
  if (existing) return { id: existing.id, currentStep: existing.currentStep };

  const schema = await concreteSchemaFor(tenant.id);
  // The UI sequence is [welcome, ...steps, review]; a fresh flow starts on
  // the Welcome screen.
  const flow = await prisma.intakeFlow.create({
    data: { clientId, purpose: "INITIAL", status: "IN_PROGRESS", schemaHash: schema.hash, currentStep: "welcome", startedAt: new Date() },
  });
  await emitEvent({ tenantId: tenant.id, clientId, actor: "client", eventKey: "intake.started", meta: { flowId: flow.id } });
  return { id: flow.id, currentStep: flow.currentStep };
}

// Per-field persistence with a question-text snapshot (Rule 0.8). Idempotent
// upsert keyed by (flow, fieldKey) — auto-save can fire repeatedly.
export async function saveAnswer(args: {
  flowId: string;
  fieldKey: string;
  value: unknown;
  questionText: string;
}): Promise<void> {
  await prisma.intakeAnswer.upsert({
    where: { flowId_fieldKey: { flowId: args.flowId, fieldKey: args.fieldKey } },
    create: { flowId: args.flowId, fieldKey: args.fieldKey, value: args.value as object, questionTextSnapshot: args.questionText },
    update: { value: args.value as object, questionTextSnapshot: args.questionText },
  });
}

export async function getAnswers(flowId: string): Promise<Record<string, unknown>> {
  const rows = await prisma.intakeAnswer.findMany({ where: { flowId }, select: { fieldKey: true, value: true } });
  return Object.fromEntries(rows.map((r) => [r.fieldKey, r.value]));
}

export async function advanceStep(flowId: string, stepKey: string): Promise<void> {
  const tenant = await getTenant();
  const flow = await prisma.intakeFlow.update({ where: { id: flowId }, data: { currentStep: stepKey } });
  await emitEvent({ tenantId: tenant.id, clientId: flow.clientId, actor: "client", eventKey: "intake.step_completed", meta: { flowId, step: stepKey } });
}

// Schema-drift guard (§4.3): if the enabled modules changed since the flow
// started, rebuild against the new schema, KEEP every still-relevant answer,
// and update the stored hash. Answers are never discarded; new questions
// simply appear. Returns the concrete schema to render.
export async function loadFlowSchema(flowId: string): Promise<{ schema: ConcreteSchema; drifted: boolean }> {
  const tenant = await getTenant();
  const flow = await prisma.intakeFlow.findFirst({ where: { id: flowId }, select: { schemaHash: true } });
  const schema = await concreteSchemaFor(tenant.id);
  const drifted = Boolean(flow && flow.schemaHash !== schema.hash);
  if (drifted) {
    await prisma.intakeFlow.update({ where: { id: flowId }, data: { schemaHash: schema.hash } });
    await emitEvent({ tenantId: tenant.id, clientId: null, actor: "system", eventKey: "intake.schema_rebuilt", meta: { flowId } });
  }
  return { schema, drifted };
}
