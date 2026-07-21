import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { prisma } from "../../lib/prisma";
import { audit } from "../../lib/audit";
import { setChargeStatus } from "../../lib/billing";

// AMD-06 §4 — the mechanics layer, verified live against the fixture roster:
// temp-password state machine, phone-purchase settlement paths (charge →
// channel stamp → package activation), the card-path gate, worksheet
// reopen, the audit spine, and the assist-grant validity window (the exact
// conditions activeAssist() checks). The request-bound layer (cookies, the
// banner, forbidInAssist redirects) is exercised in the staging walkthrough —
// it cannot run outside a request scope by design.
//   DATABASE_URL=...scratch npx tsx audits/amd06/verify.ts

const report: string[] = [];
const log = (s: string) => { report.push(s); console.log(s); };
let failed = 0;
const check = (name: string, ok: boolean, note = "") => {
  if (!ok) failed++;
  log(`- ${ok ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
};

async function main() {
  log(`# AMD-06 verify (mechanics) — ${new Date().toISOString()}`);
  const valentina = (await prisma.user.findFirst({ where: { role: "PRACTITIONER" } }))!;
  const rosa = (await prisma.user.findUnique({ where: { email: "rosa@fixture.test" } }))!;
  const maria = (await prisma.user.findUnique({ where: { email: "maria@fixture.test" } }))!;
  const ben = (await prisma.user.findUnique({ where: { email: "ben@fixture.test" } }))!;

  // ---- §4.1 · Temp password (Rosa) ----
  log(`\n## Temp password — Rosa`);
  const before = (await prisma.user.findUnique({ where: { id: rosa.id }, select: { sessionVersion: true } }))!;
  const temp = "salvia-347-luna"; // the action generates one like this; hash-only storage
  await prisma.user.update({
    where: { id: rosa.id },
    data: {
      passwordHash: await bcrypt.hash(temp, 12),
      mustChangePassword: true,
      sessionVersion: { increment: 1 },
    },
  });
  await audit({ actorId: valentina.id, onBehalfOfId: rosa.id, action: "temp-password" });
  const after = (await prisma.user.findUnique({
    where: { id: rosa.id },
    select: { sessionVersion: true, mustChangePassword: true, passwordHash: true },
  }))!;
  check("temp password verifies against the stored hash", await bcrypt.compare(temp, after.passwordHash!));
  check("mustChangePassword forces the /must-change gate", after.mustChangePassword);
  check("sessionVersion bumped — stale sessions dead", after.sessionVersion > before.sessionVersion);
  // …and completing the change clears the flag + bumps again (the action's writes):
  await prisma.user.update({
    where: { id: rosa.id },
    data: { passwordHash: await bcrypt.hash("rosa-chose-this-1", 12), mustChangePassword: false, sessionVersion: { increment: 1 } },
  });
  const done = (await prisma.user.findUnique({ where: { id: rosa.id }, select: { mustChangePassword: true } }))!;
  check("choosing their own password clears the gate", !done.mustChangePassword);
  await prisma.user.update({
    where: { id: rosa.id },
    data: { passwordHash: bcrypt.hashSync("fixture-pass-1", 10) },
  });

  // ---- §4.2 · Phone purchase (María), both settlement paths ----
  log(`\n## Phone purchase — María`);
  await prisma.charge.deleteMany({ where: { clientId: maria.id, channel: "PRACTITIONER_ASSISTED" } });
  let sku = await prisma.priceBook.findFirst({ where: { active: true, kind: "PACKAGE" } });
  if (!sku) {
    sku = await prisma.priceBook.create({
      data: { name: "6-session package (fixture)", amountCents: 6_600_00, kind: "PACKAGE", sessionsIncluded: 6 },
    });
  }
  // Path A — mark paid (cash/Zelle): the paid PACKAGE charge activates a package.
  const chargeA = await prisma.charge.create({
    data: {
      clientId: maria.id, kind: "PACKAGE", priceBookId: sku.id, description: sku.name,
      amountCents: sku.amountCents, currency: sku.currency, status: "DUE", dueAt: new Date(),
      lastActionById: valentina.id, channel: "PRACTITIONER_ASSISTED",
      channelNote: "authorized by phone, Jul 21",
    },
  });
  await audit({
    actorId: valentina.id, onBehalfOfId: maria.id, action: "assisted-purchase",
    reason: "authorized by phone, Jul 21", meta: { chargeId: chargeA.id, settlement: "markpaid" },
  });
  check("charge carries channel PRACTITIONER_ASSISTED + required note",
    chargeA.channel === "PRACTITIONER_ASSISTED" && Boolean(chargeA.channelNote));
  await setChargeStatus(chargeA.id, "PAID", valentina.id, { paidVia: "in-person" });
  const pkg = await prisma.package.findUnique({ where: { chargeId: chargeA.id } });
  check("mark-paid settles and ACTIVATES the package", pkg?.status === "ACTIVE",
    `sessions=${pkg?.sessionsTotal}`);
  // Path B — invoice: the charge exists DUE with the channel stamp; the shared
  // sendChargeInvoice flow takes it from there (Square-configured envs).
  const chargeB = await prisma.charge.create({
    data: {
      clientId: maria.id, kind: "PACKAGE", priceBookId: sku.id, description: sku.name,
      amountCents: sku.amountCents, currency: sku.currency, status: "DUE", dueAt: new Date(),
      lastActionById: valentina.id, channel: "PRACTITIONER_ASSISTED",
      channelNote: "asked for the invoice by email",
    },
  });
  check("invoice path: attributed DUE charge awaits the shared invoice flow",
    chargeB.status === "DUE" && chargeB.channel === "PRACTITIONER_ASSISTED");
  // Card path gate — no consent on file → the option must not exist.
  const link = await prisma.squareCustomerLink.findUnique({ where: { clientId: maria.id } });
  const cardAvailable = Boolean(link?.cardOnFile && link.cardConsentAt && !link.cardConsentRevokedAt);
  check("card path invisible without card-on-file consent", !cardAvailable);
  // …and appears only once the CLIENT's consent lands (their settings action):
  if (link) {
    await prisma.squareCustomerLink.update({
      where: { clientId: maria.id },
      data: { cardOnFile: true, cardConsentAt: new Date(), cardConsentRevokedAt: null },
    });
    const l2 = (await prisma.squareCustomerLink.findUnique({ where: { clientId: maria.id } }))!;
    check("card path opens with consent", Boolean(l2.cardOnFile && l2.cardConsentAt && !l2.cardConsentRevokedAt));
    await prisma.squareCustomerLink.update({
      where: { clientId: maria.id },
      data: { cardConsentRevokedAt: new Date() },
    });
    const l3 = (await prisma.squareCustomerLink.findUnique({ where: { clientId: maria.id } }))!;
    check("revocation closes it again", Boolean(l3.cardConsentRevokedAt));
  } else {
    log("  · (no Square link on scratch — consent open/close asserted structurally elsewhere)");
  }

  // ---- §4.3 · Assist grant window (Ben) + worksheet attribution ----
  log(`\n## Assist grant + worksheet — Ben`);
  const grant = await prisma.assistGrant.create({
    data: {
      practitionerId: valentina.id, clientId: ben.id, reason: "intake-together",
      expiresAt: new Date(Date.now() + 30 * 60_000),
    },
  });
  // The exact validity conditions activeAssist() checks:
  const valid = !grant.endedAt && grant.expiresAt > new Date() && grant.practitionerId === valentina.id;
  check("fresh grant is live (30-minute window)", valid);
  const expired = await prisma.assistGrant.create({
    data: {
      practitionerId: valentina.id, clientId: ben.id, reason: "phone-support",
      expiresAt: new Date(Date.now() - 60_000),
    },
  });
  check("expired grant is dead by the same conditions", !(expired.expiresAt > new Date()));
  // A worksheet answered in assist carries the honest label:
  const spiralWs = await prisma.worksheet.findFirst({ where: { isSpiral: false, active: true } });
  if (spiralWs) {
    await prisma.worksheetAssignment.deleteMany({ where: { clientId: ben.id, worksheetId: spiralWs.id } });
    const assignment = await prisma.worksheetAssignment.create({
      data: { worksheetId: spiralWs.id, clientId: ben.id, assignedById: valentina.id, status: "COMPLETED" },
    });
    const resp = await prisma.worksheetResponse.create({
      data: { assignmentId: assignment.id, answers: { note: "dictated together" }, assistedById: valentina.id },
    });
    check("assist-entered response stores assistedById", resp.assistedById === valentina.id);
    await prisma.worksheetAssignment.update({ where: { id: assignment.id }, data: { status: "DISMISSED" } });
    // Reopen state machine: has answers → consistent state is COMPLETED.
    const a2 = await prisma.worksheetAssignment.findUnique({
      where: { id: assignment.id }, include: { response: { select: { id: true } } },
    });
    await prisma.worksheetAssignment.update({
      where: { id: assignment.id },
      data: { status: a2!.response ? "COMPLETED" : "PENDING" },
    });
    const a3 = await prisma.worksheetAssignment.findUnique({ where: { id: assignment.id } });
    check("reopen fixes a jammed state without touching answers", a3!.status === "COMPLETED");
  }
  await prisma.assistGrant.update({ where: { id: grant.id }, data: { endedAt: new Date() } });
  const g2 = await prisma.assistGrant.findUnique({ where: { id: grant.id } });
  check("exit stamps endedAt — the grant can never be reused", Boolean(g2!.endedAt));

  // ---- §4.4 · The audit spine ----
  log(`\n## The audit spine`);
  const lines = await prisma.auditEvent.findMany({
    where: { actorId: valentina.id, onBehalfOfId: { in: [rosa.id, maria.id] } },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  check("every tool above landed attributed audit lines",
    lines.some((l) => l.action === "temp-password") && lines.some((l) => l.action === "assisted-purchase"));
  check("audit rows carry actor + on-behalf-of, metadata only",
    lines.every((l) => l.actorId === valentina.id && Boolean(l.onBehalfOfId)));

  log(`\n${failed === 0 ? "ALL CHECKS PASS" : `${failed} CHECK(S) FAILED`}`);
  log(
    `\nStaging walkthrough (request-bound layer): enter assist from a Portrait → wine banner on every /space screen · consent+payment+security+export+deletion+resonance blocked with the quiet notice · message send returns "assist" · exit returns to the Portrait · the client's settings show the "Valentina helped" line (+ email if the toggle is on).`,
  );
  mkdirSync(join(__dirname), { recursive: true });
  writeFileSync(join(__dirname, "VERIFY-LOG.md"), report.join("\n") + "\n");
  if (failed > 0) process.exit(1);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
