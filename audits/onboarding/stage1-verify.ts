import { rawPrisma as prisma } from "../../lib/prisma-internal";
import {
  concreteSchemaFor,
  estimateMinutes,
  startFlow,
  getActiveFlow,
  saveAnswer,
  getAnswers,
  advanceStep,
  loadFlowSchema,
} from "../../lib/intake/engine";

// CLIENT-ONBOARDING Stage 1 acceptance — the intake engine spine. CLI-run
// (outside a request → default tenant), self-cleaning so the scratch DB
// returns to zero null-tenant rows for the invariant audit.
//
//   DATABASE_URL=...scratch npx tsx audits/onboarding/stage1-verify.ts

const results: { name: string; pass: boolean; note?: string }[] = [];
function check(name: string, pass: boolean, note?: string) {
  results.push({ name, pass, note });
  console.log(`- ${pass ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
}

const TENANT = "tnt_valentina_000000001";
const B_MODULE_ID = "tm_stage1_probe_00001";

async function cleanup(clientId: string) {
  await prisma.intakeFlow.deleteMany({ where: { clientId } }).catch(() => {}); // cascades answers
  await prisma.activityEvent.deleteMany({ where: { OR: [{ clientId }, { eventKey: "intake.schema_rebuilt" }] } }).catch(() => {});
  await prisma.tenantModule.deleteMany({ where: { id: B_MODULE_ID } }).catch(() => {});
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL required (scratch copy)");
  if (/railway|rlwy\.net/.test(url)) throw new Error("Refusing to run against a Railway database");

  const maria = await prisma.user.findUnique({ where: { email: "maria@fixture.test" } });
  if (!maria) throw new Error("fixture roster missing — seed the scratch DB first");
  await cleanup(maria.id);

  try {
    // 1 — schema derives from her enabled modules, question sets expanded
    const schema = await concreteSchemaFor(TENANT);
    check("schema: identity → birth → values-spiral steps", schema.steps.map((s) => s.key).join(",") === "identity,birth,module:values-spiral", schema.steps.map((s) => s.key).join(","));
    const valuesStep = schema.steps.find((s) => s.moduleKey === "values-spiral");
    check("values question set expanded to concrete scale fields", (valuesStep?.fields.length ?? 0) > 5 && valuesStep!.fields.every((f) => f.key.startsWith("values.")));
    check("birth-time-unknown path carried on the schema", schema.birthTime.degrades.length === 2);
    check("minute estimate is honest (>=3)", estimateMinutes(schema) >= 3, String(estimateMinutes(schema)));

    // 2 — existing client with no flow is NOT forced into intake
    check("no flow yet → getActiveFlow null (existing clients untouched)", (await getActiveFlow(maria.id)) === null);

    // 3 — start creates an IN_PROGRESS flow and emits intake.started
    const started = await startFlow(maria.id);
    const flow = await getActiveFlow(maria.id);
    check("startFlow creates one IN_PROGRESS flow", flow !== null && flow.id === started.id);
    check("first step is identity", started.currentStep === "identity");
    check("intake.started event emitted", (await prisma.activityEvent.count({ where: { clientId: maria.id, eventKey: "intake.started" } })) === 1);

    // 4 — resume: a second start returns the SAME flow (one non-complete flow)
    const again = await startFlow(maria.id);
    check("resume returns the same flow (one active flow only)", again.id === started.id && (await prisma.intakeFlow.count({ where: { clientId: maria.id, status: "IN_PROGRESS" } })) === 1);

    // 5 — answers persist with a question-text snapshot; upsert is idempotent
    await saveAnswer({ flowId: flow!.id, fieldKey: "identity.fullName", value: "María Reyes", questionText: "Full name" });
    await saveAnswer({ flowId: flow!.id, fieldKey: "identity.fullName", value: "María R.", questionText: "Full name" }); // re-save
    const answerRows = await prisma.intakeAnswer.findMany({ where: { flowId: flow!.id, fieldKey: "identity.fullName" } });
    check("answer upsert idempotent (one row, latest value)", answerRows.length === 1 && (answerRows[0].value as unknown) === "María R.");
    check("question text snapshotted on the answer", answerRows[0].questionTextSnapshot === "Full name");
    await saveAnswer({ flowId: flow!.id, fieldKey: "birth.date", value: "1990-04-12", questionText: "Date of birth" });
    const answers = await getAnswers(flow!.id);
    check("getAnswers returns saved fields", answers["identity.fullName"] === "María R." && answers["birth.date"] === "1990-04-12");

    // 6 — advance emits step_completed
    await advanceStep(flow!.id, "birth");
    check("advanceStep records currentStep + step_completed event", (await prisma.intakeFlow.findFirst({ where: { id: flow!.id } }))?.currentStep === "birth" && (await prisma.activityEvent.count({ where: { clientId: maria.id, eventKey: "intake.step_completed" } })) === 1);

    // 7 — drift guard: unchanged schema → no drift; enable a module → drift,
    //     answers kept, hash updated
    const noDrift = await loadFlowSchema(flow!.id);
    check("no schema change → no drift", !noDrift.drifted);
    // Force a real schema change by disabling values-spiral (it owns a unique
    // question-set step; the chart modules share birth fields, so disabling
    // one of THEM is correctly NOT a drift — the builder dedups). Restore after.
    const realValues = await prisma.tenantModule.findFirst({ where: { tenantId: TENANT, moduleKey: "values-spiral" } });
    let drifted = { drifted: false };
    let hashSynced = false;
    if (realValues) {
      await prisma.tenantModule.update({ where: { id: realValues.id }, data: { enabled: false } });
      const disabledHash = (await concreteSchemaFor(TENANT)).hash;
      drifted = await loadFlowSchema(flow!.id);
      hashSynced = (await prisma.intakeFlow.findFirst({ where: { id: flow!.id } }))?.schemaHash === disabledHash;
      await prisma.tenantModule.update({ where: { id: realValues.id }, data: { enabled: true } }); // restore
    }
    check("disabling a question-set module drifts the flow (schema rebuilt)", drifted.drifted);
    check("answers survive the drift (never discarded)", (await prisma.intakeAnswer.count({ where: { flowId: flow!.id } })) === 2);
    check("stored hash re-synced to the new schema after drift", hashSynced);
  } finally {
    await cleanup(maria.id);
    console.log("~ intake rows removed");
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log(failed === 0 ? `\nSTAGE 1 VERIFY PASS — ${results.length}/${results.length}` : `\n${failed} CHECK(S) FAILED`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => void prisma.$disconnect());
