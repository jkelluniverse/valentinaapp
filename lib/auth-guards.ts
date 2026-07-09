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
  consentAt: Date | null;
  aiConsentAt: Date | null;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.email) return null;
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, name: true, email: true, role: true, active: true, consentAt: true, aiConsentAt: true },
  });
  return user as SessionUser | null;
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
