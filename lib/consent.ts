import { readFileSync } from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

// AMENDMENT-01 — Unified Consent. THE one consent surface in code. Every gate in
// the portal (reflections, prompts, worksheets, courses, scheduling, profile /
// birth data, charts, the reading, AI-assisted prep, and messages-as-record)
// asks exactly this helper. Consent is a single versioned global grant, given
// once at acceptance; a version bump is the only thing that ever re-asks.
//
// NOT covered here (stay separate, in-context opt-ins): card-on-file (C13) and
// session recording. The "just between us" message toggle is a control, not a
// consent, and is unaffected.

export const CURRENT_CONSENT_VERSION = "2026-07";

// Does this user hold a grant for the CURRENT version? A legacy grant (from the
// migration backfill) is deliberately NOT sufficient — that is what makes the
// one-time re-ask honest.
export async function hasConsent(userId: string): Promise<boolean> {
  const grant = await prisma.consentGrant.findUnique({
    where: { userId_version: { userId, version: CURRENT_CONSENT_VERSION } },
    select: { id: true },
  });
  return Boolean(grant);
}

// Record consent for the current version (idempotent). Also stamps the legacy
// User.consentAt so any not-yet-migrated read still sees a consenting client.
// Accepts an optional transaction client for the invite-accept path.
export async function recordConsent(
  userId: string,
  tx: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  await tx.consentGrant.upsert({
    where: { userId_version: { userId, version: CURRENT_CONSENT_VERSION } },
    create: { userId, version: CURRENT_CONSENT_VERSION },
    update: {},
  });
  await tx.user.update({ where: { id: userId }, data: { consentAt: new Date() } });
}

// The canonical consent text (AMENDMENT-01 §4) — read from content/consent.md
// (the source of record, kept for professional review) so the words shown to
// clients and the words on file are literally the same. A bundled copy is the
// fallback, so a missing/untraced file can never break the consent flow.
const CONSENT_TEXT_FALLBACK = `### Your space, and how it's cared for

Welcome. Before you begin, here's a clear picture of how this portal works — so you never have to wonder.

**What's kept.** Everything you create or share here — your reflections, worksheets, course work, messages, profile and birth details — is stored securely as part of your private, ongoing record with Valentina. It's how your work builds on itself instead of starting over each session.

**How it's used.** Valentina reviews what you share to guide your work together. To support her, this portal also uses secure AI assistance — always under her direction — to help her prepare for your sessions, notice patterns over time, and personalize what she offers you. Your birth details are used to generate your charts, and your charts are used to create your personal reading. When AI processing happens, it's done securely and without your name attached.

**What's private.** Your space is confidential between you and Valentina. Your information is never sold or shared for advertising. In messages, anything you mark "just between us" stays out of your record.

**What this isn't.** This is coaching and self-exploration — not medical or psychological treatment, and not an emergency service. If you're ever in crisis, please reach out to emergency services or a crisis line.

**Your record, your call.** You can ask for a copy of your information, or ask for it to be deleted, at any time.

*v2026-07 · DRAFT — have this reviewed by a qualified professional before real clients.*`;

let cachedText: string | null = null;
export function getConsentText(): string {
  if (cachedText === null) {
    try {
      cachedText = readFileSync(path.join(process.cwd(), "content", "consent.md"), "utf8");
    } catch {
      cachedText = CONSENT_TEXT_FALLBACK;
    }
  }
  return cachedText;
}
