import { rawPrisma } from "@/lib/prisma-internal";
import { decryptToken, hashIngressToken } from "./connection";
import { verifyCalendly, calendlyOwner, normaliseCalendly } from "./calendly";
import { verifyAcuity, normaliseAcuity } from "./acuity";
import { applyBooking, withIdempotency, recordSuccess, recordFailure, type IngestResult } from "./ingest";
import type { NormalisedBooking } from "./types";

// C37 §5 — the two ingresses. Deliberately NOT unified onto one mechanism:
//
//   CALENDLY — ONE shared URL. Its payload names the owning user/organization,
//     so the payload itself attributes the event to a tenant (ruling 195).
//
//   ACUITY — a PER-CONNECTION URL path (ruling 196). Its webhook body carries no
//     account identifier at all, so a shared URL has nothing to attribute by.
//     The path SELECTS WHICH KEY TO VERIFY AGAINST. It does not grant trust:
//     a correct path with a bad signature is REFUSED. Ruling 195 is unamended —
//     the request host is still never consulted.
//
// Both resolve the tenant BEFORE trusting anything, then verify, then apply.

/** Shared by both providers: a connection must be live, and its tenant must be
 *  set. A row with a null tenantId cannot be attributed, so it is refused
 *  rather than defaulted — the P5 discipline, applied at a new boundary. */
type Resolved = { connectionId: string; tenantId: string; credential: string; signingKey: string | null };

function usable(row: {
  id: string;
  tenantId: string | null;
  status: string;
  credentialEnc: string;
  signingKeyEnc: string | null;
}): Resolved | null {
  if (!row.tenantId) return null;
  if (row.status === "DISCONNECTED") return null;
  try {
    return {
      connectionId: row.id,
      tenantId: row.tenantId,
      credential: decryptToken(row.credentialEnc),
      signingKey: row.signingKeyEnc ? decryptToken(row.signingKeyEnc) : null,
    };
  } catch {
    // An unreadable credential is unambiguous breakage (ruling 197): the key
    // changed, or the ciphertext is corrupt. Either way nothing can verify.
    return null;
  }
}

async function practitionerFor(tenantId: string): Promise<string | null> {
  const p = await rawPrisma.user.findFirst({
    where: { tenantId, role: "PRACTITIONER" },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  return p?.id ?? null;
}

async function applyResolved(
  resolved: Resolved,
  booking: NormalisedBooking,
  layer: string,
): Promise<IngestResult> {
  const practitionerId = await practitionerFor(resolved.tenantId);
  if (!practitionerId) {
    await recordFailure(resolved.connectionId, "no practitioner on this tenant");
    return { status: 200, note: "no practitioner for tenant — acknowledged and dropped" };
  }
  const result = await withIdempotency(booking.idempotencyKey, layer, () =>
    applyBooking(booking, resolved.tenantId, practitionerId),
  );
  await recordSuccess(resolved.connectionId);
  return result;
}

export async function ingestCalendlyEvent(
  headers: Record<string, string>,
  rawBody: string,
): Promise<IngestResult> {
  // ATTRIBUTION FIRST, from the payload — never the host. The owner uri picked
  // out of the body selects the connection, and therefore the signing key.
  const owner = calendlyOwner(rawBody);
  if (!owner) return { status: 200, note: "no resolvable owner in payload — dropped" };

  const row = await rawPrisma.externalSchedulingConnection.findFirst({
    where: { provider: "calendly", externalOwner: owner },
  });
  if (!row) return { status: 200, note: "unmatched owner — acknowledged and dropped" };
  const resolved = usable(row);
  if (!resolved) return { status: 200, note: "connection unusable — dropped" };
  if (!resolved.signingKey) {
    await recordFailure(resolved.connectionId, "no signing key stored");
    return { status: 200, note: "no signing key — dropped" };
  }

  const v = verifyCalendly(rawBody, headers["calendly-webhook-signature"] ?? null, resolved.signingKey);
  if (!v.ok) {
    // A signature that will not verify is unambiguous breakage — the one class
    // of thing ruling 197 still says to flag.
    await recordFailure(resolved.connectionId, `signature ${v.reason}`);
    return { status: 403, note: `signature ${v.reason}` };
  }

  const booking = normaliseCalendly(rawBody);
  if (!booking) return { status: 200, note: "unhandled event type — ignored" };
  return applyResolved(resolved, booking, "calendly");
}

export async function ingestAcuityEvent(
  rawToken: string,
  headers: Record<string, string>,
  rawBody: string,
): Promise<IngestResult> {
  // RULING 196 — the path SELECTS the connection. Looked up by HASH, because
  // the raw token is never stored (the agreement-link precedent).
  const row = await rawPrisma.externalSchedulingConnection.findUnique({
    where: { ingressTokenHash: hashIngressToken(rawToken) },
  });
  // An unknown path is refused outright. It is not a delivery for a tenant we
  // failed to match — it is a request for a connection that does not exist.
  if (!row || row.provider !== "acuity") return { status: 404, note: "unknown ingress path" };
  const resolved = usable(row);
  if (!resolved) return { status: 200, note: "connection unusable — dropped" };

  // ...AND THE SIGNATURE IS STILL VERIFIED. Knowing the URL is not authority.
  const v = verifyAcuity(rawBody, headers["x-acuity-signature"] ?? null, resolved.credential);
  if (!v.ok) {
    await recordFailure(resolved.connectionId, `signature ${v.reason}`);
    return { status: 403, note: `signature ${v.reason}` };
  }

  const booking = normaliseAcuity(rawBody, resolved.connectionId);
  if (!booking) return { status: 200, note: "unhandled action — ignored" };
  return applyResolved(resolved, booking, "acuity");
}
