import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";

// AMD-06 §2 — Assist Mode: the bounded act-as. Her session gains a grant and
// the client portal renders AS A VIEW; every consequential row stays
// attributed to her. Capability yes; impersonation no.
//
// The grant is cookie-scoped (httpOnly) and time-boxed to 30 minutes; the
// hard exclusions are enforced SERVER-SIDE in the excluded actions/routes via
// forbidInAssist() — greyed buttons are a courtesy, the guard is the law.

export const ASSIST_COOKIE = "veritas-assist";
export const ASSIST_MINUTES = 30;

export const ASSIST_REASONS: Record<string, string> = {
  "phone-support": "Walking them through it by phone",
  "intake-together": "Completing an intake together",
  "seeing-their-view": "Troubleshooting — seeing what they see",
  "low-tech-help": "Hands-on help (low-tech client)",
  other: "Other (say why in the note)",
};

export type ActiveAssist = {
  grantId: string;
  practitionerId: string;
  clientId: string;
  expiresAt: Date;
};

// The single source of truth for "is this session assisting right now".
// Validates the cookie against the DB row: unexpired, unended, and owned by
// the signed-in practitioner (checked by the caller passing their id).
export async function activeAssist(practitionerId: string): Promise<ActiveAssist | null> {
  const grantId = cookies().get(ASSIST_COOKIE)?.value;
  if (!grantId) return null;
  const grant = await prisma.assistGrant.findUnique({ where: { id: grantId } });
  if (!grant || grant.endedAt || grant.expiresAt <= new Date()) return null;
  if (grant.practitionerId !== practitionerId) return null;
  return {
    grantId: grant.id,
    practitionerId: grant.practitionerId,
    clientId: grant.clientId,
    expiresAt: grant.expiresAt,
  };
}

export async function startAssist(args: {
  practitionerId: string;
  clientId: string;
  reason: string;
  note?: string | null;
}): Promise<string> {
  const expiresAt = new Date(Date.now() + ASSIST_MINUTES * 60_000);
  const grant = await prisma.assistGrant.create({
    data: {
      practitionerId: args.practitionerId,
      clientId: args.clientId,
      reason: args.reason,
      note: args.note?.slice(0, 300) || null,
      expiresAt,
    },
  });
  cookies().set(ASSIST_COOKIE, grant.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: ASSIST_MINUTES * 60,
    path: "/",
  });
  await audit({
    actorId: args.practitionerId,
    onBehalfOfId: args.clientId,
    action: "assist-enter",
    reason: `${args.reason}${args.note ? ` — ${args.note.slice(0, 200)}` : ""}`,
    meta: { grantId: grant.id },
  });
  return grant.id;
}

export async function endAssist(practitionerId: string): Promise<void> {
  const active = await activeAssist(practitionerId);
  cookies().delete(ASSIST_COOKIE);
  if (active) {
    await prisma.assistGrant.update({
      where: { id: active.grantId },
      data: { endedAt: new Date() },
    });
    await audit({
      actorId: practitionerId,
      onBehalfOfId: active.clientId,
      action: "assist-exit",
      meta: { grantId: active.grantId },
    });
  }
}

// Non-redirecting variant for actions that return structured results to
// client components: true = assisting (caller returns its own error), with
// the blocked attempt audited.
export async function blockedInAssist(area: string): Promise<boolean> {
  const { getSessionUser } = await import("@/lib/auth-guards");
  const user = await getSessionUser();
  if (!user || user.role !== "PRACTITIONER") return false;
  const active = await activeAssist(user.id);
  if (!active) return false;
  await audit({
    actorId: user.id,
    onBehalfOfId: active.clientId,
    action: "assist-blocked",
    meta: { area },
  });
  return true;
}

// The server-side wall around the hard exclusions (§2): consent screens,
// payment instruments, password/security, export & deletion, resonance marks
// — plus sending messages (a sent message would forge the client's voice;
// her own inbox exists for speaking as herself).
export async function forbidInAssist(area: string): Promise<void> {
  const { getSessionUser } = await import("@/lib/auth-guards");
  const user = await getSessionUser();
  if (!user || user.role !== "PRACTITIONER") return; // real client — not assisting
  const active = await activeAssist(user.id);
  if (!active) return;
  await audit({
    actorId: user.id,
    onBehalfOfId: active.clientId,
    action: "assist-blocked",
    meta: { area },
  });
  redirect(`/space?assist-blocked=${encodeURIComponent(area)}`);
}
