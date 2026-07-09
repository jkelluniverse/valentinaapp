import Link from "next/link";
import { requireClient } from "@/lib/auth-guards";
import { SignOutForm } from "@/components/SignOutForm";

// Server-side role + active boundary for the whole client area (spec §6).
export default async function SpaceLayout({ children }: { children: React.ReactNode }) {
  const user = await requireClient();

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white/60">
        <div className="mx-auto flex max-w-[720px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link href="/space" className="text-sm font-semibold text-wine">
              Veritas
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/space" className="text-ink underline-offset-4 hover:text-wine hover:underline">
                Your space
              </Link>
              <Link href="/space/journey" className="text-ink underline-offset-4 hover:text-wine hover:underline">
                Your journey
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-slate sm:inline">{user.name || "Your space"}</span>
            <SignOutForm />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[720px] px-6 py-10">{children}</main>
    </div>
  );
}
