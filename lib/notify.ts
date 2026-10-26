// Transactional email via Resend's REST API (no SDK dependency). Everything
// degrades gracefully: with no RESEND_API_KEY the app still works and booking
// just skips the email. Appointment content never goes to logs (spec §9) — we
// log only whether a send was attempted and its coarse outcome.
//
// EMAIL-SPEC — every send goes out branded: callers may pass a full `envelope`
// (heading/button/note per the demo template), and plain text-only sends are
// wrapped into the same Envelope automatically (subject as the heading, text
// split into paragraphs) so nothing in the app ever emails un-branded.

import { renderEnvelope, type EnvelopeInput } from "@/emails/envelope";

type Attachment = {
  filename: string;
  /** UTF-8 text content (ICS invites, plain files)… */
  content?: string;
  /** …or pre-encoded base64 for binary payloads (PDF invoices). */
  contentBase64?: string;
  contentType?: string;
};

type SendArgs = {
  to: string;
  subject: string;
  text: string;
  attachments?: Attachment[];
  /** Rich branded layout; when omitted, a default Envelope wraps the text. */
  envelope?: Omit<EnvelopeInput, "heading" | "paragraphs"> &
    Partial<Pick<EnvelopeInput, "heading" | "paragraphs">>;
  /**
   * C27-EMAIL-IDENTITY — an EXPLICIT sending identity (platform or practice).
   * Omitted, the identity is RESOLVED from the current scope's tenant
   * (§Phase 2): the default tenant gets exactly the pre-C27 behaviour
   * (practice envelope, NOTIFY_FROM_EMAIL, REPLY_TO_EMAIL); a non-default
   * practice sends as ITSELF or, unconfigured, not at all.
   */
  identity?: SendIdentity;
};

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.NOTIFY_FROM_EMAIL);
}

// ---------------------------------------------------------------------------
// C27-EMAIL-IDENTITY §Phase 1 — the platform's own sending identity, entirely
// from platform-level config. FAIL-CLOSED: unless every value needed for an
// honest message exists (a from, a legal entity, a postal address — law #8, a
// footer must name the party that actually sent the message — AND, per the
// Architect's 2026-09-12 correction of assumption 4, the platform's OWN
// credential: psychefolio.com lives in a SEPARATE Resend account, so the
// identity carries PLATFORM_RESEND_API_KEY), there is NO platform identity and
// platform mail records UNCONFIGURED rather than borrowing a practice's
// letterhead or the other account's key. Falling back to Valentina is the bug.
// ---------------------------------------------------------------------------
import { PLATFORM_NAME } from "@/lib/platform-host";

export type PlatformIdentity = {
  kind: "platform";
  /** The platform Resend account's key — a DIFFERENT account from RESEND_API_KEY. */
  apiKey: string;
  /** RFC 5322 from — display name + address, e.g. `Name <notifications@domain>`. */
  from: string;
  replyTo: string | null;
  legalEntity: string;
  /** P4 / ruling 96 — NULLABLE since the postal address left transactional mail.
   *  It is still REQUIRED for commercial mail, which is engage's job to enforce
   *  (lib/engage.ts), not this function's. */
  postalAddress: string | null;
};

/** P4 item 2 / ruling 94 — an envelope signs with a NAME. `Psychefolio
 *  <jacob@psychefolio.com>`, not the bare address: the bare address is the
 *  defect, not the address. Done in code rather than by asking for a variable
 *  edit, so it is deterministic and idempotent — a value that already carries a
 *  display name is passed through untouched. */
function withDisplayName(from: string, name: string): string {
  return /</.test(from) ? from.trim() : `${name} <${from.trim()}>`;
}

export function platformIdentity(): PlatformIdentity | null {
  const apiKey = process.env.PLATFORM_RESEND_API_KEY;
  const rawFrom = process.env.PLATFORM_FROM_EMAIL;
  const legalEntity = process.env.PLATFORM_LEGAL_ENTITY;
  // P4 item 3 / RULING 97'S INTERLOCK, AND THE ORDER MATTERS. This used to fail
  // closed without PLATFORM_POSTAL_ADDRESS. The postal address has now left
  // transactional envelopes (ruling 96), so if that requirement stayed while the
  // rendering went, blanking the variable would silently stop ALL platform mail
  // — including engage, which still needs it. The requirement is relaxed HERE,
  // in the same change that stops rendering it, and re-imposed where it actually
  // belongs: on COMMERCIAL mail, in lib/engage.ts.
  const postalAddress = process.env.PLATFORM_POSTAL_ADDRESS?.trim() || null;
  if (!apiKey || !rawFrom || !legalEntity) return null;
  const from = withDisplayName(rawFrom, PLATFORM_NAME);
  return {
    kind: "platform",
    apiKey,
    from,
    // Ruling 94 — reply-to is the same identity unless ops names another.
    replyTo: process.env.PLATFORM_REPLY_TO?.trim() || addressOf(from),
    legalEntity,
    postalAddress,
  };
}

