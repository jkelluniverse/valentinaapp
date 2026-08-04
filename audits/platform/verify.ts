/* eslint-disable @typescript-eslint/no-explicit-any */
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { prisma } from "../../lib/prisma";
import { tenantDb, DEFAULT_TENANT_ID, SCOPED_MODELS, type ScopedModel } from "../../lib/tenancy/db";
import { slugFromHost } from "../../lib/tenancy";

// PLATFORM Phase 0/0.5 — acceptance checks. The isolation proof now covers
// EVERY scoped table (all 66), both directions, with a real tenant-B row
// inserted per table (parent chains included), plus the legacy-null rule.
//   DATABASE_URL=...migrated-scratch npx tsx audits/platform/verify.ts

const report: string[] = [];
const log = (s: string) => { report.push(s); console.log(s); };
let failed = 0;
const check = (name: string, ok: boolean, note = "") => {
  if (!ok) failed++;
  log(`- ${ok ? "✓" : "✗"} ${name}${note ? ` — ${note}` : ""}`);
};

const B = "tnt_isolation_b_0000001";
const j = (v: unknown) => v as object;

async function main() {
  log(`# PLATFORM Phase 0/0.5 verify — ${new Date().toISOString()}`);

  // ---- Tenant #1 exists, exactly as she runs today ----
  log(`\n## Tenant #1`);
  const t = await prisma.tenant.findUnique({ where: { slug: "valentina" }, include: { modules: true } });
  check("tenant row exists (slug valentina)", Boolean(t));
  check("fixed id matches the DAL constant", t?.id === DEFAULT_TENANT_ID, t?.id);
  check("journey-v1 + warm-clay", t?.layoutKey === "journey-v1" && t?.skinKey === "warm-clay");
  const keys = (t?.modules ?? []).map((m) => m.moduleKey).sort();
  check(
    "her three panels as generic module keys",
    JSON.stringify(keys) === JSON.stringify(["archetypal-keys", "body-graph", "values-spiral"]),
    keys.join(", "),
  );
  const labels = (t?.modules ?? []).map((m) => (m.settings as { displayLabel?: string })?.displayLabel);
  check("her branded names live in settings, not code", labels.every(Boolean), labels.join(" · "));

  // ---- Null-tenant invariant: STRICT again since migration 36 ----
  // Migration 36 converged all legacy nulls to the default tenant, the
  // scoped client stamps request-path creates, and seeds stamp on
  // completion — so zero null rows is the invariant, and any violation is
  // drift (most likely the documented nested-writes gap).
  log(`\n## Null-tenant invariant (migration 36 + stamped creates)`);
  let nullRows = 0;
  for (const key of SCOPED_MODELS) {
    const n = await (prisma as any)[key].count({ where: { tenantId: null } });
    if (n > 0) { nullRows += n; log(`  · ${key}: ${n} null-tenant rows`); }
  }
  check("zero null-tenant rows across every scoped table", nullRows === 0, `${SCOPED_MODELS.length} tables checked`);

  // ---- Cross-tenant isolation: EVERY table, both directions ----
  log(`\n## Cross-tenant isolation — all ${SCOPED_MODELS.length} tables`);
  await cleanupB(); // idempotent re-runs
  await prisma.tenant.create({ data: { id: B, slug: "tenant-b", displayName: "Isolation probe", status: "DEMO" } });

  const herDb = tenantDb(DEFAULT_TENANT_ID);
  const bDb = tenantDb(B);

  // Direction A(pre): with zero B rows, tenant B sees NOTHING anywhere —
  // proven against her full real dataset in every table.
  let leaks = 0;
  for (const key of SCOPED_MODELS) {
    const n = await bDb[key].count();
    if (n !== 0) { leaks++; log(`  · LEAK pre-insert: tenant B sees ${n} rows in ${key}`); }
  }
  check("tenant B sees zero rows in every table (her data invisible)", leaks === 0);

  // Snapshot her counts, then insert exactly one B row per table.
  const herBefore: Record<string, number> = {};
  for (const key of SCOPED_MODELS) herBefore[key] = await herDb[key].count();

  const ids = await insertBFixtures();

  let missing = 0, cross = 0, herDrift = 0;
  for (const key of SCOPED_MODELS) {
    const bN = await bDb[key].count();
    if (bN < 1) { missing++; log(`  · MISSING: tenant B sees ${bN} rows in ${key} (expected ≥1)`); }
    const herN = await herDb[key].count();
    if (herN !== herBefore[key]) { herDrift++; log(`  · CROSS: her count changed in ${key} (${herBefore[key]} → ${herN})`); }
  }
  // Spot the sharpest cross-read: her DAL hunting B's marker ids directly.
  const herSeesBUser = await herDb.user.findFirst({ where: { id: ids.bUser } });
  if (herSeesBUser) cross++;
  check("every table's B row is visible to B", missing === 0);
  check("her tenant sees none of B's rows in any table", herDrift === 0 && cross === 0);

  // Legacy-null rule on representative per-client tables.
  const probes: ScopedModel[] = ["logEntry", "note", "charge", "psycheNode", "appointment"];
  let legacyOk = true;
  for (const key of probes) {
    const row = await (prisma as any)[key].findFirst({ where: { tenantId: DEFAULT_TENANT_ID } });
    if (!row) continue;
    await (prisma as any)[key].update({ where: { id: row.id }, data: { tenantId: null } });
    const hers = await herDb[key].findFirst({ where: { id: row.id } });
    const bs = await bDb[key].findFirst({ where: { id: row.id } });
    if (!hers || bs) legacyOk = false;
    await (prisma as any)[key].update({ where: { id: row.id }, data: { tenantId: DEFAULT_TENANT_ID } });
  }
  check("legacy null rows belong to the DEFAULT tenant only (5 table probe)", legacyOk);

  await cleanupB();

  // ---- Host → slug resolution ----
  log(`\n## Host resolution`);
  check("custom domain resolves the default tenant (no PLATFORM_DOMAIN set)", slugFromHost("valentinavelez.com") === "valentina");
  process.env.PLATFORM_DOMAIN = "portaldomain.com";
  check("subdomain resolves its slug", slugFromHost("demo-mystic.portaldomain.com") === "demo-mystic");
  check("apex resolves the default tenant", slugFromHost("portaldomain.com") === "valentina");
  check("foreign host resolves the default tenant", slugFromHost("valentinavelez.com") === "valentina");
  check("nested subdomain never leaks a slug", slugFromHost("a.b.portaldomain.com") === "valentina");
  delete process.env.PLATFORM_DOMAIN;

  log(`\n${failed === 0 ? "ALL CHECKS PASS" : `${failed} CHECK(S) FAILED`}`);
  mkdirSync(join(__dirname), { recursive: true });
  // Machine output goes to its OWN file — VERIFY-LOG.md is the curated,
  // human-maintained accumulation of every phase's acceptance and must not
  // be clobbered by a re-run of this harness.
  writeFileSync(join(__dirname, "isolation-verify.out.md"), report.join("\n") + "\n");
  if (failed > 0) process.exit(1);
}

