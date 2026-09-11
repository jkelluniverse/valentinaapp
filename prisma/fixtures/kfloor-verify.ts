import { PrismaClient } from "@prisma/client";
import { aggregatePatterns, PATTERN_LIBRARY_KEY, K_FLOOR } from "../../lib/pattern-library";
import { DEFAULT_TENANT_ID } from "../../lib/tenancy/scope";

// FIXTURES-SPEC §4 / §10.6 — the Pattern-Library k-floor test. Seeds distinct
// fixture clients carrying the archetype matrix, runs the REAL aggregation
// (lib/pattern-library.ts), and asserts the floor suppresses under-k patterns.
// This exercises the deterministic aggregation only — it does not stand in for
// the AI extraction (§9), which must run separately with an API key.
//
// Run against an ISOLATED database (its own aggregate should see only these
// nodes): SEED_ENV=staging DATABASE_URL=...veritas_kfloor npx tsx prisma/fixtures/kfloor-verify.ts

const prisma = new PrismaClient();

// archetype label → how many DISTINCT clients carry it (the §4 matrix).
const MATRIX: { label: string; clients: number; expectUsable: boolean }[] = [
  { label: "Not enough as I am", clients: 6, expectUsable: true }, // ≥ k
  { label: "Unsafe to be seen", clients: 5, expectUsable: true }, // exactly k
  { label: "I must not need", clients: 5, expectUsable: true }, // exactly k
  { label: "Abandonment", clients: 4, expectUsable: false }, // below k → SUPPRESSED
  { label: "I am too much", clients: 3, expectUsable: false }, // below k → SUPPRESSED
];

async function main() {
  if (process.env.SEED_ENV !== "staging") throw new Error("Refusing to run outside SEED_ENV=staging");
  const host = new URL(process.env.DATABASE_URL ?? "postgres://x/x").host;
  if (/prod/i.test(host)) throw new Error(`Refusing: DATABASE_URL host looks production (${host})`);

  const maxClients = Math.max(...MATRIX.map((m) => m.clients));
  const clientIds: string[] = [];
  for (let i = 1; i <= maxClients; i++) {
    const u = await prisma.user.upsert({
      where: { email: `kfloor-c${i}@fixture.test` },
      update: {},
      create: { email: `kfloor-c${i}@fixture.test`, name: `K-floor Client ${i}`, role: "CLIENT", active: true, passwordHash: "x" },
    });
    clientIds.push(u.id);
    // clean slate for a stable re-run
    await prisma.psycheNode.deleteMany({ where: { clientId: u.id } });
  }

  // Each archetype gets one node per assigned client — same kind + label so the
  // aggregation groups them (key = kind:norm(label)).
  for (const m of MATRIX) {
    for (let i = 0; i < m.clients; i++) {
      await prisma.psycheNode.create({
        data: { clientId: clientIds[i], kind: "CORE_BELIEF" as never, label: m.label, source: "SELF_REPORTED" },
      });
    }
  }

  await prisma.practiceSetting.upsert({
    where: { tenantId_key: { tenantId: DEFAULT_TENANT_ID, key: PATTERN_LIBRARY_KEY } },
    update: { value: "true" },
    create: { tenantId: DEFAULT_TENANT_ID, key: PATTERN_LIBRARY_KEY, value: "true" },
  });

  const result = await aggregatePatterns();
  if (!result.ok) throw new Error(`aggregate failed: ${result.error}`);

  const rows = await prisma.patternArchetype.findMany({ select: { label: true, clientCount: true } });
  const byLabel = new Map(rows.map((r) => [r.label, r.clientCount]));

  console.log(`\n=== k-floor verification (K_FLOOR = ${K_FLOOR}) ===`);
  let pass = true;
  for (const m of MATRIX) {
    const count = byLabel.get(m.label) ?? 0;
    const usable = count >= K_FLOOR;
    const ok = usable === m.expectUsable && count === m.clients;
    pass = pass && ok;
    console.log(
      `${ok ? "✓" : "✗"} ${m.label.padEnd(22)} clients=${count} ${usable ? "USABLE" : "suppressed"} ` +
        `(expected ${m.expectUsable ? "USABLE" : "suppressed"}, count ${m.clients})`,
    );
  }
  console.log(`usable(k>=${K_FLOOR}) = ${result.usable} (expected 3)`);
  const usableOk = result.usable === 3;
  pass = pass && usableOk;

  // The two below-k archetypes must NOT be usable — the red-zone check.
  const leak = MATRIX.filter((m) => !m.expectUsable && (byLabel.get(m.label) ?? 0) >= K_FLOOR);
  if (leak.length) {
    pass = false;
    console.log(`✗ RED ZONE: below-k archetype(s) reached the library: ${leak.map((l) => l.label).join(", ")}`);
  } else {
    console.log("✓ no below-k archetype reached the usable library (abandonment=4, too-much=3 suppressed)");
  }

  console.log(pass ? "\nK-FLOOR VERIFICATION PASSED\n" : "\nK-FLOOR VERIFICATION FAILED\n");
  if (!pass) process.exitCode = 1;
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
