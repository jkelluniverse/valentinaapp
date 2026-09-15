"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/invites";
import { recordConsent } from "@/lib/consent";
import { syncSquareCustomer } from "@/lib/square";
import { signIn } from "@/auth";

// Accept an invite: validate the token, set a password, record consent, create
// the client account, and sign them in. All validation is re-checked here —
// the page render is only a convenience, never the security boundary.
export async function acceptInvite(token: string, formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const consent = formData.get("consent") === "on";

  const back = (code: string) => redirect(`/invite/${token}?error=${code}`);

  if (password.length < 8) return back("weak_password");
  if (!consent) return back("no_consent");

  const invite = await prisma.invite.findUnique({ where: { tokenHash: hashToken(token) } });
  const valid = invite && invite.status === "PENDING" && invite.expiresAt > new Date();
  if (!invite || !valid) return back("invalid");

  // Never overwrite an existing account; stay generic (no enumeration).
  const existing = await prisma.user.findUnique({ where: { email: invite.email } });
  if (existing) return back("cannot_complete");

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction(async (tx) => {
    const { getTenant } = await import("@/lib/tenancy");
    const tenant = await getTenant();
    const user = await tx.user.create({
      data: {
        email: invite.email,
        name: name || invite.name,
        role: "CLIENT",
        active: true,
        tenantId: tenant.id, // PLATFORM Phase 0 — new rows carry their tenant
        passwordHash,
        // The language she invited them in becomes their starting portal
        // language (they can change it any time in Settings).
        locale: invite.locale === "es" ? "es" : "en",
      },
    });
    // AMENDMENT-01: one versioned global consent covers the whole portal
    // (storage, review, AI-assisted processing, charts, messages-as-record).
    await recordConsent(user.id, tx);
    await tx.invite.update({
      where: { id: invite.id },
      data: { status: "ACCEPTED", acceptedUserId: user.id },
    });
    // C18 conversion bridge — if this person came in as a lead (matched by
    // email), close the loop: stranger → lead → discovery → invited → client.
    const leads = await tx.lead.findMany({
      where: { email: invite.email, status: { notIn: ["CLOSED"] } },
      select: { id: true },
    });
    await tx.lead.updateMany({
      where: { email: invite.email, status: { notIn: ["CONVERTED", "CLOSED"] } },
      data: { status: "CONVERTED", convertedUserId: user.id },
    });
    // C13-PKG §8 — a package invoiced to them as a Lead follows them in:
    // charges and packages keyed "lead:<id>" re-point to the real account.
    for (const lead of leads) {
      await tx.charge.updateMany({
        where: { clientId: `lead:${lead.id}` },
        data: { clientId: user.id },
      });
      await tx.package.updateMany({
        where: { clientId: `lead:${lead.id}` },
        data: { clientId: user.id },
      });
    }
    // C11: hand the practice intake (if one is designated) to every new
    // client, so onboarding starts with it waiting in their space.
    const intake = await tx.worksheet.findFirst({
      where: { isIntake: true, active: true },
      select: { id: true },
    });
    if (intake) {
      await tx.worksheetAssignment.create({
        data: {
          worksheetId: intake.id,
          clientId: user.id,
          assignedById: invite.invitedById,
        },
      });
    }
  });

  // C13-PKG §2 — mirror the new client into Square at ACCEPTANCE (a real
  // person now exists; invites that were never accepted create nothing).
  // Fire-and-forget: Square being down must never break onboarding.
  const created = await prisma.user.findUnique({
    where: { email: invite.email },
    select: { id: true },
  });
  if (created) void syncSquareCustomer(created.id).catch(() => undefined);

  // ONBOARDING §4.4 — a new client lands in the generated intake. Start their
  // flow now, so first login routes into it (the space-layout gate). Existing
  // clients never get a flow, so they are never affected.
  if (created) {
    const { startFlow } = await import("@/lib/intake/engine");
    await startFlow(created.id).catch(() => undefined);
    // C20 §2 — templates toggled "on invite acceptance" go out now.
    const { getTenant } = await import("@/lib/tenancy");
    const { fireAgreementTrigger } = await import("@/lib/agreements/triggers");
    await fireAgreementTrigger((await getTenant()).id, "sendOnInviteAccept", created.id).catch(() => undefined);
  }

  // Auto sign-in, then land on the client home. signIn throws the redirect.
  await signIn("credentials", { email: invite.email, password, redirectTo: "/space" });
}

// ONBOARDING §4.4 — the expired/used-link path: the visitor asks the
// practitioner for a fresh link. No enumeration — we respond the same
// whether or not the token maps to a real invite; if it does (even expired
// or used, but not yet accepted), the inviting practitioner is notified.
export async function requestFreshInvite(token: string) {
  const invite = await prisma.invite.findUnique({ where: { tokenHash: hashToken(token) } });
  if (invite && invite.status !== "ACCEPTED") {
    try {
      const pract = await prisma.user.findUnique({ where: { id: invite.invitedById }, select: { email: true } });
      const { sendEmail } = await import("@/lib/notify");
      if (pract?.email) {
        await sendEmail({
          to: pract.email,
          subject: `${invite.email} asked for a fresh invite link`,
          text: `${invite.name || invite.email} tried an invite link that had expired or been used, and asked for a new one.\n\nOpen their client page and choose "Resend invite" to send a fresh link.`,
        });
      }
      const { emitEvent } = await import("@/lib/intake/engine");
      const { getTenant } = await import("@/lib/tenancy");
      await emitEvent({ tenantId: (await getTenant()).id, clientId: null, actor: "system", eventKey: "invite.fresh_requested", meta: { inviteId: invite.id } });
    } catch { /* best-effort notify */ }
  }
  redirect(`/invite/${token}?requested=1`);
}
