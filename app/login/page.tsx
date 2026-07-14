"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { SignatureRule, Eyebrow } from "@/components/brand";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const inactive = params.get("error") === "inactive";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await signIn("credentials", { email, password, redirect: false });

    setLoading(false);

    if (res?.error) {
      // Generic message — never reveal whether the email exists (spec §7).
      setError("Incorrect email or password.");
      return;
    }
    // Root dispatch reads the session and sends each role to its home.
    router.push("/");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-8 px-6">
      <div className="flex flex-col gap-3">
        <span className="font-headline text-lg font-semibold text-wine">
          veritas <span className="text-mocha">✧</span>
        </span>
        <Eyebrow>Welcome back</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">Sign in</h1>
        <SignatureRule />
      </div>

      {inactive && (
        <p className="rounded-md bg-blush-deep px-3 py-2 text-sm text-wine">
          Your account isn&apos;t active right now. Please reach out to Valentina.
        </p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-label font-semibold uppercase tracking-wide text-mocha">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="rounded-md border border-mocha/30 bg-white px-3 py-2 text-base font-normal normal-case tracking-normal text-ink outline-none placeholder:text-slate focus:border-wine focus-visible:ring-2 focus-visible:ring-wine/40"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-label font-semibold uppercase tracking-wide text-mocha">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="rounded-md border border-mocha/30 bg-white px-3 py-2 text-base font-normal normal-case tracking-normal text-ink outline-none placeholder:text-slate focus:border-wine focus-visible:ring-2 focus-visible:ring-wine/40"
          />
        </label>
        {error && <p className="text-sm text-rose">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="mt-2 rounded-md bg-wine px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-wine-dark focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wine disabled:opacity-50"
        >
          {loading ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
