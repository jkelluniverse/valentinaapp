import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getModule } from "@/lib/modules/registry";
import { provisionTenantBilling } from "@/lib/billing/provision";

// PLATFORM §7 — provisioning: "new practitioner in under an hour". The
// config JSON IS the productized deliverable — a practitioner's entire
// portal as one reviewable, versionable file. Used by BOTH the CLI
// (scripts/provision-tenant.ts) and the admin flow (/admin/tenants/new);
// everything stamps tenantId explicitly (this often runs outside a
// request, where the scoped client passes through).

export type TenantConfigFile = {
  slug: string;
  displayName: string;
  layoutKey: "journey-v1" | "dashboard-v1";
  skinKey: "warm-clay" | "clinical-light" | "celestial-dark";
  modules: { key: string; label?: string; settings?: Record<string, unknown> }[];
  branding?: { portalTitle?: string; welcomeCopy?: string; accentOverride?: string; welcomeVideoUrl?: string };
  featureFlags?: Record<string, boolean>;
  seed: "EMPTY" | "DEMO_FIXTURES";
  billingPlan?: string; // defaults FOUNDING_COMP; DEMO tenants are always comped
  // C23-SIGNUP §2 — `password` is OPTIONAL and purely additive: when a
  // practitioner CHOSE their own password (self-signup), it is hashed at
  // cost 12 and the forced-change flag is NOT set — there is nothing to
  // force, they already know it. Omitted (CLI, /admin/tenants/new) the old
  // behavior is byte-for-byte unchanged: random temp password + forced change.
  practitioner: { name: string; email: string; password?: string };
};

export type ProvisionOutcome =
  | { ok: true; tenantId: string; practitionerEmail: string; tempPassword: string; chosePassword: boolean }
  | { ok: false; error: string };

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}$/;

export function validateConfig(cfg: TenantConfigFile): string | null {
  if (!SLUG_RE.test(cfg.slug)) return "slug must be lowercase letters/numbers/hyphens";
  if (!cfg.displayName?.trim()) return "displayName required";
  if (!["journey-v1", "dashboard-v1"].includes(cfg.layoutKey)) return "unknown layoutKey";
  if (!["warm-clay", "clinical-light", "celestial-dark"].includes(cfg.skinKey)) return "unknown skinKey";
  for (const m of cfg.modules ?? []) {
    if (!getModule(m.key)) return `unknown module: ${m.key}`;
  }
  if (!["EMPTY", "DEMO_FIXTURES"].includes(cfg.seed)) return "seed must be EMPTY or DEMO_FIXTURES";
  if (!cfg.practitioner?.email?.includes("@")) return "practitioner email required";
  return null;
}

export async function provisionTenant(cfg: TenantConfigFile): Promise<ProvisionOutcome> {
  const invalid = validateConfig(cfg);
  if (invalid) return { ok: false, error: invalid };

  const existingSlug = await prisma.tenant.findFirst({ where: { slug: cfg.slug }, select: { id: true } });
  if (existingSlug) return { ok: false, error: `slug "${cfg.slug}" is taken` };
  const existingUser = await prisma.user.findFirst({ where: { email: cfg.practitioner.email.toLowerCase() }, select: { id: true } });
  if (existingUser) return { ok: false, error: "practitioner email already has an account" };

  const demo = cfg.seed === "DEMO_FIXTURES";
  const tenant = await prisma.tenant.create({
    data: {
      slug: cfg.slug,
      displayName: cfg.displayName.trim(),
      status: demo ? "DEMO" : "ACTIVE",
      layoutKey: cfg.layoutKey,
      skinKey: cfg.skinKey,
      branding: (cfg.branding ?? {}) as never,
      featureFlags: (cfg.featureFlags ?? {}) as never,
    },
  });

  await prisma.tenantModule.createMany({
    data: (cfg.modules ?? []).map((m, i) => ({
      tenantId: tenant.id,
      moduleKey: m.key,
      enabled: true,
      position: i + 1,
      settings: { ...(m.settings ?? {}), ...(m.label ? { displayLabel: m.label } : {}) } as never,
    })),
  });

  // DEMO tenants never touch Stripe (§4.2); real tenants take their plan.
  await provisionTenantBilling({
    tenantId: tenant.id,
    plan: demo ? "FOUNDING_COMP" : (cfg.billingPlan ?? "FOUNDING_COMP"),
    ownerName: cfg.practitioner.name,
    ownerEmail: cfg.practitioner.email,
    demo,
  });

  // The practitioner. Two shapes, decided ONLY by whether a password was
  // supplied:
  //   · chosen (C23-SIGNUP) — hashed at cost 12, no forced change, and NOTHING
  //     is echoed back to the caller (tempPassword is "" by design).
  //   · not supplied (CLI, admin flow) — unchanged: temp password shown ONCE,
  //     first sign-in forces a new one (AMD-06 mustChangePassword).
  const chosen = cfg.practitioner.password;
  const tempPassword = chosen ? "" : randomBytes(9).toString("base64url");
  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: cfg.practitioner.email.toLowerCase(),
      name: cfg.practitioner.name,
      role: "PRACTITIONER",
      active: true,
      mustChangePassword: !chosen,
      passwordHash: chosen ? bcrypt.hashSync(chosen, 12) : bcrypt.hashSync(tempPassword, 10),
    },
  });

  if (demo) await seedDemoFixtures(tenant.id);

  return {
    ok: true,
    tenantId: tenant.id,
    practitionerEmail: cfg.practitioner.email.toLowerCase(),
    tempPassword,
    chosePassword: Boolean(chosen),
  };
}

// DEMO_FIXTURES — a small, obviously-fictional cast so the portal shows
// life on first sign-in. Fixture emails only (never real sends — and the
// notify layer additionally suppresses DEMO-tenant email to non-fixture
// addresses).
async function seedDemoFixtures(tenantId: string): Promise<void> {
  const client = await prisma.user.create({
    data: {
      tenantId,
      email: `casey.demo.${tenantId.slice(-6)}@fixture.test`,
      name: "Casey Demo",
      role: "CLIENT",
      active: true,
      passwordHash: bcrypt.hashSync(randomBytes(9).toString("base64url"), 10),
    },
  });
  await prisma.consentGrant.create({ data: { tenantId, userId: client.id, version: "2026-07" } });
  await prisma.clientProfile.create({
    data: {
      tenantId,
      userId: client.id,
      birthDate: new Date("1991-04-12T00:00:00Z"),
      birthTime: "08:20",
      birthTimeUnknown: false,
      birthPlace: "Portland, Oregon, USA",
      birthLat: 45.5152,
      birthLng: -122.6784,
    },
  });
  await prisma.logEntry.createMany({
    data: [
      { tenantId, clientId: client.id, body: "First week in the new practice space — nervous, hopeful." },
      { tenantId, clientId: client.id, body: "Noticed I say yes before I check in with myself. Writing it down this time." },
    ],
  });
}
