"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { generateInviteToken, inviteExpiry } from "@/lib/invites";
import { getBaseUrl } from "@/lib/base-url";
import { sendEmail, emailConfigured } from "@/lib/notify";
import { inviteEmail } from "@/emails/invite";
import { firstNameOf } from "@/lib/name";

type ActionResult = { ok: true; link?: string; emailed?: boolean } | { ok: false; error: string };

const CLIENTS_PATH = "/practitioner/clients";

function normalizeEmail(raw: unknown) {
  return String(raw ?? "").trim().toLowerCase();
}

function inviteLink(rawToken: string) {
  return `${getBaseUrl()}/invite/${rawToken}`;
}

// EMAIL-SPEC §4 — the invite email sends itself; failure is loud, not silent.
// Copy-link remains the fallback for the spam-folder cases, not the workflow.
async function sendInviteEmail(inviteId: string, link: string): Promise<boolean> {
  const invite = await prisma.invite.findUnique({ where: { id: inviteId } });
  if (!invite) return false;
  if (!emailConfigured()) {
    await prisma.invite.update({ where: { id: inviteId }, data: { emailError: true } });
    return false;
  }
  const mail = inviteEmail({
    locale: invite.locale === "es" ? "es" : "en",
    firstName: firstNameOf(invite.name || invite.email),
    link,
    note: invite.personalNote,
  });
  const sent = await sendEmail({
    to: invite.email,
    subject: mail.subject,
    text: "", // envelope carries the copy; the text part renders from it
    envelope: mail.envelope,
  });
  await prisma.invite.update({
    where: { id: inviteId },
    data: sent.ok ? { emailSentAt: new Date(), emailError: false } : { emailError: true },
  });
  return sent.ok;
}

// Create a fresh invite: the email goes out on save; the link comes back too.
export async function createInvite(input: {
  name: string;
  email: string;
  personalNote?: string;
  locale?: string;
}): Promise<ActionResult> {
  const practitioner = await requirePractitioner();
  const email = normalizeEmail(input.email);
  const name = String(input.name ?? "").trim();
  const personalNote = String(input.personalNote ?? "").trim() || null;
  const locale = input.locale === "es" ? "es" : "en";

  if (!email || !email.includes("@")) return { ok: false, error: "Enter a valid email address." };
  if (!name) return { ok: false, error: "Enter a name." };

  // BILLING §4.4 — SUSPENDED/CANCELED soft gate: no NEW client invites.
  // Reading, exporting, and every existing client stay untouched.
  {
    const { getTenant } = await import("@/lib/tenancy");
    const { newActivityAllowed, BILLING_PAUSED_MESSAGE } = await import("@/lib/billing/state");
    if (!(await newActivityAllowed((await getTenant()).id))) {
      return { ok: false, error: BILLING_PAUSED_MESSAGE };
    }
  }

  // Don't invite someone who already has an account.
  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) return { ok: false, error: "That email already has an account." };

  // One live invite per email — steer duplicates to Resend.
  const pending = await prisma.invite.findFirst({ where: { email, status: "PENDING" } });
  if (pending) return { ok: false, error: "There's already a pending invite for that email. Use Resend." };

  const { raw, hash } = generateInviteToken();
  const { getTenant } = await import("@/lib/tenancy");
  const tenant = await getTenant();
  const invite = await prisma.invite.create({
    data: {
      tenantId: tenant.id, // PLATFORM Phase 0 — new rows carry their tenant
      email,
      name,
      tokenHash: hash,
      expiresAt: inviteExpiry(),
      invitedById: practitioner.id,
      personalNote,
      locale,
    },
  });

  const link = inviteLink(raw);
  const emailed = await sendInviteEmail(invite.id, link);

  revalidatePath(CLIENTS_PATH);
  return { ok: true, link, emailed };
}

// Issue a new token + expiry for a pending invite (old link dies) — and send
// the fresh email.
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
  // ONBOARDING §4.4 — regenerating the token invalidates the old link; log it.
  try {
    const { emitEvent } = await import("@/lib/intake/engine");
    const { getTenant } = await import("@/lib/tenancy");
    await emitEvent({ tenantId: (await getTenant()).id, clientId: null, actor: "practitioner", eventKey: "invite.resent", meta: { inviteId, oldLinkInvalidated: true } });
  } catch { /* the event log is best-effort */ }

  const link = inviteLink(raw);
  const emailed = await sendInviteEmail(inviteId, link);

  revalidatePath(CLIENTS_PATH);
  return { ok: true, link, emailed };
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