export function platformEmailConfigured(): boolean {
  return platformIdentity() !== null;
}

// ---------------------------------------------------------------------------
// C27-EMAIL-IDENTITY §Phase 2 — the PRACTICE identity for every non-default
// tenant: their client hears from THEM. One verified platform sending domain
// (no per-practice DKIM), the practice as display name, the practice's own
// email as reply-to, the practice's footer. Resolved fresh per send — no
// module state, so two practices sending in one process cannot cross.
//
// FAIL-CLOSED / DEGRADE HONESTLY: a non-default practice with no configured
// practice email does NOT fall back to another practice's identity — falling
// back to Valentina is the bug. The send is skipped with a log line, exactly
// how a missing credential degrades today.
// ---------------------------------------------------------------------------
export type PracticeIdentity = {
  kind: "practice";
  /** The platform Resend account's key — the verified sending domain's account. */
  apiKey: string;
  /** `"Practice Name" <address on the platform sending domain>`. */
  from: string;
  /** The practice's own email — where replies actually go. Required. */
  replyTo: string;
  displayName: string;
  postalAddress: string | null;
};

export type SendIdentity = PlatformIdentity | PracticeIdentity;

/** `"Name" <addr>` → `addr`; a bare address → itself. */
function addressOf(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim();
}

export const PRACTICE_EMAIL_KEY = "practiceEmail";
export const PRACTICE_POSTAL_KEY = "practicePostalAddress";

/**
 * The sending identity for the CURRENT scope's tenant, resolved fresh:
 *   "default"        — the default tenant (or no scope at all): the legacy
 *                      path, byte-identical to pre-C27 behaviour.
 *   PracticeIdentity — a non-default practice with a configured email.
 *   null             — a non-default practice that CANNOT send honestly (no
 *                      practice email, or no platform sending domain). The
 *                      caller must skip, never borrow.
 * Any resolution error (including C26's TenantUnresolvedError) returns null:
 * when we do not know who is sending, nobody sends.
 */
