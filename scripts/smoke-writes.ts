import { prisma } from "../lib/prisma";
import { ensureChart } from "../lib/human-design";

// WRITE-PATH SMOKE — the standing mutation gate. The GET smoke walks pages as
// a browser would but never mutates, so a write-path regression (like the
// scoped-client $transaction array-form bug, live in prod and invisible to
// GET smoke) can slip through. This suite drives REAL mutations through the
// tenant-scoped client — both $transaction forms and each major writer
// category — and fails on any error. Self-cleaning.
//
//   npm run build   (not required — this exercises the service layer directly)
//   DATABASE_URL=postgresql://postgres@localhost:5433/<scratch> npm run smoke:writes
//
// Runs alongside `npm run smoke` on every commit.

const results: { name: string; pass: boolean; note?: string }[] = [];
function check(name: string, pass: boolean, note?: string) {
  results.push({ name, pass, note });
  console.log(`- ${pass ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
}
async function guarded(name: string, fn: () => Promise<boolean>) {
  try {
    check(name, await fn());
  } catch (e) {
    check(name, false, e instanceof Error ? e.message : "threw");
  }
}

const PRACT_EMAIL = "smoke-writes-pract@fixture.test";
const CLIENT_EMAIL = "smoke-writes-client@fixture.test";

async function cleanup() {
  for (const email of [PRACT_EMAIL, CLIENT_EMAIL]) {
    const u = await prisma.user.findUnique({ where: { email } }).catch(() => null);
    if (!u) continue;
    await prisma.psycheEdge.deleteMany({ where: { clientId: u.id } }).catch(() => {});
    await prisma.psycheNode.deleteMany({ where: { clientId: u.id } }).catch(() => {});
    await prisma.lensResult.deleteMany({ where: { userId: u.id } }).catch(() => {});
    await prisma.birthChartCore.deleteMany({ where: { userId: u.id } }).catch(() => {});
    await prisma.humanDesignChart.deleteMany({ where: { userId: u.id } }).catch(() => {});
    await prisma.note.deleteMany({ where: { OR: [{ clientId: u.id }, { authorId: u.id }] } }).catch(() => {});
    await prisma.recordItem.deleteMany({ where: { clientId: u.id } }).catch(() => {});
    await prisma.prompt.deleteMany({ where: { createdById: u.id } }).catch(() => {});
    await prisma.charge.deleteMany({ where: { clientId: u.id } }).catch(() => {});
    await prisma.clientProfile.deleteMany({ where: { userId: u.id } }).catch(() => {});
    await prisma.user.delete({ where: { id: u.id } }).catch(() => {});
  }
}

async function main() {
  const dbUrl = process.env.DATABASE_URL ?? "";
  if (!dbUrl) throw new Error("DATABASE_URL required (a seeded scratch/staging copy — never production).");
  if (/prod/i.test(new URL(dbUrl).host) || /railway|rlwy\.net/.test(dbUrl)) throw new Error("REFUSING: write smoke never runs against production.");
  const n = await prisma.user.count().catch(() => -1);
  if (n < 0) throw new Error("Database unreachable — is scratch Postgres running?");

  await cleanup();
  const pract = await prisma.user.create({ data: { email: PRACT_EMAIL, name: "Smoke Pract", role: "PRACTITIONER", active: true, passwordHash: "x" } });
  const client = await prisma.user.create({ data: { email: CLIENT_EMAIL, name: "Smoke Client", role: "CLIENT", active: true, passwordHash: "x" } });

  try {
    // 1 — single create (the most common writer): a note.
    await guarded("single create — note.create", async () => {
      const note = await prisma.note.create({ data: { authorId: pract.id, clientId: client.id, depth: "NOTE", title: "smoke", body: "smoke body", tags: ["smoke"] } });
      return Boolean(note.id);
    });

    // 2 — single update: profile upsert (birth data, for the chart writer next).
    await guarded("single upsert — clientProfile", async () => {
      const p = await prisma.clientProfile.upsert({
        where: { userId: client.id },
        create: { userId: client.id, birthDate: new Date("1988-06-15T00:00:00Z"), birthTime: "14:30", birthPlace: "Austin, Texas, USA", birthLat: 30.2672, birthLng: -97.7431, birthTz: "America/Chicago" },
        update: {},
      });
      return Boolean(p.id);
    });

    // 3 — ARRAY-FORM $transaction (deleteMany + delete): the exact shape the
    //     library/course/notes actions use. This is what the prod bug broke.
    await guarded("array $transaction — deleteMany + delete", async () => {
      const prompt = await prisma.prompt.create({ data: { title: "smoke prompt", body: "b", createdById: pract.id } });
      await prisma.$transaction([
        prisma.recordItem.deleteMany({ where: { sourceType: "PromptResponse", sourceId: "smoke-none" } }),
        prisma.prompt.delete({ where: { id: prompt.id } }),
      ]);
      return (await prisma.prompt.count({ where: { id: prompt.id } })) === 0;
    });

    // 4 — ARRAY-FORM $transaction (upserts): ensureChart writes birthChartCore
    //     + two lens upserts in one array transaction — the path that failed
    //     silently on profile save / design render.
    await guarded("array $transaction — ensureChart (upserts)", async () => {
      const profile = await prisma.clientProfile.findUnique({ where: { userId: client.id } });
      const ok = await ensureChart(profile as never);
      return ok && (await prisma.humanDesignChart.count({ where: { userId: client.id } })) === 1;
    });

    // 5 — FUNCTION-FORM $transaction: the money-critical shape (packages/credits).
    //     Different code path from the array form — must also stay green.
    await guarded("function $transaction — atomic multi-write", async () => {
      const [charge] = await prisma.$transaction(async (tx) => {
        const c = await tx.charge.create({ data: { clientId: client.id, description: "smoke charge", amountCents: 100 } });
        await tx.charge.update({ where: { id: c.id }, data: { status: "PAID", paidAt: new Date() } });
        return [c];
      });
      const fresh = await prisma.charge.findUnique({ where: { id: charge.id } });
      return fresh?.status === "PAID";
    });

    // 6 — a billing single-write path (markChargePaid shape).
    await guarded("billing write — charge create + update", async () => {
      const c = await prisma.charge.create({ data: { clientId: client.id, description: "smoke charge 2", amountCents: 200 } });
      await prisma.charge.update({ where: { id: c.id }, data: { status: "WAIVED", lastActionById: pract.id } });
      return (await prisma.charge.findUnique({ where: { id: c.id } }))?.status === "WAIVED";
    });
  } finally {
    await cleanup();
    console.log("~ write-smoke rows removed");
  }

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${failed === 0 ? "WRITE SMOKE PASS — every mutation path works" : `${failed} WRITE PATH(S) BROKE`}`);
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); })
  .finally(() => void prisma.$disconnect());
