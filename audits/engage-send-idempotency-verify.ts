/* eslint-disable @typescript-eslint/no-explicit-any */
import { AsyncLocalStorage } from "async_hooks";
(globalThis as any).AsyncLocalStorage ??= AsyncLocalStorage;

// ENGAGE SEND IDEMPOTENCY — does an opened gate send the same message twice?
//
// WHY THIS EXISTS, and it is ruling 135's shape on a money-adjacent surface.
// The gate-open path has NEVER run in production — not once, in any prospect's
// lifetime. 299 engage decisions exist and every one is `engine-gate-closed`.
// So the behaviour that matters most — what happens when Jacob opens the gate
// with ~40 founding partners in the audience — is unverified BY DEFINITION, and
// no gate covered it. A step that re-sends every tick is forty people receiving
// the same email every fifteen minutes.
//
// WHAT IT PROVES, and the order matters:
//   1. NEGATIVE CONTROL FIRST, gate CLOSED: two ticks both re-decide the same
//      step and each writes another audit row. This proves the harness really
//      drives ticks and can DETECT a repeat — without it, "the second tick sent
//      nothing" would be indistinguishable from a harness that does nothing
//      (ruling 110). It also measures ruling 149's growth mechanism directly.
//   2. Gate OPEN: tick 1 sends exactly once.
//   3. Tick 2, same prospect: the transport is not called again, and no new
//      audit row appears for that step.
//   4. The +7 step behaves the same way once its date arrives.
//   5. THE STATE IS READ, NOT DECORATIVE: flip the ledger row back off-terminal
//      and the next tick sends again. A verdict recorded for audit but never
//      consulted is not idempotency; this is the difference, observed.
//
// Self-cleaning: one throwaway prospect, removed first and last.
//   DATABASE_URL=...scratch npx tsx audits/engage-send-idempotency-verify.ts

const EMAIL = "engage-idem@fixture.test";
const DAY = 86_400_000;

