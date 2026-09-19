"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-guards";
import { signIn } from "@/auth";

// AMD-06 §1 — completing a temp-password sign-in. Sets their own hash, clears
// the flag, bumps sessionVersion (any stale session dies), then re-signs THIS
// session so they land in their space without a second login.
export async function finishTempPassword(formData: FormData) {
  // Never runs in assist: the assist session is the practitioner's own.
  const { forbidInAssist } = await import("@/lib/assist");
  await forbidInAssist("security");
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (next.length < 8) redirect("/must-change?error=short");
  if (next !== confirm) redirect("/must-change?error=match");

  const passwordHash = await bcrypt.hash(next, 12);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, mustChangePassword: false, sessionVersion: { increment: 1 } },
  });
  console.info(`[account] temp password replaced user=${user.id}`);

  try {
    await signIn("credentials", { email: user.email, password: next, redirect: false });
  } catch {
    // If re-sign-in hiccups they simply sign in again with the new password.
  }
  redirect("/");
}
