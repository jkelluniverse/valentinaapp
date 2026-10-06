// C23-REFERRAL — the PURE half of attribution: shapes, normalisation, and the
// share URL. Same discipline as lib/signup-config.ts and lib/capture-config.ts:
// no database import anywhere in this module's graph, so the public surface and
// the write paths can both import it without dragging the data layer behind
// them (C18 §2, the public wall).

/** A plausible referral code. Deliberately a charset/length sanity check
 *  rather than a copy of the issuing alphabet: a code that got here is either
 *  in the ledger or it is not, and the DATABASE is the authority on that. This
 *  only short-circuits obvious garbage before it costs a query. */
export const REFERRAL_CODE_RE = /^[A-Za-z0-9]{6,32}$/;

/** Codes are issued uppercase; a code typed off a phone screen may not be.
 *  Normalisation is for LOOKUP only — the raw code is still stored as given
 *  (C23-REFERRAL §1: an unknown code is stored verbatim and attributes to
 *  nobody, because losing a signup to a typo is the worse failure). */
export function normalizeReferralCode(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (!REFERRAL_CODE_RE.test(v)) return null; // malformed → never resolves, never an error
  return v.toUpperCase();
}

/** §1 integrity rule: a prospect's own code must NEVER attribute to themselves.
 *  Case-insensitive, because the comparison must not be defeated by casing. */
export function isSelfReferral(
  submitted: string | null | undefined,
  ownCode: string | null | undefined,
): boolean {
  const a = (submitted ?? "").trim().toUpperCase();
  const b = (ownCode ?? "").trim().toUpperCase();
  return Boolean(a && b && a === b);
}

/**
 * The link a referrer hands to the next practitioner. Prefers the platform
 * apex when it is configured (a founding partner's own portal subdomain is not
 * where a stranger should be sent), and falls back to the request origin.
 */
export function referralJoinUrl(code: string, origin?: string): string {
  const base = process.env.PLATFORM_DOMAIN
    ? `https://${process.env.PLATFORM_DOMAIN}`
    : (origin ?? "");
  const path = `/join?ref=${encodeURIComponent(code)}`;
  return base ? `${base.replace(/\/+$/, "")}${path}` : path;
}

/** First name only — what a referrer is shown about the people who came in on
 *  their code (§3). Not a contact list, and never a surname. */
export function firstNameOf(name: string | null | undefined): string {
  const v = (name ?? "").trim();
  if (!v) return "";
  return v.split(/\s+/)[0].slice(0, 40);
}
