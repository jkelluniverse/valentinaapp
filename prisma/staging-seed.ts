import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes, createHash } from "crypto";

// UX-AGENT staging fixtures — a practitioner + 3 fictional clients with rich,
// clearly-fake records, messages, appointments, charts, and psyche stars, so
// the audit can walk real journeys without touching real data. Idempotent by
// email. NEVER run against production.
const prisma = new PrismaClient();
const CONSENT_VERSION = "2026-07";
const DAY = 86_400_000;
const hash = (p: string) => bcrypt.hashSync(p, 10);
const ago = (d: number) => new Date(Date.now() - d * DAY);

// Deterministic 0..1 placement from a string, so First-Map star positions are
// stable across re-seeds (no Math.random — see FIXTURES-SPEC §9 "deterministic").
function placement(seed: string): number {
  const h = createHash("sha256").update(seed).digest();
  return h.readUInt32BE(0) / 0xffffffff;
}

// Idempotency (fixes the non-idempotency the last audit flagged): before
// re-seeding a fixture client's content, wipe the rows the seed creates with no
// natural key. RecordItem is upsert-keyed but its sourceId is the (new) LogEntry
// id, so stale LogEntry-sourced RecordItems must go too. Scoped to one client.
async function resetClientContent(clientId: string) {
  await prisma.psycheNode.deleteMany({ where: { clientId, source: "SELF_REPORTED" } });
  await prisma.message.deleteMany({ where: { conversation: { clientId } } });
  await prisma.appointment.deleteMany({ where: { clientId } });
  await prisma.recordItem.deleteMany({ where: { clientId, sourceType: "LogEntry" } });
  await prisma.logEntry.deleteMany({ where: { clientId } });
}

async function record(clientId: string, kind: string, occurredAt: Date, title: string, summary: string, tags: string[], sourceType: string, sourceId: string) {
  await prisma.recordItem.upsert({
    where: { sourceType_sourceId: { sourceType, sourceId } },
    create: { clientId, kind: kind as never, occurredAt, title, summary, tags, sourceType, sourceId },
    update: {},
  });
}

