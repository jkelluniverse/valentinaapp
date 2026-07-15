import { PrismaClient } from "@prisma/client";

// FIXTURES-SPEC §10 — post-seed/extraction verification. Reports the checks that
// can be evaluated from DB state (the AI-behaviour ones — Tom's restraint,
// Spanish extraction — are judged from what the REAL extractor produced).
const prisma = new PrismaClient();
const FT = { email: { endsWith: "@fixture.test" } } as const;

async function main() {
  const line = (s: string) => console.log(s);
  line("=== FIXTURE VERIFICATION (§10) ===\n");

  // 1. lifecycle: active / pending / deactivated
  const active = await prisma.user.count({ where: { role: "CLIENT", active: true, ...FT } });
  const deactivated = await prisma.user.count({ where: { role: "CLIENT", active: false, ...FT } });
  const pending = await prisma.invite.count({ where: { status: "PENDING", ...FT } });
  line(`1. lifecycle — active=${active} (want 15), pending invite=${pending} (want 1), deactivated=${deactivated} (want 1)`);

  // 6/7. per-client extracted nodes (AI) — Tom's restraint + spread
  const clients = await prisma.user.findMany({ where: { role: "CLIENT", ...FT }, select: { id: true, name: true, active: true }, orderBy: { name: "asc" } });
  line(`\n6/7. extracted nodes per client (AI_EXTRACTED) — Tomás should be FEW & well-evidenced:`);
  for (const c of clients) {
    const ai = await prisma.psycheNode.findMany({ where: { clientId: c.id, source: "AI_EXTRACTED" }, select: { label: true, evidenceRecordItemIds: true, state: true } });
    const self = await prisma.psycheNode.count({ where: { clientId: c.id, source: "SELF_REPORTED" } });
    const items = await prisma.recordItem.count({ where: { clientId: c.id } });
    const avgEv = ai.length ? (ai.reduce((a, n) => a + n.evidenceRecordItemIds.length, 0) / ai.length).toFixed(1) : "—";
    const tag = c.name.startsWith("Tom") ? "  ← THIN-DATA restraint" : "";
    line(`   ${c.name.padEnd(20)} items=${String(items).padStart(3)}  self=${self}  ai=${ai.length}  avgEvidence=${avgEv}${tag}`);
  }

  // 4. states: LOOSENING / INTEGRATED present?
  const loosening = await prisma.psycheNode.findMany({ where: { state: "LOOSENING", client: FT }, select: { label: true, client: { select: { name: true } } } });
  const integrated = await prisma.psycheNode.findMany({ where: { state: "INTEGRATED", client: FT }, select: { label: true, giftLabel: true, client: { select: { name: true } } } });
  line(`\n4. LOOSENING nodes: ${loosening.map((n) => `${n.client.name}:${n.label}`).join(", ") || "(none — states may need curation, not just extraction)"}`);
  line(`   INTEGRATED nodes: ${integrated.map((n) => `${n.client.name}:${n.label}${n.giftLabel ? ` (gift:${n.giftLabel})` : ""}`).join(", ") || "(none yet)"}`);

  // 5. awareness gap: Caro self vs extracted
  const caro = clients.find((c) => c.name.startsWith("Caro"));
  if (caro) {
    const s = await prisma.psycheNode.count({ where: { clientId: caro.id, source: "SELF_REPORTED" } });
    const a = await prisma.psycheNode.count({ where: { clientId: caro.id, source: "AI_EXTRACTED" } });
    line(`\n5. awareness gap (Caro): self-named=${s}  vs  extracted=${a}  → gap ${a > s ? "WIDE ✓" : "narrow"}`);
  }

  // 8. crisis (Nelson): flagged message present
  const crisis = await prisma.message.count({ where: { safetyFlag: true, conversation: { client: FT } } });
  line(`\n8. crisis messages flagged (Nelson): ${crisis} (want ≥1)`);

  // 9. Spanish/code-switch extraction (Elena, Rosa): did extraction produce nodes from Spanish text?
  for (const name of ["Elena", "Rosa"]) {
    const c = clients.find((x) => x.name.startsWith(name));
    if (c) {
      const a = await prisma.psycheNode.count({ where: { clientId: c.id, source: "AI_EXTRACTED" } });
      line(`9. Spanish/code-switch extraction (${name}): ${a} nodes extracted ${a > 0 ? "✓" : "✗"}`);
    }
  }

  // 6. Pattern Library k-floor over the REAL roster (labels as extracted)
  line(`\n6. Pattern Library (real roster) — run \`npm run fixtures:map\` then check /practitioner/patterns; deterministic floor already proven by fixtures:verify:kfloor.`);

  line("\n=== end ===");
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
