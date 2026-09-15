import { createHmac, timingSafeEqual } from "crypto";

// C18 §4.5 — signed links for the public reschedule/cancel page. A prospect has
// no account, so the confirmation email carries a self-authenticating token:
// `<payload>.<hmac>`, where the HMAC is keyed on the server secret. Tamper with
// the payload and the signature no longer verifies. No expiry beyond the
// appointment itself (the page re-checks the appointment is still live).

function secret(): string {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "dev-insecure-secret";
}

function hmac(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

// Sign an opaque payload (here: an appointment id). Returns `payload.signature`.
export function signToken(payload: string): string {
  return `${payload}.${hmac(payload)}`;
}

// Verify and return the payload, or null if the token is malformed or forged.
export function verifyToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = hmac(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? payload : null;
}
