import Link from "next/link";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { PendingButton } from "@/components/PendingButton";
import { requestPasswordReset } from "./actions";

export const dynamic = "force-dynamic";

// Signed-out by design — this is the door for people who can't get in. The
// success state is uniform whether or not the address has an account.
export default function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: { sent?: string; error?: string };
}) {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-8 px-6">
      <div className="flex flex-col gap-3">
        <span className="font-headline text-lg font-semibold text-wine">
          veritas <span className="text-mocha">✧</span>
        </span>
        <Eyebrow>Password reset</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">Forgot your password?</h1>
        <SignatureRule />
      </div>

      {searchParams.sent ? (
        <div className="flex flex-col gap-4">
          <p className="rounded-md bg-blush-deep px-4 py-3 text-sm leading-relaxed text-wine">
            If that address has an account, a reset link is on its way — check your inbox (and
            spam, just in case). The link works for 60 minutes.
          </p>
          <Link
            href="/login"
            className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
          >
            ← Back to sign in
          </Link>
        </div>
      ) : (
        <form action={requestPasswordReset} className="flex flex-col gap-4">
          <p className="text-sm leading-relaxed text-slate">
            Enter the email you use to sign in and we&apos;ll send you a link to create a new
            password.
          </p>
          {searchParams.error === "format" && (
            <p className="rounded-md bg-blush-deep px-3 py-2 text-sm text-wine">
              That doesn&apos;t look like an email address — check it and try again.
            </p>
          )}
          {searchParams.error === "expired" && (
            <p className="rounded-md bg-blush-deep px-3 py-2 text-sm text-wine">
              That reset link expired or was already used — request a fresh one below.
            </p>
          )}
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-strong">Email</span>
            <input
              type="email"
              name="email"
              required
              autoComplete="email"
              className="rounded-md border border-line bg-white px-3 py-2.5 text-ink outline-none focus:border-wine focus:ring-2 focus:ring-wine/20"
            />
          </label>
          <PendingButton
            className="rounded-md bg-wine px-5 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-wine/90"
            pendingLabel="Sending…"
          >
            Email me a reset link
          </PendingButton>
          <Link
            href="/login"
            className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
          >
            ← Back to sign in
          </Link>
        </form>
      )}
    </main>
  );
}
