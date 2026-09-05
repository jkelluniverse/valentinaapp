import { randomBytes } from "crypto";
// Raw client on purpose (guard-prisma allowlist): self-signup is TENANT-CREATION
// INGRESS. It runs inside a request whose host belongs to a DIFFERENT tenant
// (the marketing site = the default tenant), and it must reason about rows that
// by definition live outside that scope: the platform-level prospect ledger, a
// GLOBAL practitioner-email uniqueness check (User.email is globally unique, so
// a request-scoped read would miss another practice's owner and turn a clean
// refusal into a P2002 mid-provision), the audit row for the NEW tenant, and the
// rollback that guarantees no half-built practice survives a failure.
// Cross-tenant by nature — same shape as lib/payments/webhook.ts.
import { rawPrisma as prisma } from "@/lib/prisma-internal";
import { provisionTenant, type TenantConfigFile } from "@/lib/provisioning";
import { sendEmail, emailConfigured } from "@/lib/notify";
import { SLUG_RE, PASSWORD_MIN, RESERVED_SLUGS, STANDARD_MODULES, portalHostFor } from "@/lib/signup-config";
import { signupCopy, fill, type SignupLocale } from "@/lib/signup-copy";

export { SLUG_RE, PASSWORD_MIN, RESERVED_SLUGS, STANDARD_MODULES, slugify, portalHostFor } from "@/lib/signup-config";

// C23-SIGNUP §4 — the front door's service layer. Every check here is
// SERVER-SIDE and authoritative; the form's own validation is a courtesy.
//
// What a signup is, fixed by spec and not selectable by the visitor:
//   seed EMPTY · billingPlan FOUNDING_COMP (comped by design → zero Stripe
//   objects) · layout journey-v1 · skin warm-clay · status ACTIVE (a real
//   practice, so no DEMO banner) · the three standard modules.

export type SlugVerdict = "ok" | "invalid" | "reserved" | "taken";

export async function checkSlug(raw: string): Promise<SlugVerdict> {
  const slug = raw.trim().toLowerCase();
  if (!SLUG_RE.test(slug)) return "invalid";
  if (RESERVED_SLUGS.includes(slug) || slug.startsWith("demo-")) return "reserved";
  const existing = await prisma.tenant.findFirst({ where: { slug }, select: { id: true } });
  return existing ? "taken" : "ok";
}

// Refusal reasons are stable codes; the SCREEN turns them into in-language
// sentences (messages/{en,es}/signup.json), so nothing here is a user string.
export type SignupRefusal =
  | "missing"
  | "email"
  | "password"
  | "slug"
  | "slug-reserved"
  | "slug-taken"
  | "email-taken"
  | "rate"
  | "failed";

export type SignupInput = {
  name: string;
  practiceName: string;
  email: string;
  password: string;
  slug: string;
  referredByCode?: string | null;
  source?: string | null;
  baseUrl?: string;
  locale?: SignupLocale;
};

export type SignupResult =
  | { ok: true; slug: string; email: string; referralCode: string; portalHost: string }
  | { ok: false; reason: SignupRefusal };

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function newReferralCode(): string {
  // Crockford-ish alphabet: no I/O/0/1/L/U, so a code read aloud at an event
  // (or typed off a phone screen) survives the trip.
  const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

async function issueReferralCode(): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const code = newReferralCode();
    const clash = await prisma.practitionerProspect.findFirst({ where: { referralCode: code }, select: { id: true } });
    if (!clash) return code;
  }
  throw new Error("could not issue a unique referral code");
}

// Roll a failed provision all the way back. Only ever called when provisioning
// did NOT return ok, i.e. the practitioner user does not exist — but it deletes
// defensively in dependency order so no half-built practice can survive.
async function rollbackTenant(slug: string): Promise<void> {
  const t = await prisma.tenant.findFirst({ where: { slug }, select: { id: true } });
  if (!t) return;
  await prisma.auditEvent.deleteMany({ where: { tenantId: t.id } }).catch(() => {});
  await prisma.tenantBilling.deleteMany({ where: { tenantId: t.id } }).catch(() => {});
  await prisma.tenantModule.deleteMany({ where: { tenantId: t.id } }).catch(() => {});
  await prisma.user.deleteMany({ where: { tenantId: t.id } }).catch(() => {});
  await prisma.tenant.delete({ where: { id: t.id } }).catch(() => {});
}

