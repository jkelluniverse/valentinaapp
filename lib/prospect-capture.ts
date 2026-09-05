import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { CAPS, DEFAULT_SOURCE, EMAIL_RE } from "@/lib/capture-config";

// C23-CAPTURE §2 — the event floor's service layer. (Named prospect-capture
// because lib/capture.ts is the SESSION pipeline's capture service — a
// different thing entirely and not touched by this build.) Every check here is
// SERVER-SIDE and authoritative; the form's own validation is a courtesy.
//
// Why the SCOPED client is the right one here (unlike lib/signup.ts, which is
// allowlisted for the raw client): capture creates no tenant and reads no
// global uniqueness. `PractitionerProspect` is platform-level — deliberately
// outside SCOPED_MODEL_SET (C23-SIGNUP ruling) — so the scoped client passes
// those calls straight through, while the AuditEvent it writes gets stamped
// with the request's own tenant. Nothing is cross-tenant, so nothing needs an
// allowlist entry.
//
// What a capture is NOT: it is not a signup. It never provisions, never touches
// a tenant, and never moves a prospect who already owns a practice back to LEAD.

export type CaptureRefusal = "missing" | "email" | "rate" | "failed";

export type CaptureInput = {
  name: string;
  email: string;
  phone?: string | null;
  practiceName?: string | null;
  note?: string | null;
  source?: string | null;
  referredByCode?: string | null;
};

export type CaptureResult =
  | { ok: true; email: string; referralCode: string; created: boolean }
  | { ok: false; reason: CaptureRefusal };

function cap(value: string | null | undefined, max: number): string | null {
  const v = (value ?? "").trim();
  return v ? v.slice(0, max) : null;
}

function newReferralCode(): string {
  // Same Crockford-ish alphabet as C23-SIGNUP: no I/O/0/1/L/U, so a code read
  // aloud across a conference table survives the trip.
  const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
  const bytes = randomBytes(8);
  let out = "";
  for (let i = 0; i < 8; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

async function issueReferralCode(): Promise<string> {
  for (let i = 0; i < 12; i++) {
    const code = newReferralCode();
    const clash = await prisma.practitionerProspect.findFirst({
      where: { referralCode: code },
      select: { id: true },
    });
    if (!clash) return code;
  }
  throw new Error("could not issue a unique referral code");
}

export async function captureProspect(input: CaptureInput): Promise<CaptureResult> {
  // 1 — validation. Name and email required; everything else optional and capped.
  const name = (input.name ?? "").trim().slice(0, CAPS.name);
  const email = (input.email ?? "").trim().toLowerCase().slice(0, CAPS.email);
  if (!name || !email) return { ok: false, reason: "missing" };
  if (!EMAIL_RE.test(email)) return { ok: false, reason: "email" };

  const phone = cap(input.phone, CAPS.phone);
  const practiceName = cap(input.practiceName, CAPS.practiceName);
  const note = cap(input.note, CAPS.note);
  const source = cap(input.source, CAPS.source) ?? DEFAULT_SOURCE;
  const referredByCode = cap(input.referredByCode, CAPS.referredByCode);

  try {
    // 2 — upsert by lowercased email. The three invariants, in order:
    //   · a SIGNED_UP prospect is NEVER downgraded to LEAD, and never loses
    //     its tenantId/convertedAt — someone who already owns a practice and
    //     later fills the form at the event keeps their practice.
    //   · the FIRST referredByCode wins; a later empty visit does not erase it.
    //   · referralCode is issued once and never reissued.
    const prior = await prisma.practitionerProspect.findUnique({ where: { email } });
    const referralCode = prior?.referralCode ?? (await issueReferralCode());

    const prospect = await prisma.practitionerProspect.upsert({
      where: { email },
      create: {
        name,
        email,
        phone,
        practiceName,
        note,
        status: "LEAD",
        source,
        referredByCode,
        referralCode,
      },
      update: {
        name,
        // Optional fields update only when this submission actually carried
        // one — a hurried second pass must not blank a phone number.
        ...(phone ? { phone } : {}),
        ...(practiceName ? { practiceName } : {}),
        ...(note ? { note } : {}),
        ...(input.source ? { source } : {}),
        ...(prior?.referredByCode ? {} : referredByCode ? { referredByCode } : {}),
        // status / tenantId / convertedAt / referralCode: deliberately absent.
      },
    });

    // 3 — the audit row. Metadata only (law #6): who/what/where-from, never the
    // note body, never the phone number. actorId is the prospect's own row —
    // capture has no signed-in actor, and the row is what acted.
    await prisma.auditEvent.create({
      data: {
        actorId: prospect.id,
        action: "prospect-capture",
        reason: "lead captured on the event floor",
        meta: {
          prospectId: prospect.id,
          status: prospect.status,
          source: prospect.source ?? null,
          referredByCode: prospect.referredByCode ?? null,
          referralCode: prospect.referralCode,
          created: prior == null,
          hasPhone: Boolean(phone),
          hasNote: Boolean(note),
        },
      },
    });

    return { ok: true, email, referralCode: prospect.referralCode, created: prior == null };
  } catch (err) {
    console.error("[capture] failed", err instanceof Error ? err.message : "unknown");
    return { ok: false, reason: "failed" };
  }
}
