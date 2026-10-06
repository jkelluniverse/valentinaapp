import { createHash, randomBytes } from "crypto";
import { encryptToken, decryptToken } from "@/lib/payments/crypto";

// C37 — connection secrets.
//
// Credentials reuse the payments encryption discipline verbatim (AES-256-GCM
// under PAYMENT_TOKEN_ENC_KEY) and inherit its warning: ONCE CREDENTIALS EXIST
// THAT KEY MUST NEVER CHANGE, or every connection becomes undecryptable and
// every practitioner must reconnect from scratch.

export { encryptToken, decryptToken };

/** RULING 196's ingress token. Cryptographically random, and STORED HASHED —
 *  matching the agreement-link precedent ("store the SHA-256 hash, NEVER the
 *  raw token"). The practitioner sees it once, at connect time, because it goes
 *  into the provider's dashboard and nowhere else. */
export function newIngressToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashIngressToken(raw) };
}

export function hashIngressToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** The URL a practitioner pastes into Acuity. Built from the PLATFORM domain —
 *  never from a request, so it cannot inherit a caller's host (ruling 172). */
export function acuityIngressUrl(rawToken: string): string {
  const domain = process.env.PLATFORM_DOMAIN;
  return domain ? `https://${domain}/api/webhooks/acuity/${rawToken}` : `/api/webhooks/acuity/${rawToken}`;
}
