import { rawPrisma as prisma } from "../../lib/prisma-internal";
import { addBirthTime } from "../../lib/intake/update";
import { ensureChart } from "../../lib/human-design";

// CLIENT-ONBOARDING §4.6 acceptance — the birth-time UPDATE flow. A client
// who onboarded WITHOUT a birth time adds it later; time-dependent readings
// recompute. Throwaway client, self-cleaning.

const results: { name: string; pass: boolean; note?: string }[] = [];
function check(name: string, pass: boolean, note?: string) {
  results.push({ name, pass, note });
  console.log(`- ${pass ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
}
const EMAIL = "onboarding-update-probe@fixture.test";

async function cleanup() {
  const u = await prisma.user.findUnique({ where: { email: EMAIL } }).catch(() => null);
  if (!u) return;
  await prisma.intakeFlow.deleteMany({ where: { clientId: u.id } }).catch(() => {});
  await prisma.activityEvent.deleteMany({ where: { clientId: u.id } }).catch(() => {});
  await prisma.lensResult.deleteMany({ where: { userId: u.id } }).catch(() => {});
  await prisma.humanDesignChart.deleteMany({ where: { userId: u.id } }).catch(() => {});
  await prisma.birthChartCore.deleteMany({ where: { userId: u.id } }).catch(() => {});
  await prisma.psycheEdge.deleteMany({ where: { clientId: u.id } }).catch(() => {});
  await prisma.psycheNode.deleteMany({ where: { clientId: u.id } }).catch(() => {});
  await prisma.clientProfile.deleteMany({ where: { userId: u.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: u.id } }).catch(() => {});
}

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL required (scratch copy)");
  if (/railway|rlwy\.net/.test(url)) throw new Error("Refusing to run against a Railway database");
  await cleanup();

  const client = await prisma.user.create({ data: { email: EMAIL, name: "Update Probe", role: "CLIENT", active: true, tenantId: "tnt_valentina_000000001", passwordHash: "x" } });
  // Onboarded WITHOUT a time: birthTimeUnknown, full place, chart from estimate.
  await prisma.clientProfile.create({
    data: { userId: client.id, birthDate: new Date("1991-03-03T00:00:00Z"), birthTimeUnknown: true, birthTimePrecision: "UNKNOWN", birthPlace: "Denver, Colorado, USA", birthLat: 39.7392, birthLng: -104.9903, birthTz: "America/Denver" },
  });
  const profile = await prisma.clientProfile.findUnique({ where: { userId: client.id } });
  await ensureChart(profile as never); // estimate-time chart exists
  const beforeHash = (await prisma.humanDesignChart.findUnique({ where: { userId: client.id }, select: { inputHash: true } }))?.inputHash;
  check("pre: chart computed from an estimated time", Boolean(beforeHash));

  try {
    // Bad time rejected.
    const bad = await addBirthTime(client.id, "9am");
    check("invalid time rejected", !bad.ok && bad.error === "time");

    // The real update.
    const res = await addBirthTime(client.id, "06:20");
    check("addBirthTime succeeds", res.ok);
    const p = await prisma.clientProfile.findUnique({ where: { userId: client.id } });
    check("profile now has the exact time (precision EXACT)", p?.birthTime === "06:20" && p?.birthTimeUnknown === false && p?.birthTimePrecision === "EXACT");
    const afterHash = (await prisma.humanDesignChart.findUnique({ where: { userId: client.id }, select: { inputHash: true } }))?.inputHash;
    check("chart recomputed (inputHash changed with the new time)", Boolean(afterHash) && afterHash !== beforeHash, `${beforeHash?.slice(0, 8)} → ${afterHash?.slice(0, 8)}`);
    check("an UPDATE-purpose flow was recorded COMPLETE", (await prisma.intakeFlow.count({ where: { clientId: client.id, purpose: "UPDATE", status: "COMPLETE" } })) === 1);
    check("intake.birthtime_added event emitted", (await prisma.activityEvent.count({ where: { clientId: client.id, eventKey: "intake.birthtime_added" } })) === 1);
  } finally {
    await cleanup();
    console.log("~ throwaway client removed");
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log(failed === 0 ? `\nUPDATE VERIFY PASS — ${results.length}/${results.length}` : `\n${failed} CHECK(S) FAILED`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => void prisma.$disconnect());
