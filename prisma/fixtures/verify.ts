import { PrismaClient } from "@prisma/client";

// FIXTURES-SPEC §10 — post-seed/extraction verification from DB state. The
// AI-behaviour checks (Tomás's restraint, Spanish extraction) are judged from
// what the REAL extractor produced.
const prisma = new PrismaClient();

async function main() {
  const log = (s: string) => console.log(s);
  log("=== FIXTURE VERIFICATION (§10) ===\n");

  const roster = await prisma.user.findMany({
    where: { role: "CLIENT", email: { endsWith: "@fixture.test" } },
    select: { id: true, name: true, active: true },
    orderBy: { name: "asc" },
  });
  const nameOf = new Map(roster.map((c) => [c.id, c.name ?? c.id]));
  const fixtureIds = roster.map((c) => c.id);

  // 1. lifecycle
  const active = roster.filter((c) => c.active).length;
  const deactivated = roster.filter((c) => !c.active).length;
  const pending = await prisma.invite.count({ where: { status: "PENDING", email: { endsWith: "@fixture.test" } } });
  log(`1. lifecycle — active=${active} (want 15), pending invite=${pending} (want 1), deactivated=${deactivated} (want 1)`);

  // 6/7. extracted nodes per client — Tomás should be FEW & well-evidenced
  log(`\n6/7. nodes per client (self / AI-extracted) — Tomás should be THIN:`);
  for (const c of roster) {
    const ai = await prisma.psycheNode.findMany({ where: { clientId: c.id, source: "AI_EXTRACTED" }, select: { evidenceRecordItemIds: true } });
    const self = await prisma.psycheNode.count({ where: { clientId: c.id, source: "SELF_REPORTED" } });
    const items = await prisma.recordItem.count({ where: { clientId: c.id } });
    const avgEv = ai.length ? (ai.reduce((a, n) => a + n.evidenceRecordItemIds.length, 0) / ai.length).toFixed(1) : "—";
    const tag = (c.name ?? "").startsWith("Tom") ? "  ← THIN-DATA restraint" : "";
    log(`   ${(c.name ?? c.id).padEnd(20)} items=${String(items).padStart(3)}  self=${self}  ai=${ai.length}  avgEvidence=${avgEv}${tag}`);
  }

  // 4. states
  const loosening = await prisma.psycheNode.findMany({ where: { clientId: { in: fixtureIds }, state: "LOOSENING" }, select: { clientId: true, label: true } });
  const integrated = await prisma.psycheNode.findMany({ where: { clientId: { in: fixtureIds }, state: "INTEGRATED" }, select: { clientId: true, label: true, giftLabel: true } });
  log(`\n4. LOOSENING: ${loosening.map((n) => `${nameOf.get(n.clientId)}:${n.label}`).join(", ") || "(none — states may need curation beyond extraction)"}`);
  log(`   INTEGRATED: ${integrated.map((n) => `${nameOf.get(n.clientId)}:${n.label}${n.giftLabel ? ` (gift:${n.giftLabel})` : ""}`).join(", ") || "(none yet)"}`);

  // 5. awareness gap (Caro)
  const caro = roster.find((c) => (c.name ?? "").startsWith("Caro"));
  if (caro) {
    const s = await prisma.psycheNode.count({ where: { clientId: caro.id, source: "SELF_REPORTED" } });
    const a = await prisma.psycheNode.count({ where: { clientId: caro.id, source: "AI_EXTRACTED" } });
    log(`\n5. awareness gap (Caro): self-named=${s} vs extracted=${a} → ${a > s ? "WIDE ✓" : "narrow"}`);
  }

  // 8. crisis (Nelson)
  const crisis = await prisma.message.count({ where: { safetyFlag: true, conversation: { clientId: { in: fixtureIds } } } });
  log(`\n8. crisis messages flagged: ${crisis} (want ≥1)`);

  // 9. Spanish / code-switch extraction
  for (const nm of ["Elena", "Rosa"]) {
    const c = roster.find((x) => (x.name ?? "").startsWith(nm));
    if (c) {
      const a = await prisma.psycheNode.count({ where: { clientId: c.id, source: "AI_EXTRACTED" } });
      log(`9. Spanish/code-switch (${nm}): ${a} nodes extracted ${a > 0 ? "✓" : "✗"}`);
    }
  }

  log(`\n6b. Pattern-Library floor already proven deterministically via fixtures:verify:kfloor.`);
  log("\n=== end ===");
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
