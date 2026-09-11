"use server";

import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { rateLimited } from "@/lib/rate-limit";
import { getBaseUrlSafe } from "@/lib/base-url";
import { pickLocale, passwordResetEmail, passwordChangedEmail } from "@/lib/email-copy";
import { sendEmail } from "@/lib/notify";

// The self-serve way back in. Two hard rules throughout:
//  - never reveal whether an address has an account (uniform success page)
//  - log metadata only — user ids, never addresses, tokens, or passwords

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) redirect("/forgot?error=format");

  // Rate limit per address (hashed key) — quiet uniform success even when
  // limited, so the limiter itself can't be used to probe accounts.
  const key = createHash("sha256").update(email).digest("hex").slice(0, 16);
  if (rateLimited(`reset:${key}`, 3, 60 * 60_000) || rateLimited("reset:all", 30, 60 * 60_000)) {
    redirect("/forgot?sent=1");
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, active: true, locale: true, email: true },
  });
  // Deactivated accounts can't sign in, so a reset link would only confuse —
  // same quiet success either way.
  if (user?.active) {
    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    await prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 60 * 60_000) },
    });
    console.info(`[account] password reset requested user=${user.id}`);

    const locale = pickLocale(user.locale);
    const link = `${getBaseUrlSafe()}/reset/${token}`;
    const mail = passwordResetEmail(locale, { link });
    await sendEmail({
      to: user.email,
      subject: mail.subject,
      text: mail.text,
      envelope: {
        locale,
        heading: mail.subject,
        button: { label: locale === "es" ? "Crear nueva contraseña" : "Create a new password", url: link },
        note:
          locale === "es"
            ? "El enlace vence en 60 minutos y funciona una sola vez. Si no fuiste tú, ignora este correo."
            : "The link expires in 60 minutes and works only once. If this wasn't you, just ignore this email.",
      },
    });
  }

  redirect("/forgot?sent=1");
}

export async function resetPassword(token: string, formData: FormData) {
  const back = `/reset/${token}`;
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (next.length < 8) redirect(`${back}?error=short`);
  if (next !== confirm) redirect(`${back}?error=match`);

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { id: true, email: true, locale: true, active: true } } },
  });
  if (!row || row.consumedAt || row.expiresAt <= new Date() || !row.user.active) {
    redirect("/forgot?error=expired");
  }

  const passwordHash = await bcrypt.hash(next, 12);
  // One transaction: new hash, every session revoked, token burned.
  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.user.id },
      data: { passwordHash, sessionVersion: { increment: 1 } },
    }),
    prisma.passwordResetToken.update({
      where: { id: row.id },
      data: { consumedAt: new Date() },
    }),
    // Any other outstanding reset links die with this one.
    prisma.passwordResetToken.updateMany({
      where: { userId: row.user.id, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
  ]);
  console.info(`[account] password reset completed user=${row.user.id}`);

  // The tripwire: the account owner always hears that this happened.
  const locale = pickLocale(row.user.locale);
  const notice = passwordChangedEmail(locale);
  await sendEmail({ to: row.user.email, subject: notice.subject, text: notice.text });

  redirect("/login?reset=1");
}
