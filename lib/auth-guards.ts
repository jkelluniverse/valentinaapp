import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

// Server-side authorization boundary. Role and active status are read from the
// database, not the JWT — that's authoritative, can't drift from a stale token,
// and avoids any redirect loop from a missing session claim. Middleware is only
// a coarse "are you signed in" convenience; these are the real gate (spec §6).

export type SessionUser = {
  id: string;
  name: string | null;
  email: string;
  role: "PRACTITIONER" | "CLIENT";
  active: boolean;
  locale: string; // AMD-05 — "en" | "es"
  consentAt: Date | null; // legacy; new consent checks go through lib/consent.ts
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  const sessionUser = session?.user as
    | { id?: string; email?: string | null; sessionVersion?: number }
    | undefined;
  if (!sessionUser?.email && !sessionUser?.id) return null;
  // Prefer the id claim (stable across a verified email change); fall back to
  // email for tokens minted before the id claim existed.
  const user = await prisma.user.findUnique({
    where: sessionUser.id ? { id: sessionUser.id } : { email: sessionUser.email! },
    select: {
      id: true, name: true, email: true, role: true, active: true,
      locale: true, consentAt: true, sessionVersion: true,
    },
  });
  if (!user) return null;
  // AMD-05 B2 — revocation: a password change bumps User.sessionVersion; any
  // JWT carrying an older version is dead on its next request.
  if ((sessionUser.sessionVersion ?? 0) !== user.sessionVersion) return null;
  const { sessionVersion: _sv, ...rest } = user;
  return rest as SessionUser;
}

export async function requirePractitioner(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "PRACTITIONER") redirect("/space");
  return user;
}

export async function requireClient(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.role !== "CLIENT") redirect("/practitioner");
  // Deactivation gate against the DB, so a client deactivated mid-session loses
  // access on their next navigation (not just at next login).
  if (!user.active) redirect("/login?error=inactive");
  return user;
}
