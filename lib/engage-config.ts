import { createHmac, timingSafeEqual } from "crypto";

// C23-ENGAGE — the PURE half of follow-up: locales, merge-field vocabulary,
// the two switch keys, URL builders, and the unsubscribe token. Same discipline
// as lib/signup-config.ts / lib/capture-config.ts / lib/referral-config.ts: NO
// database import anywhere in this module's graph, so the public /unsubscribe
// screen can verify a token without dragging the data layer behind it
// (C18 §2, the public wall).

export const ENGAGE_LOCALES = ["en", "es"] as const;
export type EngageLocale = (typeof ENGAGE_LOCALES)[number];

/** Verify item 6 — a prospect with NO recorded locale gets a defined default,
 *  never an empty string and never a crash. English, matching the public
 *  surface's own fallback (ruling 1). */
export const DEFAULT_ENGAGE_LOCALE: EngageLocale = "en";

export function engageLocale(raw: string | null | undefined): EngageLocale {
  const v = (raw ?? "").trim().toLowerCase().slice(0, 5);
  const base = v.split(/[-_]/)[0];
  return (ENGAGE_LOCALES as readonly string[]).includes(base)
    ? (base as EngageLocale)
    : DEFAULT_ENGAGE_LOCALE;
}

// ---------------------------------------------------------------------------
// Merge fields — §3, deliberately CLOSED. First name, referral code, signup
// URL, portal URL. Nothing else may appear in a template: no invented claims
// about the product, no testimonials, no metrics, no numbers we cannot stand
// behind. `unsubscribeUrl` is the fifth and last, and it is STRUCTURAL — the
// renderer appends the unsubscribe line to every message, so no template can
// omit it by being edited carelessly.
// ---------------------------------------------------------------------------
export const MERGE_FIELDS = ["firstName", "referralCode", "signupUrl", "portalUrl", "unsubscribeUrl"] as const;
export type MergeField = (typeof MERGE_FIELDS)[number];
export type MergeVars = Record<MergeField, string>;

/** Every `{placeholder}` in a string. Verify item 1 uses this to prove no step
 *  references a merge field that does not exist. */
export function placeholdersIn(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
}

// ---------------------------------------------------------------------------
// The switches (law #10). TWO of them, both readable without a deploy:
//   · engageEnabled — the FEATURE GATE. Default CLOSED: an automated mailer
//     does not start sending because code shipped. It is opened deliberately,
//     once (a PracticeSetting row, or ENGAGE_ENABLED in the environment).
//   · engagePaused  — the GLOBAL PAUSE / kill-switch. A single row Jacob can
//     write with no deploy at all, and it beats the gate every time.
// Both are checked on EVERY step, so closing either one stops the whole engine
// mid-run rather than at the next restart.
// ---------------------------------------------------------------------------
export const ENGAGE_ENABLED_KEY = "engageEnabled";
export const ENGAGE_PAUSED_KEY = "engagePaused";

function envOn(value: string | undefined): boolean {
  return ["1", "true", "on", "yes"].includes((value ?? "").trim().toLowerCase());
}

export function engageEnvEnabled(): boolean {
  return envOn(process.env.ENGAGE_ENABLED);
}
export function engageEnvPaused(): boolean {
  return envOn(process.env.ENGAGE_PAUSED);
}

/** The reasons recorded on a ledger row. Fixed strings so the admin view, the
 *  gate and the audit trail all read the same vocabulary. */
export const REASONS = {
  gateClosed: "engine-gate-closed",
  paused: "globally-paused",
  sequenceOff: "sequence-gated-off",
  unsubscribed: "prospect-unsubscribed",
  unconfigured: "email-not-configured",
  sendFailed: "transport-refused",
  sent: "delivered-to-transport",
} as const;

// ---------------------------------------------------------------------------
// URLs. The platform apex is preferred over any one practice's subdomain — a
// practitioner's follow-up is from the PLATFORM, not from another tenant's
// portal. Same precedence lib/referral-config.ts uses.
// ---------------------------------------------------------------------------
export function platformBase(origin?: string): string {
  const base = process.env.PLATFORM_DOMAIN
    ? `https://${process.env.PLATFORM_DOMAIN}`
    : (process.env.PUBLIC_APP_URL ?? origin ?? "");
  return base.replace(/\/+$/, "");
}

export function engageSignupUrl(code: string | null | undefined, origin?: string): string {
  const qs = new URLSearchParams({ src: "engage" });
  if (code) qs.set("ref", code);
  return `${platformBase(origin)}/signup?${qs.toString()}`;
}

/** Their own practice's front door, once they own one. */
export function engagePortalUrl(slug: string | null | undefined, origin?: string): string {
  if (slug && process.env.PLATFORM_DOMAIN) return `https://${slug}.${process.env.PLATFORM_DOMAIN}`;
  return platformBase(origin) || "/";
}

export function engageUnsubscribeUrl(token: string, origin?: string): string {
  return `${platformBase(origin)}/unsubscribe/${token}`;
}

// ---------------------------------------------------------------------------
// The unsubscribe token — §6: unguessable and SINGLE-PURPOSE.
//
// Derived, not stored: `<prospectId>.<HMAC>` where the HMAC is keyed on
// AUTH_SECRET and domain-separated by a literal purpose string. So it
//   · cannot be guessed (the signature is 32 base64url chars of SHA-256),
//   · cannot be replayed against any other feature (the purpose is in the MAC),
//   · needs no token column and no expiry bookkeeping — an unsubscribe link
//     that stopped working after 30 days would be a consent failure, not a
//     security feature.
// A forged or unknown token fails verification and unsubscribes nobody.
// ---------------------------------------------------------------------------
const PURPOSE = "engage-unsubscribe-v1";

function secret(): string {
  // AUTH_SECRET is required for the app to run at all; the fallback exists so
  // that a token can still be MINTED in a unit context without one, and it is
  // deliberately not a usable key anywhere real.
  return process.env.AUTH_SECRET ?? "engage-unsubscribe-no-secret";
}

export function unsubscribeToken(prospectId: string): string {
  const mac = createHmac("sha256", secret())
    .update(`${PURPOSE}:${prospectId}`)
    .digest("base64url")
    .slice(0, 32);
  return `${prospectId}.${mac}`;
}

/** The prospect id a VALID token names, or null. Never throws, whatever arrives
 *  in the URL. */
export function prospectIdFromToken(token: string | null | undefined): string | null {
  const raw = (token ?? "").trim();
  if (!raw || raw.length > 200) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0 || dot === raw.length - 1) return null;
  const id = raw.slice(0, dot);
  const given = raw.slice(dot + 1);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || !/^[A-Za-z0-9_-]{1,64}$/.test(given)) return null;
  const expected = unsubscribeToken(id).slice(id.length + 1);
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? id : null;
}
