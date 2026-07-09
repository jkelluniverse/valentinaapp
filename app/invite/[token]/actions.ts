"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/invites";
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
    const user = await tx.user.create({
      data: {
        email: invite.email,
        name: name || invite.name,
        role: "CLIENT",
        active: true,
        passwordHash,
        consentAt: new Date(),
        // The acceptance consent text explicitly covers AI-assisted
        // practitioner review (C5 spec §9); both consents record together.
        aiConsentAt: new Date(),
      },
    });
    await tx.invite.update({
      where: { id: invite.id },
      data: { status: "ACCEPTED", acceptedUserId: user.id },
    });
  });

  // Auto sign-in, then land on the client home. signIn throws the redirect.
  await signIn("credentials", { email: invite.email, password, redirectTo: "/space" });
}
