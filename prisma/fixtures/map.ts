import { PrismaClient } from "@prisma/client";
import { runPsycheExtraction } from "../../lib/psyche-extract";

// FIXTURES-SPEC §9 — runs the REAL C16 extractor over the seeded roster. The
// Constellation is built by the actual pipeline, never fabricated. Deep pass so
// slow arcs (James's 18 months) are caught. Staging-guarded; needs an API key.
//   SEED_ENV=staging ANTHROPIC_API_KEY=... DATABASE_URL=...staging npx tsx prisma/fixtures/map.ts

const prisma = new PrismaClient();

async function main() {
  if (process.env.SEED_ENV !== "staging") throw new Error("REFUSING: set SEED_ENV=staging.");
  const host = new URL(process.env.DATABASE_URL ?? "postgres://x/x").host;
  if (/prod/i.test(host)) throw new Error(`REFUSING: DATABASE_URL host looks production (${host}).`);
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY required to run the real extractor.");

  const pract = await prisma.user.findFirst({ where: { role: "PRACTITIONER", email: "valentina@fixture.test" } });
  if (!pract) throw new Error("Seed first — no fixture practitioner found.");

  // active fixture clients that actually have record material to read
  const clients = await prisma.user.findMany({
    where: { role: "CLIENT", active: true, email: { endsWith: "@fixture.test" } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  console.log(`=== running real C16 extraction over ${clients.length} active fixture clients ===\n`);
  for (const c of clients) {
    const items = await prisma.recordItem.count({ where: { clientId: c.id } });
    if (items === 0) { console.log(`- ${c.name.padEnd(20)} skip (no record items)`); continue; }
    process.stdout.write(`~ ${c.name.padEnd(20)} items=${String(items).padStart(3)} … `);
    try {
      const r = await runPsycheExtraction(c.id, pract.id, { deep: true });
      if (r.ok) console.log(`created=${r.created} updated=${r.updated} edges=${r.edges} referral=${r.referral}`);
      else console.log(`no-op (${r.error})`);
    } catch (e) {
      console.log(`ERROR ${e instanceof Error ? e.message.slice(0, 120) : ""}`);
    }
  }
  console.log("\nextraction complete.");
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