const report: string[] = [];
let failed = 0;
const log = (s: string) => { report.push(s); console.log(s); };
const check = (name: string, ok: boolean, note = "") => {
  if (!ok) failed++;
  log(`- ${ok ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
};

async function main() {
  const url = process.env.DATABASE_URL ?? "";
  if (!url) throw new Error("DATABASE_URL required (scratch copy)");
  if (/railway|rlwy\.net/.test(url)) throw new Error("Refusing to run against a Railway database");

  const { rawPrisma } = await import("../lib/prisma-internal");
  const { engageTick } = await import("../lib/engage");

  const cleanup = async () => {
    const p = await rawPrisma.practitionerProspect.findUnique({ where: { email: EMAIL }, select: { id: true } });
    if (p) {
      await rawPrisma.prospectMessage.deleteMany({ where: { prospectId: p.id } }).catch(() => {});
      await rawPrisma.auditEvent.deleteMany({ where: { actorId: p.id } }).catch(() => {});
      await rawPrisma.practitionerProspect.delete({ where: { id: p.id } }).catch(() => {});
    }
  };
  await cleanup();

  // The platform identity, complete — engage requires the postal address for
  // commercial mail (ruling 141), so without it every step is UNCONFIGURED and
  // this gate would prove nothing about sending.
  process.env.PLATFORM_RESEND_API_KEY = "idem-platform-key";
  process.env.PLATFORM_FROM_EMAIL = "Psychefolio <notifications@idem.test>";
  process.env.PLATFORM_LEGAL_ENTITY = "Idem Entity, LLC";
  process.env.PLATFORM_POSTAL_ADDRESS = "1 Idem Way, Testville FL 00000";
  delete process.env.ENGAGE_PAUSED;

  const anchor = new Date(Date.now() - DAY); // converted yesterday: welcome(+0) is due, check-in(+7) is not
  const prospect = await rawPrisma.practitionerProspect.create({
    data: { email: EMAIL, name: "Idem Probe", status: "SIGNED_UP", source: "web", referralCode: "IDEMPRB1", convertedAt: anchor, createdAt: anchor },
    select: { id: true },
  });

  const sent: string[] = [];
  const transport: any = async (args: any) => { sent.push(String(args.to)); return { ok: true }; };
  const auditCount = async () =>
    rawPrisma.auditEvent.count({ where: { actorId: prospect.id, action: "engage-message" } });

  try {
    log(`# ENGAGE SEND IDEMPOTENCY — ${new Date().toISOString()}`);

    // ---- 1. NEGATIVE CONTROL: gate CLOSED, two ticks, rows GROW ----
    log(`\n## 1 — negative control (gate CLOSED): the harness can detect a repeat`);
    delete process.env.ENGAGE_ENABLED;
    const beforeClosed = await auditCount();
    const c1 = await engageTick({ send: transport });
    const afterFirst = await auditCount();
    const c2 = await engageTick({ send: transport });
    const afterSecond = await auditCount();
    check(
      "gate closed: both ticks re-decide the same step and each writes ANOTHER audit row (ruling 149's mechanism, measured)",
      afterFirst === beforeClosed + 1 && afterSecond === afterFirst + 1,
      `rows ${beforeClosed} → ${afterFirst} → ${afterSecond} · skipped ${c1.counts.SKIPPED}/${c2.counts.SKIPPED}`,
    );
    check("and nothing was sent while the gate was closed", sent.length === 0, `${sent.length} send(s)`);

    // ---- 2 + 3. gate OPEN: sends once, then never again ----
    log(`\n## 2 — gate OPEN: the first tick sends exactly once`);
    process.env.ENGAGE_ENABLED = "1";
    const openBefore = await auditCount();
    const t1 = await engageTick({ send: transport });
    check("tick 1 records a SENT decision", t1.counts.SENT === 1, JSON.stringify(t1.counts));
    check("and the transport was called exactly once", sent.length === 1, `${sent.length} send(s) → ${sent[0] ?? "none"}`);

    log(`\n## 3 — THE QUESTION: the next tick, same prospect, same step`);
    const t2 = await engageTick({ send: transport });
    check(
      "tick 2 does NOT send again — the transport is untouched",
      sent.length === 1,
      `${sent.length} total send(s) after two ticks`,
    );
    check("tick 2 records no SENT decision", t2.counts.SENT === 0, JSON.stringify(t2.counts));
    check(
      "and writes NO further audit row for that step — a terminal step stops being re-decided",
      (await auditCount()) === openBefore + 1,
      `rows ${openBefore} → ${await auditCount()}`,
    );
    const rows = await rawPrisma.prospectMessage.findMany({
      where: { prospectId: prospect.id },
      select: { sequenceKey: true, stepKey: true, status: true, sentAt: true },
    });
    const welcome = rows.find((r) => r.stepKey === "welcome");
    check(
      "the ledger row is SENT with sentAt set, and there is exactly ONE per (prospect, sequence, step)",
      welcome?.status === "SENT" && welcome.sentAt !== null && rows.filter((r) => r.stepKey === "welcome").length === 1,
      `status=${welcome?.status} sentAt=${welcome?.sentAt ? "set" : "null"} rows=${rows.length}`,
    );

    // ---- 4. the +7 step ----
    log(`\n## 4 — the +7 step fires once when its date arrives, not every tick`);
    const later = new Date(Date.now() + 8 * DAY);
    const t3 = await engageTick({ send: transport, asOf: later });
    const t4 = await engageTick({ send: transport, asOf: new Date(later.getTime() + 15 * 60_000) });
    check(
      "check-in sends on the first tick after it is due, and NOT on the next",
      t3.counts.SENT === 1 && t4.counts.SENT === 0 && sent.length === 2,
      `t3=${t3.counts.SENT} t4=${t4.counts.SENT} · total sends ${sent.length}`,
    );

    // ---- 5. the state is READ, not decorative ----
    log(`\n## 5 — the ledger is CONSULTED, not merely recorded`);
    await rawPrisma.prospectMessage.updateMany({
      where: { prospectId: prospect.id, stepKey: "welcome" },
      data: { status: "SKIPPED", sentAt: null },
    });
    const t5 = await engageTick({ send: transport });
    check(
      "flipping the ledger row off-terminal makes the SAME step send again — so the engine really reads it",
      t5.counts.SENT === 1 && sent.length === 3,
      `sends ${sent.length} · ${JSON.stringify(t5.counts)}`,
    );
  } finally {
    delete process.env.ENGAGE_ENABLED;
    await cleanup();
    console.log("~ probe prospect, ledger and audit rows removed");
  }

  log(`\n${failed === 0 ? "ALL CHECKS PASS" : `${failed} CHECK(S) FAILED`}`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => { console.error("gate error:", e?.stack ?? e); process.exit(1); });