async function resolvePracticeIdentity(): Promise<PracticeIdentity | "default" | null> {
  try {
    const { scopeTenantId, prisma } = await import("@/lib/prisma");
    const { DEFAULT_TENANT_ID } = await import("@/lib/tenancy/scope");
    // refusalExpected — SEVERITY only, same reasoning as the capture path: on
    // the platform host there is no practice to send as, this function is built
    // to return null and let the caller skip, and platform mail goes out with
    // platformIdentity() instead. The refusal is unchanged.
    const tid = await scopeTenantId({ refusalExpected: true });
    if (tid === null || tid === DEFAULT_TENANT_ID) return "default";
    const platformFrom = process.env.PLATFORM_FROM_EMAIL;
    const apiKey = process.env.PLATFORM_RESEND_API_KEY;
    if (!platformFrom || !apiKey) {
      console.info("[notify] practice send skipped — platform sending domain not configured (never borrowing another identity)");
      return null;
    }
    const { readPracticeSetting } = await import("@/lib/practice-settings");
    const emailRow = await readPracticeSetting(PRACTICE_EMAIL_KEY);
    const practiceEmail = emailRow?.value?.trim() || "";
    if (!practiceEmail) {
      console.info(`[notify] practice send skipped — tenant ${tid} has no practice email configured (never borrowing another identity)`);
      return null;
    }
    const tenantRow = await prisma.tenant.findUnique({ where: { id: tid }, select: { displayName: true } });
    const displayName = tenantRow?.displayName?.trim() || "";
    if (!displayName) {
      console.info(`[notify] practice send skipped — tenant ${tid} has no display name`);
      return null;
    }
    const postalRow = await readPracticeSetting(PRACTICE_POSTAL_KEY);
    return {
      kind: "practice",
      apiKey,
      from: `"${displayName.replaceAll('"', "'")}" <${addressOf(platformFrom)}>`,
      replyTo: practiceEmail,
      displayName,
      postalAddress: postalRow?.value?.trim() || null,
    };
  } catch (err) {
    // Also info, not error: the only way to reach here is an unresolvable host,
    // which on the platform host is expected and on a practice host is an outage
    // already shouting from every other surface. A duplicate, not a signal.
    console.info(
      "[notify] practice send skipped — no practice identity for this host (expected on the platform host):",
      err instanceof Error ? err.name : "unknown",
    );
    return null;
  }
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";
// RESEND_API_URL — testability affordance only (gates point it at a local
// sink). F1 HARDENING: IGNORED on a production RAILWAY_ENVIRONMENT_NAME
// regardless of whether it is set — a stray variable can never redirect
// credentialed outbound mail.
function resendEndpoint(): string {
  if (process.env.RAILWAY_ENVIRONMENT_NAME === "production") return RESEND_ENDPOINT;
  return process.env.RESEND_API_URL || RESEND_ENDPOINT;
}

// PLATFORM §7 — DEMO tenants are excluded from ANY real notification send:
// only fixture addresses ever receive their mail, in every environment.
export async function demoTenantSuppressed(to: string): Promise<boolean> {
  try {
    const { getTenant } = await import("@/lib/tenancy");
    const tenant = await getTenant();
    return tenant.status === "DEMO" && !to.toLowerCase().endsWith("@fixture.test");
  } catch {
    return false; // outside a request (CLI/tick) there is no demo context
  }
}

// EMAIL-SPEC §1 — staging must never email a real client. On any non-production
// Railway environment, sends are allowed only to fixture addresses and the
// comma-separated EMAIL_TEAM_ALLOWLIST.
function allowedInThisEnvironment(to: string): boolean {
  const envName = process.env.RAILWAY_ENVIRONMENT_NAME;
  if (!envName || envName === "production") return true;
  const addr = to.toLowerCase();
  if (addr.endsWith("@fixture.test")) return true;
  const team = (process.env.EMAIL_TEAM_ALLOWLIST ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return team.includes(addr);
}

export async function sendEmail(args: SendArgs): Promise<{ ok: boolean; skipped?: boolean }> {
  // §Phase 2 — no explicit identity: resolve from the current scope's tenant,
  // fresh on every send. "default" keeps the legacy path byte-identical; null
  // is an honest skip (a practice that cannot send as itself sends as no one).
  let identity: SendIdentity | undefined = args.identity;
  if (!identity) {
    const resolved = await resolvePracticeIdentity();
    if (resolved === null) return { ok: false, skipped: true };
    if (resolved !== "default") identity = resolved;
  }
  // An identity is complete by construction (it carries its OWN account's
  // credential); the default path needs exactly what it always did. Neither
  // path ever borrows the other account's key.
  const configured = identity ? true : emailConfigured();
  if (!configured) {
    console.info("[notify] email not configured — skipping send");
    return { ok: false, skipped: true };
  }
  if (!allowedInThisEnvironment(args.to)) {
    console.info("[notify] non-production environment — send suppressed (allowlist)");
    return { ok: false, skipped: true };
  }
  if (await demoTenantSuppressed(args.to)) {
    console.info("[notify] DEMO tenant — real send suppressed");
    return { ok: false, skipped: true };
  }
  try {
    // Every email ships branded HTML + the plain-text part.
    const envelope: EnvelopeInput = {
      locale: args.envelope?.locale ?? "en",
      heading: args.envelope?.heading ?? args.subject,
      paragraphs:
        args.envelope?.paragraphs ??
        args.text
          .split(/\n{2,}/)
          .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
          .filter(Boolean),
      preheader: args.envelope?.preheader,
      note: args.envelope?.note,
      button: args.envelope?.button,
      whisper: args.envelope?.whisper,
      signoff: args.envelope?.signoff,
      textExtra: args.envelope?.textExtra,
      // C23-ENGAGE — marketing follow-up carries a working unsubscribe link;
      // transactional mail passes nothing here and renders exactly as before.
      unsubscribe: args.envelope?.unsubscribe,
    };
    // C27 — the identity picks the ENVELOPE as well as the addresses: platform
    // mail composes in the platform envelope, a non-default practice's mail in
    // ITS OWN envelope, and the default path renders byte-identically to
    // pre-C27 (the exact legacy envelope).
    const rendered = identity
      ? identity.kind === "platform"
        ? (await import("@/emails/platform-envelope")).renderPlatformEnvelope(envelope, identity)
        : (await import("@/emails/practice-envelope")).renderPracticeEnvelope(envelope, identity)
      : renderEnvelope(envelope);

    const from = identity ? identity.from : process.env.NOTIFY_FROM_EMAIL;
    const replyTo = identity ? identity.replyTo : process.env.REPLY_TO_EMAIL || null;
    const res = await fetch(resendEndpoint(), {
      method: "POST",
      headers: {
        // Per-identity credential (assumption-4 correction): each identity
        // authenticates with its OWN account's key — never another's.
        Authorization: `Bearer ${identity ? identity.apiKey : process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        ...(replyTo ? { reply_to: replyTo } : {}),
        to: args.to,
        subject: args.subject,
        text: args.envelope ? rendered.text : args.text,
        html: rendered.html,
        attachments: args.attachments?.map((a) => ({
          filename: a.filename,
          // Resend expects base64 content for attachments.
          content: a.contentBase64 ?? Buffer.from(a.content ?? "", "utf8").toString("base64"),
          contentType: a.contentType,
        })),
      }),
    });
    if (!res.ok) {
      console.error(`[notify] send failed: ${res.status}`);
      return { ok: false };
    }
    return { ok: true };
  } catch (err) {
    console.error("[notify] send threw", err instanceof Error ? err.message : "unknown");
    return { ok: false };
  }
}
