import { mkdirSync, writeFileSync, readFileSync, unlinkSync, existsSync } from "fs";
import { dirname, join } from "path";
import { createHmac, timingSafeEqual, randomBytes } from "crypto";

// SESSION-PIPELINE — object storage behind an adapter. Driver is env-chosen:
//   local (default): a directory on the Railway volume (AUDIO_STORAGE_DIR).
//   s3:              R2/S3-compatible — the open storage decision; wire the
//                    credentials when Jacob picks, no call-site changes.
// Audio never gets a public URL: external readers (the transcription
// provider) receive a time-limited HMAC-signed link into our own streaming
// route. Encryption in transit is TLS; at rest is the volume/bucket.

export type StoredObject = { key: string };

const driver = () => process.env.STORAGE_DRIVER ?? "local";
const localDir = () => process.env.AUDIO_STORAGE_DIR ?? join(process.cwd(), ".data/audio");

export function putObject(key: string, bytes: Buffer): StoredObject {
  if (driver() === "local") {
    const path = join(localDir(), key);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, bytes);
    return { key };
  }
  throw new Error(`storage driver "${driver()}" not configured yet (s3/R2 is the planned second driver)`);
}

export function getObject(key: string): Buffer | null {
  if (driver() === "local") {
    const path = join(localDir(), key);
    return existsSync(path) ? readFileSync(path) : null;
  }
  throw new Error(`storage driver "${driver()}" not configured yet`);
}

export function deleteObject(key: string): void {
  if (driver() === "local") {
    const path = join(localDir(), key);
    if (existsSync(path)) unlinkSync(path);
    return;
  }
  throw new Error(`storage driver "${driver()}" not configured yet`);
}

export function newAudioKey(tenantId: string, ext: string): string {
  const d = new Date();
  return `${tenantId}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${randomBytes(12).toString("hex")}.${ext}`;
}

// Signed, expiring access tokens for the audio streaming route.
const secret = () => process.env.AUTH_SECRET || "dev-secret";

export function signAudioToken(captureId: string, ttlMs = 6 * 3600_000): string {
  const body = `${captureId}.${Date.now() + ttlMs}`;
  const sig = createHmac("sha256", secret()).update(`audio:${body}`).digest("base64url");
  return `${Buffer.from(body).toString("base64url")}.${sig}`;
}

export function verifyAudioToken(token: string, captureId: string): boolean {
  const [bodyB64, sig] = token.split(".");
  if (!bodyB64 || !sig) return false;
  const body = Buffer.from(bodyB64, "base64url").toString("utf8");
  const expect = createHmac("sha256", secret()).update(`audio:${body}`).digest();
  const got = Buffer.from(sig, "base64url");
  if (expect.length !== got.length || !timingSafeEqual(expect, got)) return false;
  const [id, exp] = body.split(".");
  return id === captureId && Date.now() < Number(exp);
}
