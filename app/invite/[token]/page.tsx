import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hashToken } from "@/lib/invites";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { acceptInvite } from "./actions";

export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  weak_password: "Choose a password with at least 8 characters.",
  no_consent: "Please check the consent box to continue.",
  cannot_complete: "This invite can't be completed.",
  invalid: "This link can no longer be used.",
};

function InvalidLink() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6">
      <Eyebrow>Invite</Eyebrow>
      <h1 className="text-[2.25rem] font-semibold">This link isn&apos;t active</h1>
      <SignatureRule />
      <p className="text-lg leading-relaxed text-ink">
        This invitation link is invalid, has expired, or has already been used. If you think
        this is a mistake, reach out to Valentina for a fresh link.
      </p>
      <Link href="/login" className="text-sm text-wine underline-offset-4 hover:underline">
        Go to sign in
      </Link>
    </main>
  );
}

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { error?: string };
}) {
  const invite = await prisma.invite.findUnique({ where: { tokenHash: hashToken(params.token) } });
  const valid = invite && invite.status === "PENDING" && invite.expiresAt > new Date();

  if (!invite || !valid) return <InvalidLink />;

  const errorMessage = searchParams.error ? ERRORS[searchParams.error] ?? ERRORS.invalid : null;
  const accept = acceptInvite.bind(null, params.token);
  const fieldClass =
    "rounded-md border border-line bg-white px-3 py-2 text-base text-ink outline-none placeholder:text-slate focus:border-wine focus:ring-2 focus:ring-wine/20";

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-8 px-6 py-12">
      <div className="flex flex-col gap-3">
        <Eyebrow>You&apos;re invited</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">Welcome</h1>
        <SignatureRule />
        <p className="text-lg leading-relaxed text-ink">
          Set a password to create your private space. This is where your reflection and
          progress live between sessions.
        </p>
      </div>

      <form action={accept} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-label font-semibold uppercase tracking-wide text-mocha">
          Name
          <input
            name="name"
            defaultValue={invite.name ?? ""}
            required
            className={`${fieldClass} font-normal normal-case tracking-normal`}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-label font-semibold uppercase tracking-wide text-mocha">
          Email
          <input
            value={invite.email}
            readOnly
            className={`${fieldClass} cursor-not-allowed bg-cream font-normal normal-case tracking-normal text-slate`}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-label font-semibold uppercase tracking-wide text-mocha">
          Password
          <input
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            className={`${fieldClass} font-normal normal-case tracking-normal`}
          />
        </label>

        <label className="flex items-start gap-3 text-sm text-ink">
          <input
            name="consent"
            type="checkbox"
            required
            className="mt-1 h-4 w-4 rounded border-line text-wine focus:ring-wine/20"
          />
          <span>
            I agree to the{" "}
            <Link href="/privacy" target="_blank" className="text-wine underline underline-offset-4">
              privacy notice
            </Link>{" "}
            and consent to storing my reflections in this private space.
          </span>
        </label>

        {errorMessage && <p className="text-sm text-rose">{errorMessage}</p>}

        <button
          type="submit"
          className="mt-2 rounded-md bg-wine px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wine-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine"
        >
          Create my space
        </button>
      </form>
    </main>
  );
}
