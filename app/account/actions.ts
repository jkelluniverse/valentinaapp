"use server";

import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-guards";
import { rateLimited } from "@/lib/rate-limit";
import { getBaseUrl } from "@/lib/base-url";
import {
  pickLocale,
  emailChangeVerifyEmail,
  emailChangeNoticeEmail,
} from "@/lib/email-copy";
import { sendEmail } from "@/lib/notify";
import { signIn, signOut } from "@/auth";

// AMD-05 B2 — account security actions shared by BOTH portals (client and
// practitioner settings bind their own redirect base). Every log line here is
// metadata only: user id and action — never a password, token, or address.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requireUser() {
  // AMD-06 §2 exclusion 3 — password & security screens never run inside
  // assist: these actions would touch HER account while the page looks like
  // theirs. The §1 tools exist precisely so she never acts in here.
  const { forbidInAssist } = await import("@/lib/assist");
  await forbidInAssist("security");
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

// Change password: verify the current one, store the new hash, and bump
// sessionVersion so every other session dies at the guard. The CURRENT session
// survives because we immediately re-sign-in for a fresh token.
export async function changePassword(base: string, formData: FormData) {
  const user = await requireUser();
  if (rateLimited(`pw:${user.id}`, 5, 15 * 60_000)) redirect(`${base}?error=pw-rate`);

  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (next.length < 8) redirect(`${base}?error=pw-short`);
  if (next !== confirm) redirect(`${base}?error=pw-match`);

  const db = await prisma.user.findUnique({
    where: { id: user.id },
    select: { email: true, passwordHash: true },
  });
  if (!db?.passwordHash || !(await bcrypt.compare(current, db.passwordHash))) {
    redirect(`${base}?error=pw-current`);
  }

  const passwordHash = await bcrypt.hash(next, 12);
  // One update: the new hash and the revocation bump land together.
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, sessionVersion: { increment: 1 } },
  });
  console.info(`[account] password changed user=${user.id}`);

  // Refresh THIS session's token (it carries the old sessionVersion and would
  // otherwise be revoked along with everyone else's).
  try {
    await signIn("credentials", { email: db.email, password: next, redirect: false });
  } catch {
    // If the re-sign-in hiccups the user simply signs in again — safe default.
  }
  redirect(`${base}?saved=password`);
}

// Request an email change. The address NEVER switches here — only when the
// link sent to the NEW address is confirmed. The old address gets a tripwire
// notice so a hijacked session can't silently walk off with the account.
export async function requestEmailChange(base: string, formData: FormData) {
  const user = await requireUser();
  if (rateLimited(`email:${user.id}`, 3, 60 * 60_000)) redirect(`${base}?error=email-rate`);

  const newEmail = String(formData.get("newEmail") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(newEmail)) redirect(`${base}?error=email-format`);
  if (newEmail === user.email.toLowerCase()) redirect(`${base}?error=email-same`);

  const taken = await prisma.user.findUnique({ where: { email: newEmail } });
  if (taken) redirect(`${base}?error=email-taken`);

  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await prisma.emailChangeRequest.create({
    data: {
      userId: user.id,
      newEmail,
      tokenHash,
      expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
    },
  });
  console.info(`[account] email change requested user=${user.id}`);

  const locale = pickLocale(user.locale);
  const link = `${getBaseUrl()}/account/confirm-email/${token}`;
  const verify = emailChangeVerifyEmail(locale, { link });
  await sendEmail({ to: newEmail, subject: verify.subject, text: verify.text });
  const notice = emailChangeNoticeEmail(locale, { newEmail });
  await sendEmail({ to: user.email, subject: notice.subject, text: notice.text });

  redirect(`${base}?saved=email`);
}

// Kill every session — including this one — by bumping sessionVersion, then
// sign out cleanly so the browser lands on /login instead of a dead redirect.
export async function signOutEverywhere() {
  const user = await requireUser();
  await prisma.user.update({
    where: { id: user.id },
    data: { sessionVersion: { increment: 1 } },
  });
  console.info(`[account] sign-out-everywhere user=${user.id}`);
  await signOut({ redirectTo: "/login" });
}