export async function signUpPractitioner(input: SignupInput): Promise<SignupResult> {
  const name = input.name.trim();
  const practiceName = input.practiceName.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const slug = input.slug.trim().toLowerCase();

  // 1 — validation, server-side and complete.
  if (!name || !practiceName || !email || !password || !slug) return { ok: false, reason: "missing" };
  if (!EMAIL_RE.test(email)) return { ok: false, reason: "email" };
  if (password.length < PASSWORD_MIN) return { ok: false, reason: "password" };
  if (!SLUG_RE.test(slug)) return { ok: false, reason: "slug" };

  // 2 — the reserved list + slugs already taken.
  const verdict = await checkSlug(slug);
  if (verdict === "invalid") return { ok: false, reason: "slug" };
  if (verdict === "reserved") return { ok: false, reason: "slug-reserved" };
  if (verdict === "taken") return { ok: false, reason: "slug-taken" };

  // Email uniqueness, checked GLOBALLY before anything is written: User.email
  // is unique platform-wide, and a prospect who already converted owns a
  // practice. Refuse cleanly instead of dying inside provisioning.
  const priorUser = await prisma.user.findFirst({ where: { email }, select: { id: true } });
  if (priorUser) return { ok: false, reason: "email-taken" };
  const priorProspect = await prisma.practitionerProspect.findUnique({ where: { email } });
  if (priorProspect?.status === "SIGNED_UP") return { ok: false, reason: "email-taken" };

  // 3 — the prospect row exists BEFORE the practice does, and carries a
  // referral code from the moment it is created (C23-REFERRAL will use it;
  // attribution logic is explicitly not this build's job).
  const referralCode = priorProspect?.referralCode ?? (await issueReferralCode());
  const prospect = await prisma.practitionerProspect.upsert({
    where: { email },
    create: {
      name,
      email,
      practiceName,
      status: "LEAD",
      source: input.source?.slice(0, 120) || "web",
      referredByCode: input.referredByCode?.slice(0, 64) || null,
      referralCode,
    },
    update: {
      name,
      practiceName,
      // A code already captured is not overwritten by a later empty visit.
      ...(input.referredByCode ? { referredByCode: input.referredByCode.slice(0, 64) } : {}),
      ...(input.source ? { source: input.source.slice(0, 120) } : {}),
    },
  });

  // 4 — provision. Fixed config: this is a real practice on a comped founding
  // plan, not a demo and not a paid subscription (zero Stripe objects).
  const cfg: TenantConfigFile = {
    slug,
    displayName: practiceName,
    layoutKey: "journey-v1",
    skinKey: "warm-clay",
    modules: STANDARD_MODULES.map((key) => ({ key })),
    branding: { portalTitle: practiceName },
    featureFlags: {},
    seed: "EMPTY",
    billingPlan: "FOUNDING_COMP",
    practitioner: { name, email, password },
  };

  let outcome: Awaited<ReturnType<typeof provisionTenant>>;
  try {
    outcome = await provisionTenant(cfg);
  } catch (err) {
    console.error("[signup] provisioning threw", err instanceof Error ? err.message : "unknown");
    await rollbackTenant(slug);
    return { ok: false, reason: "failed" };
  }
  if (!outcome.ok) {
    // Never a partial practice: whatever got as far as a row goes away, and the
    // prospect stays LEAD.
    await rollbackTenant(slug);
    if (/slug/.test(outcome.error)) return { ok: false, reason: "slug-taken" };
    if (/email/.test(outcome.error)) return { ok: false, reason: "email-taken" };
    return { ok: false, reason: "failed" };
  }

  // 5 — the practice exists. Convert the prospect, then write the audit row.
  const practitioner = await prisma.user.findFirst({
    where: { tenantId: outcome.tenantId, role: "PRACTITIONER" },
    select: { id: true },
  });
  if (!practitioner) {
    await rollbackTenant(slug);
    return { ok: false, reason: "failed" };
  }

  await prisma.practitionerProspect.update({
    where: { id: prospect.id },
    data: { status: "SIGNED_UP", tenantId: outcome.tenantId, convertedAt: new Date() },
  });

  // Attributable audit (law #6): metadata only. No password, no hash, no
  // fragment of either — the fields written here are the whole record.
  await prisma.auditEvent.create({
    data: {
      tenantId: outcome.tenantId,
      actorId: practitioner.id,
      action: "practitioner-signup",
      reason: "self-signup via the public front door",
      meta: {
        slug,
        prospectId: prospect.id,
        referralCode,
        referredByCode: prospect.referredByCode ?? null,
        source: prospect.source ?? null,
        plan: "FOUNDING_COMP",
        chosePassword: outcome.chosePassword,
      },
    },
  });

  const portalHost = portalHostFor(slug);

  // Welcome email is a COURTESY, never a dependency: the confirmation screen
  // carries everything they need, so a missing Resend key changes nothing.
  if (emailConfigured()) {
    const locale = input.locale === "es" ? "es" : "en";
    const e = signupCopy(locale).email;
    const vars = { practice: practiceName, host: portalHost, email, code: referralCode };
    const paragraphs = [fill(e.p1, vars), fill(e.p2, vars), fill(e.p3, vars)];
    await sendEmail({
      to: email,
      subject: e.subject,
      text: paragraphs.join("\n\n"),
      envelope: {
        locale,
        heading: e.heading,
        paragraphs,
        button: { label: e.button, url: input.baseUrl ?? `https://${portalHost}` },
      },
    }).catch(() => ({ ok: false }));
  }

  return { ok: true, slug, email, referralCode, portalHost };
}
