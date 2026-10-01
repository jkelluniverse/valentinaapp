// C37-EXTERNAL-SCHEDULING — the seam (ruling 192).
//
// A provider contributes exactly three things: a way to VERIFY a delivery, a way
// to NORMALISE it, and a way to ATTRIBUTE it to a tenant. Everything after that
// is shared. A third provider costs a normaliser, a verifier and a connect form
// — PROVIDED it can identify its tenant. If it cannot, it costs whatever ruling
// 196 cost for Acuity, and that is the question to ask about a new provider
// FIRST, before any of the rest.

export type ExternalProvider = "calendly" | "acuity";

/** The normalised event. Every provider shape collapses to this. */
export type NormalisedBooking = {
  provider: ExternalProvider;
  /** The provider's own id for the booking — half of the reconciliation key. */
  externalId: string;
  action: "scheduled" | "rescheduled" | "canceled";
  startAt: Date | null;
  endAt: Date | null;
  invitee: {
    name: string | null;
    email: string | null;
    phone: string | null;
  };
  /** RULING 193 — what they typed into the PROVIDER's questions. Stored and
   *  shown; never evidence until the practitioner promotes it. */
  intakeAnswers: Record<string, unknown> | null;
  /** The idempotency key. Calendly supplies an event id; Acuity does NOT, so
   *  its key is synthesised — see acuity.ts for why that matters. */
  idempotencyKey: string;
  occurredAt: Date;
  raw: unknown;
};

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "no-signature" | "bad-signature" | "stale" };
