import Link from "next/link";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { PendingButton } from "@/components/PendingButton";
import { resetPassword } from "../../forgot/actions";

export const dynamic = "force-dynamic";

// The landing page for the reset link — reached from an email, so it works
// signed out. Validation here is a courtesy preview; the action re-validates
// everything before anything changes.
export default async function ResetPasswordPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { error?: string };
}) {
  const tokenHash = createHash("sha256").update(params.token).digest("hex");
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    include: { user: { select: { active: true } } },
  });
  const valid = Boolean(row && !row.consumedAt && row.expiresAt > new Date() && row.user.active);

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-8 px-6">
      <div className="flex flex-col gap-3">
        <span className="font-headline text-lg font-semibold text-wine">
          veritas <span className="text-mocha">✧</span>
        </span>
        <Eyebrow>Password reset</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">
          {valid ? "Create a new password" : "This link didn't work"}
        </h1>
        <SignatureRule />
      </div>

      {valid ? (
        <form action={resetPassword.bind(null, params.token)} className="flex flex-col gap-4">
          {searchParams.error === "short" && (
            <p className="rounded-md bg-blush-deep px-3 py-2 text-sm text-wine">
              At least 8 characters, please.
            </p>
          )}
          {searchParams.error === "match" && (
            <p className="rounded-md bg-blush-deep px-3 py-2 text-sm text-wine">
              The two passwords didn&apos;t match — try again.
            </p>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-strong">New password</span>
            <input
              type="password"
              name="next"
              required
              minLength={8}
              autoComplete="new-password"
              className="rounded-md border border-line bg-white px-3 py-2.5 text-ink outline-none focus:border-wine focus:ring-2 focus:ring-wine/20"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-strong">Confirm it</span>
            <input
              type="password"
              name="confirm"
              required
              minLength={8}
              autoComplete="new-password"
              className="rounded-md border border-line bg-white px-3 py-2.5 text-ink outline-none focus:border-wine focus:ring-2 focus:ring-wine/20"
            />
          </label>
          <p className="text-xs text-slate">
            Saving signs you out everywhere else — then sign in fresh with the new password.
          </p>
          <PendingButton
            className="rounded-md bg-wine px-5 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-wine/90"
            pendingLabel="Saving…"
          >
            Set new password
          </PendingButton>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="rounded-lg border border-line bg-white p-5 text-sm leading-relaxed text-ink shadow-soft">
            Reset links work once and expire after 60 minutes — this one is spent. Request a
            fresh link and you&apos;ll be back in within a minute.
          </p>
          <Link
            href="/forgot"
            className="self-start rounded-md border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush"
          >
            Request a new link
          </Link>
        </div>
      )}
    </main>
  );
}
