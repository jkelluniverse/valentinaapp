import Link from "next/link";
import { SignatureRule, Eyebrow } from "@/components/brand";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6">
      <Eyebrow>Not found</Eyebrow>
      <h1 className="text-[2.25rem] font-semibold">That page isn&apos;t here</h1>
      <SignatureRule />
      <p className="text-lg leading-relaxed text-ink">
        The page you&apos;re looking for doesn&apos;t exist or isn&apos;t yours to see.
      </p>
      <Link href="/" className="text-sm font-medium text-wine underline-offset-4 hover:underline">
        Go home
      </Link>
    </main>
  );
}
