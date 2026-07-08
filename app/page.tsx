import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { roleHome } from "@/lib/roles";
import { SignatureRule, Eyebrow } from "@/components/brand";

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect(roleHome((session.user as { role?: string }).role));

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex flex-col items-center gap-4">
        <Eyebrow>Veritas · Valentina Vélez</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">A private space for your reflection</h1>
        <SignatureRule />
      </div>
      <p className="max-w-md text-lg leading-relaxed text-ink">
        Insight and momentum between sessions. Warm, grounded, and entirely your own.
      </p>
      <Link
        href="/login"
        className="rounded-md bg-wine px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wine-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine"
      >
        Sign in
      </Link>
    </main>
  );
}
