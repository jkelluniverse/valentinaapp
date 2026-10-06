import { execSync } from "child_process";
import { writeFileSync, mkdirSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import { prisma } from "../../lib/prisma";

// FIXTURES-PATCH-VALUES — the §Verify list, live:
//   1. every active except the deliberate gaps carries an APPROVED blend
//      (and top-2 stage coverage: every stage appears at least twice)
//   2. the three gap states are distinct (absent · sent-awaiting · unapproved)
//   3. the PATCH-01 stale test, permanently: María's formulation regenerated
//      BEFORE her spiral seeds → seed → stale chip fires → refresh folds it in
//   4. lint + language law hold on regenerated readings (en + es)
//
//   SEED_ENV=staging ANTHROPIC_API_KEY=... DATABASE_URL=...scratch \
//   npx tsx prisma/fixtures/values-verify.ts

const report: string[] = [];
const log = (s: string) => { report.push(s); console.log(s); };
let failed = 0;
const check = (name: string, ok: boolean, note = "") => {
  if (!ok) failed++;
  log(`- ${ok ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
};

const GAPS = new Set(["tomas", "ben", "marcos"]);
const NEVER = new Set(["ana", "ruth"]); // lifecycle states, no assessment ever

async function main() {
  log(`# FIXTURES-PATCH-VALUES verify — ${new Date().toISOString()}`);
  const pw = (await prisma.user.findFirst({ where: { role: "PRACTITIONER" } }))!;
  const maria = (await prisma.user.findUnique({ where: { email: "maria@fixture.test" } }))!;

  // ---- §3 pre-step: María formulated WITHOUT her spiral ----
  log(`\n## §3 · The stale test (pre-seed formulation)`);
  await prisma.worksheetAssignment.deleteMany({
    where: { clientId: maria.id, worksheet: { isSpiral: true } },
  });
  await prisma.lensResult.deleteMany({ where: { userId: maria.id, lens: "SPIRAL" } });
  const { runIntegrativeSynthesis } = await import("../../lib/integrative");
  const pre = await runIntegrativeSynthesis(maria.id, pw.id);
  check("formulation regenerates without the spiral", pre.ok, pre.ok ? "" : pre.error);
  const preProfile = await prisma.integrativeProfile.findUnique({ where: { userId: maria.id } });
  const preFp = preProfile?.fingerprint as { lenses?: string[] } | null;
  check("pre-seed fingerprint has no SPIRAL lens", !preFp?.lenses?.includes("SPIRAL"), JSON.stringify(preFp?.lenses));

  // ---- Run the REAL seed (answers → scorer → blend → approval) ----
  log(`\n## Seed · answers through the real pipeline`);
  execSync("npx tsx prisma/fixtures/seed-staging.ts", {
    stdio: "inherit",
    env: { ...process.env, SEED_ENV: "staging" },
  });

  // ---- §1: approved blends everywhere but the gaps + stage coverage ----
  log(`\n## §1 · Approved blends on every active (gaps excepted)`);
  const briefs = readdirSync(join(__dirname, "briefs"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(__dirname, "briefs", f), "utf8")));
  const coverage: Record<string, number> = {};
  for (const b of briefs) {
    if (NEVER.has(b.id) || GAPS.has(b.id)) continue;
    if (!b.arc?.months) continue;
    const u = await prisma.user.findUnique({ where: { email: b.identity.email } });
    const lens = u
      ? await prisma.lensResult.findUnique({ where: { userId_lens: { userId: u.id, lens: "SPIRAL" } } })
      : null;
    const score = lens?.result as { centerOfGravity?: string; weights?: { stage: string }[] } | null;
    check(
      `${b.id}: approved blend (${score?.centerOfGravity ?? "—"})`,
      Boolean(lens?.practitionerReviewed && score?.centerOfGravity),
    );
    for (const w of score?.weights?.slice(0, 2) ?? []) coverage[w.stage] = (coverage[w.stage] ?? 0) + 1;
  }
  const allStages = ["grounding", "belonging", "drive", "order", "achievement", "harmony", "flow"];
  check(
    "every stage appears at least twice (top-2 across the roster)",
    allStages.every((s) => (coverage[s] ?? 0) >= 2),
    JSON.stringify(coverage),
  );

  // ---- §2: the three gap states, distinct ----
  log(`\n## §2 · The deliberate gaps stay deliberate`);
  const byEmail = async (id: string) =>
    (await prisma.user.findUnique({ where: { email: `${id}@fixture.test` } }))!;
  const tomas = await byEmail("tomas");
  const ben = await byEmail("ben");
  const marcos = await byEmail("marcos");
  const spiralLens = (uid: string) =>
    prisma.lensResult.findUnique({ where: { userId_lens: { userId: uid, lens: "SPIRAL" } } });
  const pendingAssign = (uid: string) =>
    prisma.worksheetAssignment.findFirst({
      where: { clientId: uid, status: "PENDING", worksheet: { isSpiral: true } },
    });

  check("Tomás: absent — no lens, no assignment, ever", !(await spiralLens(tomas.id)) && !(await pendingAssign(tomas.id)));
  check("Ben: sent · awaiting — pending assignment, no lens", Boolean(await pendingAssign(ben.id)) && !(await spiralLens(ben.id)));
  const mLens = await spiralLens(marcos.id);
  check("Marcos: answered · awaiting her approval", Boolean(mLens) && mLens!.practitionerReviewed === false);

  // ---- §3 post: the stale chip fires, refresh folds the spiral in ----
  log(`\n## §3 · Stale chip → refresh`);
  const { artifactStaleness } = await import("../../lib/staleness");
  const midProfile = await prisma.integrativeProfile.findUnique({ where: { userId: maria.id } });
  const staleness = await artifactStaleness(
    maria.id,
    (midProfile?.fingerprint as never) ?? null,
    midProfile?.generatedAt ?? new Date(),
    { watchRecord: true, watchMethod: true },
  );
  check("stale chip fires after the spiral seeds", staleness.stale, staleness.reasons.join("; "));
  check(
    "the reason names the values lens",
    staleness.reasons.some((r) => /values|lens/i.test(r)),
    staleness.reasons.join("; "),
  );
  const post = await runIntegrativeSynthesis(maria.id, pw.id);
  check("refresh regenerates", post.ok, post.ok ? "" : post.error);
  const postProfile = await prisma.integrativeProfile.findUnique({ where: { userId: maria.id } });
  const postFp = postProfile?.fingerprint as { lenses?: string[] } | null;
  check("refreshed fingerprint includes SPIRAL", Boolean(postFp?.lenses?.includes("SPIRAL")), JSON.stringify(postFp?.lenses));

  // ---- §4: readings regenerate with the values lens; language law holds ----
  log(`\n## §4 · Readings + language law (en + es)`);
  const { ensureReading, assembleCharts } = await import("../../lib/integrative-reading");
  const { lintReadingLanguage } = await import("../../ai/integrativeReadingPrompt");
  const elena = await byEmail("elena");

  for (const [who, uid, locale] of [
    ["maria", maria.id, "en"],
    ["elena", elena.id, "es"],
  ] as const) {
    const charts = await assembleCharts(uid);
    check(`${who}: assembled payload now carries the values spiral`, Boolean(charts?.payload.valuesSpiral));
    const res = await ensureReading(uid, { force: true });
    check(`${who}: reading regenerates (${locale})`, res.ok, res.ok ? "" : res.error);
    const reading = await prisma.integrativeReading.findUnique({ where: { userId: uid } });
    const structured = reading?.structured as never;
    const hits = structured ? lintReadingLanguage(structured) : ["no structured reading"];
    check(`${who}: language law holds — 0 lint hits`, hits.length === 0, hits.slice(0, 3).join("; "));
    const center = (
      (await spiralLens(uid))?.result as { centerOfGravity?: string } | null
    )?.centerOfGravity;
    log(`  · ${who} center=${center} · reading ${reading?.content.length ?? 0} chars · status ${reading?.status}`);
  }

  log(`\n${failed === 0 ? "ALL CHECKS PASS" : `${failed} CHECK(S) FAILED`}`);
  mkdirSync(join(__dirname, "../../audits/fixtures-values"), { recursive: true });
  writeFileSync(join(__dirname, "../../audits/fixtures-values/VERIFY-LOG.md"), report.join("\n") + "\n");
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
