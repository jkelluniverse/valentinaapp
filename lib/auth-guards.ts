import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

// Server-side authorization boundary. Middleware is only a coarse convenience;
// these run inside protected layouts/pages and are the real gate (spec §6).

export async function requirePractitioner() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  if ((session.user as { role?: string }).role !== "PRACTITIONER") redirect("/app");
  return session;
}

export async function requireClient() {
  const session = await auth();
  if (!session?.user?.email) redirect("/login");
  if ((session.user as { role?: string }).role !== "CLIENT") redirect("/practitioner/clients");

  // Re-check the deactivation gate against the database, not just the JWT, so a
  // client deactivated mid-session loses access on their next navigation.
  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { id: true, name: true, active: true },
  });
  if (!user || !user.active) redirect("/login?error=inactive");

  return { session, user };
}
