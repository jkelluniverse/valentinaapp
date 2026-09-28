import { createHmac, timingSafeEqual } from "crypto";
import type { NormalisedBooking, VerifyResult } from "./types";

// ACUITY — the provider that FORCED ruling 196.
//
// Its webhook body is `action`, `id`, `calendarID`, `appointmentTypeID` and
// NOTHING ELSE. There is no account id, so a single shared URL cannot attribute
// a delivery to a tenant; and the signature is HMAC-SHA256 over the body using
// THAT ACCOUNT'S OWN API KEY, so you need the tenant to verify and the payload
// cannot tell you the tenant. A chicken-and-egg one shared URL cannot break.
//
// RULING 196's resolution: a per-connection URL PATH carrying an opaque token.
// THE PATH SELECTS THE KEY; IT DOES NOT GRANT TRUST. A forged path with a wrong
// signature is refused exactly as a forged payload is, and the token is stored
// hashed, rotatable, and invalidated on disconnect.
//
// Ruling 195 stands unamended: tenancy never comes from the request HOST. A
// per-connection secret path is not a host — and unlike Square's single global
// callback, every practitioner registers their own.
//
// Signature: base64 HMAC-SHA256 of the raw body, header `x-acuity-signature`.
// Verified against Acuity's published scheme on 2026-09-28.

export function verifyAcuity(rawBody: string, header: string | null, apiKey: string): VerifyResult {
  if (!header) return { ok: false, reason: "no-signature" };
  const expected = createHmac("sha256", apiKey).update(rawBody).digest("base64");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(header, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "bad-signature" };
  return { ok: true };
}

/**
 * Acuity posts form-encoded, not JSON.
 * `action` is one of scheduled | rescheduled | canceled | changed | order.completed.
 */
export function normaliseAcuity(rawBody: string, connectionId: string, nowMs = Date.now()): NormalisedBooking | null {
  const p = new URLSearchParams(rawBody);
  const rawAction = p.get("action") ?? "";
  const id = p.get("id");
  if (!id) return null;

  const action =
    rawAction === "appointment.scheduled" || rawAction === "scheduled" ? "scheduled"
    : rawAction === "appointment.rescheduled" || rawAction === "rescheduled" ? "rescheduled"
    : rawAction === "appointment.canceled" || rawAction === "canceled" ? "canceled"
    : null;
  if (!action) return null;

  return {
    provider: "acuity",
    externalId: id,
    action,
    // Acuity's webhook carries NO times — only ids. The times are fetched from
    // its API in a second call, which is why the ingest step treats null times
    // as "look it up" rather than "no appointment".
    startAt: null,
    endAt: null,
    invitee: { name: null, email: null, phone: null },
    intakeAnswers: null,
    // ⛔ ACUITY GIVES NO EVENT ID, so the idempotency key is SYNTHESISED.
    //
    // The ACTION is part of it deliberately: without it a reschedule and a
    // cancel of the same appointment share `id`, and the second delivery would
    // be swallowed as a duplicate — leaving a cancelled booking showing as
    // scheduled. That is data corruption, not untidiness.
    //
    // THE CLOCK IS DELIBERATELY *NOT* PART OF IT. An earlier draft of this file
    // appended the current second, which gave every retry of one delivery a
    // different key and made the lock inert — the exact opposite of its purpose.
    //
    // What this key cannot do: distinguish a RETRY of one reschedule from a
    // GENUINE second reschedule, because Acuity's two bodies are byte-identical.
    // Nothing is corrupted by that today, because a body with no times applies
    // nothing and releases its claim (see ingest.ts). It becomes a live question
    // the moment the API enrichment hop is built, and the answer then is to key
    // on the ENRICHED state (the appointment's current start time), not on time
    // of arrival.
    idempotencyKey: `acuity:${connectionId}:${action}:${id}`,
    occurredAt: new Date(nowMs),
    raw: Object.fromEntries(p.entries()),
  };
}
