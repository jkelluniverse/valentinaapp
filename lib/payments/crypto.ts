import { createCipheriv, createDecipheriv, randomBytes, createHmac, timingSafeEqual } from "crypto";

// CLAUDE-BILLING Rule 0.8 — tokens are credentials. AES-256-GCM at rest,
// key from PAYMENT_TOKEN_ENC_KEY (64 hex chars = 32 bytes), decrypted only
// in server memory at call time. Never logged, never sent to the browser.

function key(): Buffer {
  const raw = process.env.PAYMENT_TOKEN_ENC_KEY;
  if (!raw) throw new Error("PAYMENT_TOKEN_ENC_KEY is not set");
  const buf = Buffer.from(raw, "hex");
  if (buf.length !== 32) throw new Error("PAYMENT_TOKEN_ENC_KEY must be 64 hex chars (32 bytes)");
  return buf;
}

export function encryptToken(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64")}.${ct.toString("base64")}.${tag.toString("base64")}`;
}

export function decryptToken(enc: string): string {
  const [v, ivB64, ctB64, tagB64] = enc.split(".");
  if (v !== "v1" || !ivB64 || !ctB64 || !tagB64) throw new Error("unrecognized token ciphertext format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}

// OAuth `state`: HMAC-signed nonce bound to the tenant (CSRF protection on
// the callback). Format: tenantId.expiresMs.nonce.signature — all base64url.
const stateSecret = () => process.env.AUTH_SECRET || "dev-secret";
const b64u = (s: string | Buffer) => Buffer.from(s).toString("base64url");

export function signState(tenantId: string, ttlMs = 15 * 60_000): string {
  const body = `${b64u(tenantId)}.${Date.now() + ttlMs}.${randomBytes(12).toString("base64url")}`;
  const sig = createHmac("sha256", stateSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyState(state: string): { tenantId: string } | null {
  const parts = state.split(".");
  if (parts.length !== 4) return null;
  const body = parts.slice(0, 3).join(".");
  const expect = createHmac("sha256", stateSecret()).update(body).digest();
  const got = Buffer.from(parts[3], "base64url");
  if (expect.length !== got.length || !timingSafeEqual(expect, got)) return null;
  if (Date.now() > Number(parts[1])) return null;
  return { tenantId: Buffer.from(parts[0], "base64url").toString("utf8") };
}
