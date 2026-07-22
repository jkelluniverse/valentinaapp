import { rawPrisma as prisma } from "../../lib/prisma-internal";
import { startFlow, saveAnswer } from "../../lib/intake/engine";
import { completeIntake, runCompletionFanout } from "../../lib/intake/complete";
import { buildSpiralFields } from "../../lib/spiral";
import { hasRecordingConsent, RECORDING_CONSENT_VERSION } from "../../lib/recording";

// CLIENT-ONBOARDING §5 acceptance — completion orchestration + BOTH
// load-bearing intersections. Uses a THROWAWAY client (never a fixture
// client — completion writes real profile/chart/lens rows) and deletes it
// at the end, so María and the baseline are untouched.
//
//   DATABASE_URL=...scratch npx tsx audits/onboarding/complete-verify.ts

const results: { name: string; pass: boolean; note?: string }[] = [];
function check(name: string, pass: boolean, note?: string) {
  results.push({ name, pass, note });
  console.log(`- ${pass ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
}

const EMAIL = "onboarding-complete-probe@fixture.test";

async function cleanup() {
  const u = await prisma.user.findUnique({ where: { email: EMAIL } }).catch(() => null);
  if (!u) return;
  await prisma.intakeFlow.deleteMany({ where: { clientId: u.id } }).catch(() => {});
  await prisma.activityEvent.deleteMany({ where: { clientId: u.id } }).catch(() => {});
  await prisma.lensResult.deleteMany({ where: { userId: u.id } }).catch(() => {});
  await prisma.humanDesignChart.deleteMany({ where: { userId: u.id } }).catch(() => {});
  await prisma.birthChartCore.deleteMany({ where: { userId: u.id } }).catch(() => {});
  // ensureChart also seeds CHART_DERIVED psyche hypotheses (chart-seeds) —
  // remove them and their edges so the scratch DB returns fully clean.
  await prisma.psycheEdge.deleteMany({ where: { clientId: u.id } }).catch(() => {});
  await prisma.psycheNode.deleteMany({ where: { clientId: u.id } }).catch(() => {});
  await prisma.recordingConsent.deleteMany({ where: { clientId: u.id } }).catch(() => {});
  await prisma.clientProfile.deleteMany({ where: { userId: u.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: u.id } }).catch(() => {});
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL required (scratch copy)");
  if (/railway|rlwy\.net/.test(url)) throw new Error("Refusing to run against a Railway database");
  await cleanup();

  const client = await prisma.user.create({
    data: { email: EMAIL, name: "Probe (pre-intake)", role: "CLIENT", active: true, tenantId: "tnt_valentina_000000001", passwordHash: "x" },
  });

  try {
    const flow = await startFlow(client.id);

    // Seed a full answer set the way the UI would.
    await saveAnswer({ flowId: flow.id, fieldKey: "identity.fullName", value: "Robin Probe", questionText: "Full name" });
    await saveAnswer({ flowId: flow.id, fieldKey: "identity.preferredName", value: "Robin", questionText: "Preferred name" });
    await saveAnswer({ flowId: flow.id, fieldKey: "birth.date", value: "1988-06-15", questionText: "Date of birth" });
    await saveAnswer({ flowId: flow.id, fieldKey: "birth.time", value: "14:30", questionText: "Time of birth" });
    // Place carries geocoded coords (as the places autocomplete provides).
    await saveAnswer({ flowId: flow.id, fieldKey: "birth.place", value: { display: "Austin, Texas, USA", lat: 30.2672, lng: -97.7431, tz: "America/Chicago" }, questionText: "Place of birth" });
    // Every values scale answer — a real spiral response.
    const spiralFields = buildSpiralFields().filter((f) => f.type !== "SECTION");
    for (let i = 0; i < spiralFields.length; i++) {
      await saveAnswer({ flowId: flow.id, fieldKey: `values.${spiralFields[i].id}`, value: (i % 5) + 1, questionText: spiralFields[i].label });
    }
    // Review-step recording consent.
    await saveAnswer({ flowId: flow.id, fieldKey: "consent.recording", value: true, questionText: "I agree to the recording terms" });

    // --- Completion (commits + status) ---
    const done = await completeIntake(flow.id);
    check("completeIntake returns the client", done?.clientId === client.id);
    const profile = await prisma.clientProfile.findUnique({ where: { userId: client.id } });
    check("identity committed to User.name", (await prisma.user.findUnique({ where: { id: client.id } }))?.name === "Robin Probe");
    check("birth data committed to profile (date + geocoded place)", Boolean(profile?.birthDate) && profile?.birthLat === 30.2672 && profile?.birthTz === "America/Chicago");
    check("birth time kept (precision EXACT)", profile?.birthTime === "14:30" && profile?.birthTimePrecision === "EXACT" && profile?.birthTimeUnknown === false);
    check("intakeCompletedAt stamped", Boolean(profile?.intakeCompletedAt));
    check("flow marked COMPLETE", (await prisma.intakeFlow.findFirst({ where: { id: flow.id } }))?.status === "COMPLETE");
    check("intake.completed event emitted", (await prisma.activityEvent.count({ where: { clientId: client.id, eventKey: "intake.completed" } })) === 1);

    // --- Fan-out (both intersections) ---
    const fan = await runCompletionFanout(flow.id, client.id);

    // Intersection (2a): the values scorer fired → LensResult SPIRAL.
    check("values scorer fired at completion", fan.spiralScored);
    const lens = await prisma.lensResult.findFirst({ where: { userId: client.id, lens: "SPIRAL" } });
    check("SPIRAL LensResult written, held for review", Boolean(lens) && lens?.practitionerReviewed === false);

    // Intersection (2b): the birth-data → reading path fired → chart.
    check("birth-data reading path fired at completion", fan.chartComputed);
    check("Human Design chart computed from birth data", (await prisma.humanDesignChart.count({ where: { userId: client.id } })) === 1);

    // Intersection (1): the recording ConsentRecord is the SAME record the
    // pipeline's consent gate reads.
    check("recording ConsentRecord created at Review", fan.recordingConsent);
    const rc = await prisma.recordingConsent.findUnique({ where: { clientId: client.id } });
    check("it is a real RecordingConsent row (correct version)", rc?.version === RECORDING_CONSENT_VERSION && rc?.revokedAt === null);
    check("the SESSION PIPELINE gate now passes for this client (same record)", await hasRecordingConsent(client.id));

    // reading.computed events emitted for both readings
    check("reading.computed events emitted (scorer + chart)", (await prisma.activityEvent.count({ where: { clientId: client.id, eventKey: "reading.computed" } })) === 2);

    // Guard: completion is idempotent — re-completing a COMPLETE flow no-ops.
    check("re-completing a COMPLETE flow no-ops", (await completeIntake(flow.id)) === null);
  } finally {
    await cleanup();
    console.log("~ throwaway client removed");
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log(failed === 0 ? `\nCOMPLETION VERIFY PASS — ${results.length}/${results.length}` : `\n${failed} CHECK(S) FAILED`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => void prisma.$disconnect());