// One valid row per scoped table for tenant B, parent chains included. Ids
// are fixed markers so cleanup is exact and re-runs are idempotent.
async function insertBFixtures() {
  const T = { tenantId: B };
  const now = new Date();
  const p: any = prisma;

  const bUser = (await p.user.create({ data: { ...T, id: "bfx_user", email: "probe@tenant-b.test", role: "CLIENT", active: true } })).id;
  await p.consentGrant.create({ data: { ...T, userId: bUser, version: "probe" } });
  await p.pushSubscription.create({ data: { ...T, userId: bUser, endpoint: "https://push.tenant-b.test/1", p256dh: "x", auth: "y" } });
  await p.emailChangeRequest.create({ data: { ...T, userId: bUser, newEmail: "n@tenant-b.test", tokenHash: "bfx_ec", expiresAt: now } });
  await p.passwordResetToken.create({ data: { ...T, userId: bUser, tokenHash: "bfx_pr", expiresAt: now } });
  await p.deletionRequest.create({ data: { ...T, userId: bUser } });
  await p.entryDeepening.create({ data: { ...T, entryId: "bfx_entry", clientId: bUser } });
  const node = (await p.psycheNode.create({ data: { ...T, clientId: bUser, kind: "WOUND", label: "probe", source: "PRACTITIONER" } })).id;
  await p.psycheEdge.create({ data: { ...T, clientId: bUser, fromId: node, toId: node, relation: "probe" } });
  await p.psycheExtraction.create({ data: { ...T, clientId: bUser, requestedById: bUser, scopeTo: now, model: "probe" } });
  await p.psycheAudit.create({ data: { ...T, clientId: bUser, actorId: bUser, action: "probe", detail: "probe" } });
  await p.patternArchetype.create({ data: { ...T, id: "bfx_arch", kind: "WOUND", label: "probe-b", definition: "probe" } });
  await p.patternLink.create({ data: { ...T, id: "bfx_plink", fromId: "bfx_arch", toId: "bfx_arch", relation: "probe", strength: 1, clientCount: 99 } });
  const folder = (await p.libraryFolder.create({ data: { ...T, practitionerId: bUser, name: "probe" } })).id;
  await p.libraryItem.create({ data: { ...T, folderId: folder, kind: "probe", name: "probe" } });
  await p.clientProfile.create({ data: { ...T, userId: bUser } });
  await p.humanDesignChart.create({ data: { ...T, userId: bUser, provider: "probe" } });
  await p.birthChartCore.create({ data: { ...T, userId: bUser, personality: j({}), design: j({}), provider: "probe", inputHash: "bfx" } });
  await p.lensResult.create({ data: { ...T, userId: bUser, lens: "SPIRAL", sourceType: "ASSESSMENT", result: j({}) } });
  await p.integrativeProfile.create({ data: { ...T, userId: bUser, synthesis: j({}), version: "probe" } });
  await p.artifactVersion.create({ data: { ...T, clientId: bUser, artifactType: "FORMULATION", content: j({}), model: "probe", generatedAt: now } });
  await p.integrativeReading.create({ data: { ...T, userId: bUser, content: "probe", model: "probe", inputHash: "bfx" } });
  await p.resonanceMark.create({ data: { ...T, clientId: bUser, subjectType: "NODE", subjectKey: "k", value: "FEELS_TRUE", markedById: bUser, markedByRole: "CLIENT" } });
  await p.integrationGuide.create({ data: { ...T, clientId: bUser, model: "probe", inputHash: "bfx", output: j({}) } });
  await p.clientGoal.create({ data: { ...T, clientId: bUser, statement: "probe", createdById: bUser } });
  await p.beliefWork.create({ data: { ...T, clientId: bUser, belief: "probe", createdById: bUser } });
  await p.interventionOutcome.create({ data: { ...T, clientId: bUser, createdById: bUser } });
  await p.askRecordAnswer.create({ data: { ...T, clientId: bUser, question: "probe", model: "probe", output: j({}), askedById: bUser } });
  await p.practiceSetting.create({ data: { ...T, key: "bfx_setting", value: "probe" } });
  const note = (await p.note.create({ data: { ...T, authorId: bUser, clientId: bUser, body: "probe" } })).id;
  await p.handwrittenNote.create({ data: { ...T, id: "bfx_hw", fromAddress: "probe@tenant-b.test", pdf: Buffer.from("x") } });
  await p.recordingConsent.create({ data: { ...T, clientId: bUser, version: "probe", textSnapshot: "probe" } });
  await p.recordingDraft.create({ data: { ...T, provider: "probe", providerRef: "bfx_rec", payload: j({}) } });
  await p.sessionTranscript.create({ data: { ...T, clientId: bUser, provider: "probe", segments: j([]) } });
  await p.noteScan.create({ data: { ...T, noteId: note, model: "probe", connections: j([]) } });
  const convo = (await p.conversation.create({ data: { ...T, clientId: bUser, practitionerId: bUser } })).id;
  await p.message.create({ data: { ...T, conversationId: convo, senderId: bUser, senderRole: "CLIENT", body: "probe" } });
  await p.stageChange.create({ data: { ...T, clientId: bUser, toStage: "STABILIZE", changedById: bUser } });
  const charge = (await p.charge.create({ data: { ...T, clientId: bUser, description: "probe", amountCents: 1 } })).id;
  const pkg = (await p.package.create({ data: { ...T, clientId: bUser, priceBookId: "bfx_pb", sessionsTotal: 1, chargeId: charge } })).id;
  await p.priceBook.create({ data: { ...T, id: "bfx_pb", name: "probe", amountCents: 1 } });
  await p.squareCustomerLink.create({ data: { ...T, clientId: bUser, squareCustomerId: "bfx_sq" } });
  await p.externalPayment.create({ data: { ...T, squarePaymentId: "bfx_pay", amountCents: 1, status: "probe" } });
  const ws = (await p.worksheet.create({ data: { ...T, title: "probe", schema: j([]), createdById: bUser } })).id;
  const wsa = (await p.worksheetAssignment.create({ data: { ...T, worksheetId: ws, clientId: bUser, assignedById: bUser } })).id;
  await p.worksheetResponse.create({ data: { ...T, assignmentId: wsa, answers: j({}) } });
  await p.assistGrant.create({ data: { ...T, practitionerId: bUser, clientId: bUser, reason: "probe", expiresAt: now } });
  await p.auditEvent.create({ data: { ...T, actorId: bUser, action: "probe" } });
  const course = (await p.course.create({ data: { ...T, title: "probe", createdById: bUser } })).id;
  const chapter = (await p.chapter.create({ data: { ...T, courseId: course, title: "probe", order: 1 } })).id;
  const lesson = (await p.lesson.create({ data: { ...T, chapterId: chapter, title: "probe", order: 1 } })).id;
  const enr = (await p.enrollment.create({ data: { ...T, courseId: course, clientId: bUser } })).id;
  await p.lessonProgress.create({ data: { ...T, enrollmentId: enr, lessonId: lesson } });
  await p.sessionPrep.create({ data: { ...T, clientId: bUser, requestedById: bUser, model: "probe", output: j({}) } });
  await p.recordItem.create({ data: { ...T, clientId: bUser, kind: "LOG_ENTRY", occurredAt: now, sourceType: "probe", sourceId: "bfx_ri", title: "", summary: "" } });
  const prompt = (await p.prompt.create({ data: { ...T, title: "probe", body: "probe", createdById: bUser } })).id;
  const asg = (await p.assignment.create({ data: { ...T, promptId: prompt, clientId: bUser, assignedById: bUser } })).id;
  await p.promptResponse.create({ data: { ...T, assignmentId: asg, body: "probe" } });
  await p.logEntry.create({ data: { ...T, clientId: bUser, body: "probe" } });
  await p.invite.create({ data: { ...T, email: "probe-invite@tenant-b.test", tokenHash: "bfx_inv", expiresAt: now, invitedById: bUser } });
  await p.schedulingConfig.create({ data: { ...T, practitionerId: bUser, timezone: "UTC", calendarFeedSecret: "bfx" } });
  await p.availabilityRule.create({ data: { ...T, practitionerId: bUser, weekday: 1, startMinute: 0, endMinute: 60 } });
  await p.availabilityException.create({ data: { ...T, practitionerId: bUser, date: now, type: "BLOCK" } });
  const appt = (await p.appointment.create({ data: { ...T, practitionerId: bUser, clientId: bUser, startAt: now, endAt: now, bookedBy: "probe" } })).id;
  await p.sessionCredit.create({ data: { ...T, packageId: pkg, appointmentId: appt } });
  await p.lead.create({ data: { ...T, name: "probe", email: "probe-lead@tenant-b.test" } });
  // BILLING B1 + SESSION-PIPELINE + ONBOARDING models.
  await p.connectedPaymentAccount.create({ data: { ...T, provider: "probe", merchantId: "bfx_merch", accessTokenEnc: "v1.x.y.z", status: "CONNECTED", connectedAt: now } });
  await p.payment.create({ data: { ...T, provider: "probe", providerPaymentId: "bfx_payment", amountCents: 1, purpose: "probe", status: "PENDING", occurredAt: now, raw: j({}) } });
  await p.sessionCapture.create({ data: { ...T, practitionerId: bUser, clientId: bUser, source: "UPLOAD", status: "TRANSCRIBING", recordedAt: now } });
  const flow = (await p.intakeFlow.create({ data: { ...T, clientId: bUser, schemaHash: "bfx", currentStep: "identity" } })).id;
  await p.intakeAnswer.create({ data: { flowId: flow, fieldKey: "identity.fullName", value: j("probe"), questionTextSnapshot: "Full name" } });
  await p.clientHintState.create({ data: { ...T, clientId: bUser, hintKey: "bfx_hint" } });
  await p.activityEvent.create({ data: { ...T, clientId: bUser, actor: "system", eventKey: "probe" } });
  await p.tenantBilling.create({ data: { ...T, plan: "CARE_99", status: "ACTIVE", stripeCustomerId: "bfx_cus" } });
  await p.reading.create({ data: { ...T, clientId: bUser, moduleKey: "western-natal", kind: "natal-positions", inputsHash: "bfx_hash", payload: j({}), status: "COMPLETE", computedAt: now } });

  return { bUser, pkg };
}

async function cleanupB() {
  const p: any = prisma;
  // Children before parents where FKs exist; everything keyed by tenantId=B.
  const order: ScopedModel[] = [
    "message", "conversation", "sessionCredit", "package", "charge", "worksheetResponse",
    "worksheetAssignment", "worksheet", "promptResponse", "assignment", "prompt",
    "lessonProgress", "enrollment", "lesson", "chapter", "course", "noteScan", "note",
    "libraryItem", "libraryFolder", "patternLink", "patternArchetype", "psycheEdge", "psycheNode",
    ...SCOPED_MODELS.filter((k) => !["message","conversation","sessionCredit","package","charge","worksheetResponse","worksheetAssignment","worksheet","promptResponse","assignment","prompt","lessonProgress","enrollment","lesson","chapter","course","noteScan","note","libraryItem","libraryFolder","patternLink","patternArchetype","psycheEdge","psycheNode","user"].includes(k)),
    "user",
  ];
  for (const key of order) {
    await p[key].deleteMany({ where: { tenantId: B } }).catch(() => undefined);
  }
  await p.tenant.deleteMany({ where: { id: B } }).catch(() => undefined);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
