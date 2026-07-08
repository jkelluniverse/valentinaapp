import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-3xl font-semibold">Valentina&apos;s Coaching Platform</h1>
      <p className="text-neutral-600">
        A private space for reflection and progress between sessions.
      </p>
      <Link
        href="/login"
        className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-neutral-700"
      >
        Sign in
      </Link>
    </main>
  );
}
