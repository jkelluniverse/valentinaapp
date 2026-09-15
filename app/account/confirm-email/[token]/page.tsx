import Link from "next/link";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { SignatureRule, Eyebrow } from "@/components/brand";

export const dynamic = "force-dynamic";

// AMD-05 B2 — the landing page for the email-change confirmation link. It is
// reached from an email, so it must work signed OUT. The switch happens here
// and only here: single-use hashed token, 24h expiry, and a fresh check that
// the new address hasn't been claimed since the request was made. Confirming
// bumps sessionVersion, so any session on the old identity is revoked and the
// owner signs in again with the new address.
export default async function ConfirmEmailPage({ params }: { params: { token: string } }) {
  const tokenHash = createHash("sha256").update(params.token).digest("hex");
  const request = await prisma.emailChangeRequest.findUnique({ where: { tokenHash } });

  let outcome: "invalid" | "taken" | "done" = "invalid";
  if (request && !request.consumedAt && request.expiresAt > new Date()) {
    const taken = await prisma.user.findUnique({ where: { email: request.newEmail } });
    if (taken) {
      outcome = "taken";
    } else {
      await prisma.$transaction([
        prisma.user.update({
          where: { id: request.userId },
          data: { email: request.newEmail, sessionVersion: { increment: 1 } },
        }),
        prisma.emailChangeRequest.update({
          where: { id: request.id },
          data: { consumedAt: new Date() },
        }),
      ]);
      console.info(`[account] email change confirmed user=${request.userId}`);
      outcome = "done";
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-6 px-6 py-12">
      <div className="flex flex-col gap-2">
        <Eyebrow>Veritas</Eyebrow>
        <h1 className="text-[1.75rem] font-semibold text-ink-strong">
          {outcome === "done" ? "Your email is updated" : "This link didn't work"}
        </h1>
        <SignatureRule />
      </div>

      <div className="rounded-lg border border-line bg-white p-6 shadow-soft">
        {outcome === "done" && (
          <p className="text-ink">
            All set — your account now uses this address. For your security you&apos;ve been
            signed out everywhere; sign in again with your new email and your usual password.
          </p>
        )}
        {outcome === "taken" && (
          <p className="text-ink">
            That address has since been taken by another account, so nothing was changed. Your
            sign-in stays exactly as it was — you can request a different address from your
            settings.
          </p>
        )}
        {outcome === "invalid" && (
          <p className="text-ink">
            This confirmation link is no longer valid — it may have expired (links last 24 hours)
            or already been used. Nothing was changed. You can request a fresh link from your
            settings.
          </p>
        )}
      </div>

      <Link
        href="/login"
        className="self-start text-sm font-medium text-wine underline-offset-4 hover:underline"
      >
        Go to sign in →
      </Link>
    </main>
  );
}
