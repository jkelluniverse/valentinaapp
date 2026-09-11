import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { PendingButton } from "@/components/PendingButton";
import { finishTempPassword } from "./actions";

export const dynamic = "force-dynamic";

// AMD-06 §1 — the landing after signing in with a temporary password: the
// temp worked once as a door; a password of their own is the next step.
export default async function MustChangePage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const flag = await prisma.user.findUnique({
    where: { id: user.id },
    select: { mustChangePassword: true },
  });
  if (!flag?.mustChangePassword) redirect("/");

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-8 px-6">
      <div className="flex flex-col gap-3">
        <span className="font-headline text-lg font-semibold text-wine">
          veritas <span className="text-mocha">✧</span>
        </span>
        <Eyebrow>Almost there</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">Choose your own password</h1>
        <SignatureRule />
      </div>

      <form action={finishTempPassword} className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-slate">
          You signed in with a temporary password. Pick one that&apos;s yours — Valentina never
          sees it.
        </p>
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
        <PendingButton
          className="rounded-md bg-wine px-5 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-wine/90"
          pendingLabel="Saving…"
        >
          Save &amp; continue
        </PendingButton>
      </form>
    </main>
  );
}
