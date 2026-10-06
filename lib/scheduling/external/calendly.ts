import { createHmac, timingSafeEqual } from "crypto";
import type { NormalisedBooking, VerifyResult } from "./types";

// CALENDLY — the provider that does NOT need ruling 196.
//
// Its payload carries the owning user/organization URI, so a SINGLE shared
// webhook URL can attribute a delivery to a tenant from the BODY alone. That is
// ruling 195 satisfied in its strongest form, and it is why Calendly keeps the
// shared URL rather than being unified onto Acuity's path mechanism for
// symmetry: payload-based attribution is strictly better and should stay.
//
// Signature: header `Calendly-Webhook-Signature: t=<unix>,v1=<hex>`, HMAC-SHA256
// over `${t}.${rawBody}` using THAT SUBSCRIPTION's signing key. Verified against
// Calendly's published scheme on 2026-09-28.

/** Replay window. A delivery older than this is refused even if it signs. */
const TOLERANCE_S = 5 * 60;

export function verifyCalendly(rawBody: string, header: string | null, signingKey: string, nowMs = Date.now()): VerifyResult {
  if (!header) return { ok: false, reason: "no-signature" };
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=").map((x) => x.trim())) as [string, string][]);
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return { ok: false, reason: "no-signature" };
  if (Math.abs(nowMs / 1000 - Number(t)) > TOLERANCE_S) return { ok: false, reason: "stale" };

  const expected = createHmac("sha256", signingKey).update(`${t}.${rawBody}`).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(v1, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "bad-signature" };
  return { ok: true };
}

type CalendlyBody = {
  event?: string;
  created_at?: string;
  payload?: {
    uri?: string;
    email?: string;
    name?: string;
    text_reminder_number?: string | null;
    cancel_url?: string;
    questions_and_answers?: { question?: string; answer?: string }[];
    scheduled_event?: {
      uri?: string;
      start_time?: string;
      end_time?: string;
      event_memberships?: { user?: string }[];
    };
  };
};

/** RULING 195 — the tenant key comes from the BODY. Never the request host. */
export function calendlyOwner(rawBody: string): string | null {
  try {
    const b = JSON.parse(rawBody) as CalendlyBody;
    return b.payload?.scheduled_event?.event_memberships?.[0]?.user ?? null;
  } catch {
    return null;
  }
}

export function normaliseCalendly(rawBody: string): NormalisedBooking | null {
  let b: CalendlyBody;
  try { b = JSON.parse(rawBody) as CalendlyBody; } catch { return null; }
  const ev = b.event ?? "";
  const action = ev === "invitee.created" ? "scheduled" : ev === "invitee.canceled" ? "canceled" : null;
  if (!action) return null;

  const se = b.payload?.scheduled_event;
  // The SCHEDULED EVENT's uri is the booking identity, not the invitee's — a
  // reschedule keeps the event and replaces the invitee, so keying on the
  // invitee would create a second appointment instead of moving the first.
  const externalId = se?.uri ?? b.payload?.uri ?? null;
  if (!externalId) return null;

  const qa = b.payload?.questions_and_answers ?? [];
  // C42 §3 — ONE shape for every writer of Lead.intakeAnswers: { key: { q, a } }.
  // Calendly's answers have no fieldId of hers, so they are keyed `ext:<n>` and
  // can never collide with her own form's keys; `q` is the question as Calendly
  // asked it (Rule 0.8 — the stored answer says what was asked, verbatim).
  const intakeAnswers = qa.length
    ? Object.fromEntries(qa.map((q, i) => [`ext:${i + 1}`, { q: q.question || `Question ${i + 1}`, a: q.answer ?? "" }]))
    : null;

  return {
    provider: "calendly",
    externalId,
    action,
    startAt: se?.start_time ? new Date(se.start_time) : null,
    endAt: se?.end_time ? new Date(se.end_time) : null,
    invitee: {
      name: b.payload?.name ?? null,
      email: b.payload?.email ?? null,
      phone: b.payload?.text_reminder_number ?? null,
    },
    intakeAnswers,
    // Calendly gives no delivery id, but (event + booking uri + created_at) is
    // stable across its retries of the SAME event and distinct between a
    // creation and a cancellation of the same booking.
    idempotencyKey: `calendly:${ev}:${externalId}:${b.created_at ?? ""}`,
    occurredAt: b.created_at ? new Date(b.created_at) : new Date(),
    raw: b,
  };
}
