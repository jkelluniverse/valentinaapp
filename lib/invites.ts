import { createHash, randomBytes } from "crypto";

// Invite tokens: 256-bit CSPRNG. We hand the RAW token to the practitioner
// (in the link) exactly once and only ever persist its SHA-256 hash.
export function generateInviteToken() {
  const raw = randomBytes(32).toString("base64url");
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

export const INVITE_TTL_DAYS = 7;

export function inviteExpiry(from: Date = new Date()) {
  return new Date(from.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}
