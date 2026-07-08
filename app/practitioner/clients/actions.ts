"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { generateInviteToken, inviteExpiry } from "@/lib/invites";
import { getBaseUrl } from "@/lib/base-url";

type ActionResult = { ok: true; link?: string } | { ok: false; error: string };

const CLIENTS_PATH = "/practitioner/clients";

function normalizeEmail(raw: unknown) {
  return String(raw ?? "").trim().toLowerCase();
}

function inviteLink(rawToken: string) {
  return `${getBaseUrl()}/invite/${rawToken}`;
}

// Create a fresh invite and return its one-time copyable link.
export async function createInvite(input: { name: string; email: string }): Promise<ActionResult> {
  const session = await requirePractitioner();
  const email = normalizeEmail(input.email);
  const name = String(input.name ?? "").trim();

  if (!email || !email.includes("@")) return { ok: false, error: "Enter a valid email address." };
  if (!name) return { ok: false, error: "Enter a name." };

  // Don't invite someone who already has an account.
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) return { ok: false, error: "That email already has an account." };

  // One live invite per email — steer duplicates to Resend.
  const pending = await prisma.invite.findFirst({ where: { email, status: "PENDING" } });
  if (pending) return { ok: false, error: "There's already a pending invite for that email. Use Resend." };

  const { raw, hash } = generateInviteToken();
  await prisma.invite.create({
    data: {
      email,
      name,
      tokenHash: hash,
      expiresAt: inviteExpiry(),
      invitedById: (session.user as { id?: string }).id ?? "",
    },
  });

  revalidatePath(CLIENTS_PATH);
  return { ok: true, link: inviteLink(raw) };
}

// Issue a new token + expiry for a pending invite (old link dies).
export async function resendInvite(inviteId: string): Promise<ActionResult> {
  await requirePractitioner();

  const invite = await prisma.invite.findUnique({ where: { id: inviteId } });
  if (!invite) return { ok: false, error: "Invite not found." };
  if (invite.status === "ACCEPTED") return { ok: false, error: "That invite was already accepted." };

  const { raw, hash } = generateInviteToken();
  await prisma.invite.update({
    where: { id: inviteId },
    data: { tokenHash: hash, expiresAt: inviteExpiry(), status: "PENDING" },
  });

  revalidatePath(CLIENTS_PATH);
  return { ok: true, link: inviteLink(raw) };
}

// Revoke a pending invite — its link stops working immediately.
export async function revokeInvite(inviteId: string): Promise<ActionResult> {
  await requirePractitioner();

  const invite = await prisma.invite.findUnique({ where: { id: inviteId } });
  if (!invite) return { ok: false, error: "Invite not found." };
  if (invite.status === "ACCEPTED") return { ok: false, error: "That invite was already accepted." };

  await prisma.invite.update({ where: { id: inviteId }, data: { status: "REVOKED" } });
  revalidatePath(CLIENTS_PATH);
  return { ok: true };
}

// Toggle a client's access. Inactive clients can't authenticate (auth.ts).
export async function setClientActive(userId: string, active: boolean): Promise<ActionResult> {
  await requirePractitioner();

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user || user.role !== "CLIENT") return { ok: false, error: "Client not found." };

  await prisma.user.update({ where: { id: userId }, data: { active } });
  revalidatePath(CLIENTS_PATH);
  return { ok: true };
}