async function main() {
  const pw = await prisma.user.upsert({
    where: { email: "valentina@example.com" },
    update: { passwordHash: hash("audit-pass-1") },
    create: { email: "valentina@example.com", name: "Valentina Vélez", role: "PRACTITIONER", active: true, passwordHash: hash("audit-pass-1") },
  });

  await prisma.schedulingConfig.upsert({
    where: { practitionerId: pw.id },
    update: { discoveryMinutes: 20, discoveryVideoUrl: "https://example.com/room/discovery" },
    create: {
      practitionerId: pw.id,
      timezone: "America/New_York",
      defaultVideoUrl: "https://example.com/room/valentina",
      discoveryMinutes: 20,
      discoveryVideoUrl: "https://example.com/room/discovery",
      calendarFeedSecret: randomBytes(12).toString("hex"),
    },
  });

  // Availability: session hours (Mon–Fri 9–5) + separate discovery hours
  // (Mon–Fri 12–2) so the public /book funnel has open slots to show (C18).
  await prisma.availabilityRule.deleteMany({ where: { practitionerId: pw.id } });
  for (let weekday = 1; weekday <= 5; weekday++) {
    await prisma.availabilityRule.create({
      data: { practitionerId: pw.id, kind: "SESSION", weekday, startMinute: 9 * 60, endMinute: 17 * 60, active: true },
    });
    await prisma.availabilityRule.create({
      data: { practitionerId: pw.id, kind: "DISCOVERY", weekday, startMinute: 12 * 60, endMinute: 14 * 60, active: true },
    });
  }

  // A fresh PENDING invite for Journey 1 (onboarding). Token printed below.
  const token = randomBytes(16).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await prisma.invite.deleteMany({ where: { email: "newcomer@example.com" } });
  await prisma.invite.create({
    data: { email: "newcomer@example.com", name: "Robin Ash", tokenHash, status: "PENDING", invitedById: pw.id, expiresAt: new Date(Date.now() + 7 * DAY) },
  });

  const clients: {
    email: string; name: string; pass: string; stage: string;
    reflections: { body: string; mood: number; when: number; tags: string[] }[];
    messages: { from: "CLIENT" | "PRACTITIONER"; body: string; when: number; unread?: boolean }[];
    apptInDays: number | null;
    stars: { kind: string; label: string }[];
  }[] = [
    {
      email: "jacob@example.com", name: "Jacob Tony", pass: "audit-pass-1", stage: "STABILIZE",
      reflections: [
        { body: "Snapped at a coworker again over something small. That old feeling of not being taken seriously.", mood: 2, when: 1, tags: ["work", "not enough"] },
        { body: "Noticed I go quiet and cold when I feel dismissed. It protects me but it isolates me too.", mood: 3, when: 4, tags: ["patterns"] },
        { body: "Good session with a friend — felt actually heard for once. Rare and warm.", mood: 4, when: 8, tags: ["connection"] },
        { body: "The perfectionism is loud this week. If it isn't flawless it feels worthless.", mood: 2, when: 12, tags: ["belief", "work"] },
      ],
      messages: [
        { from: "PRACTITIONER", body: "Thinking of you before our session — anything you want to bring?", when: 2 },
        { from: "CLIENT", body: "hi valentina", when: 0.05, unread: true },
        { from: "CLIENT", body: "how do i prepare for next week", when: 0.02, unread: true },
      ],
      apptInDays: 1,
      stars: [{ kind: "CORE_BELIEF", label: "Not enough as I am" }, { kind: "PROTECTION", label: "Going cold when dismissed" }, { kind: "PATTERN", label: "Perfectionism" }, { kind: "RESOURCE", label: "Loyalty to people I trust" }],
    },
    {
      email: "mira@example.com", name: "Mira Chen", pass: "audit-pass-1", stage: "DEEPEN",
      reflections: [
        { body: "Cancelled plans again. The relief is instant and then the loneliness arrives right behind it.", mood: 2, when: 2, tags: ["avoidance"] },
        { body: "I keep waiting to feel ready before I let anyone close. It never comes.", mood: 3, when: 6, tags: ["belief"] },
      ],
      messages: [
        { from: "CLIENT", body: "I don't think I can keep going like this. everything feels pointless and I'm so tired of it all.", when: 1, unread: true },
      ],
      apptInDays: 5,
      stars: [{ kind: "WOUND", label: "Unsafe to be seen" }, { kind: "PROTECTION", label: "Withdrawing first" }],
    },
    {
      email: "sam@example.com", name: "Sam Rivera", pass: "audit-pass-1", stage: "STABILIZE",
      reflections: [
        { body: "First week trying the morning pages. Awkward but something loosened by day three.", mood: 4, when: 3, tags: ["progress"] },
      ],
      messages: [],
      apptInDays: null,
      stars: [{ kind: "RESOURCE", label: "Curiosity" }],
    },
  ];

  for (const c of clients) {
    const u = await prisma.user.upsert({
      where: { email: c.email },
      update: { passwordHash: hash(c.pass), name: c.name },
      create: { email: c.email, name: c.name, role: "CLIENT", active: true, passwordHash: hash(c.pass), consentAt: ago(30) },
    });
    await prisma.consentGrant.upsert({ where: { userId_version: { userId: u.id, version: CONSENT_VERSION } }, update: {}, create: { userId: u.id, version: CONSENT_VERSION } });
    await prisma.clientProfile.upsert({
      where: { userId: u.id },
      update: { stage: c.stage, firstMapCompletedAt: c.stars.length ? ago(20) : null },
      create: { userId: u.id, stage: c.stage, firstMapCompletedAt: c.stars.length ? ago(20) : null, intakeCompletedAt: ago(25), birthDate: new Date("1990-05-14"), birthPlace: "Austin, TX" },
    });

    // Clean slate for this client's no-natural-key content, so re-seeding never
    // duplicates reflections / messages / appointments / stars.
    await resetClientContent(u.id);

    for (let i = 0; i < c.reflections.length; i++) {
      const r = c.reflections[i];
      const e = await prisma.logEntry.create({ data: { clientId: u.id, body: r.body, mood: r.mood, occurredAt: ago(r.when), tags: r.tags, type: "REFLECTION" } });
      await record(u.id, "LOG_ENTRY", ago(r.when), "", r.body.slice(0, 200), r.tags, "LogEntry", e.id);
    }

    // conversation + messages
    if (c.messages.length) {
      const convo = await prisma.conversation.upsert({
        where: { clientId: u.id },
        update: { lastMessageAt: ago(Math.min(...c.messages.map((m) => m.when))) },
        create: { clientId: u.id, practitionerId: pw.id, lastMessageAt: ago(Math.min(...c.messages.map((m) => m.when))) },
      });
      for (const m of c.messages) {
        const crisis = /pointless|can't keep going|so tired of it all/i.test(m.body);
        await prisma.message.create({
          data: {
            conversationId: convo.id, senderId: m.from === "CLIENT" ? u.id : pw.id, senderRole: m.from, body: m.body,
            createdAt: ago(m.when), deliveredAt: ago(m.when), readAt: m.unread ? null : ago(m.when - 0.01),
            safetyFlag: crisis, safetyCleared: false,
          },
        });
      }
    }

    // psyche stars (SELF_REPORTED — their First Map). Deterministic placement;
    // the reset above cleared any prior stars, so a plain create is idempotent.
    for (const s of c.stars) {
      await prisma.psycheNode.create({
        data: {
          clientId: u.id, kind: s.kind as never, label: s.label, source: "SELF_REPORTED",
          selfX: placement(`${c.email}:${s.label}:x`), selfY: placement(`${c.email}:${s.label}:y`), weight: 1.5,
        },
      });
    }

    // appointment
    if (c.apptInDays != null) {
      const start = new Date(Date.now() + c.apptInDays * DAY);
      start.setHours(14, 0, 0, 0);
      await prisma.appointment.create({ data: { practitionerId: pw.id, clientId: u.id, startAt: start, endAt: new Date(start.getTime() + 50 * 60000), bookedBy: "practitioner", location: "VIRTUAL", videoUrl: "https://example.com/room/session", clientNote: "Continuing last week's thread" } });
    }
  }

  console.log("=== STAGING SEED COMPLETE ===");
  console.log("Practitioner:  valentina@example.com / audit-pass-1");
  console.log("Clients:       jacob@example.com, mira@example.com, sam@example.com / audit-pass-1");
  console.log(`Onboarding invite (Robin Ash): /invite/${token}`);
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
