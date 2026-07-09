import Link from "next/link";
import { requirePractitioner } from "@/lib/auth-guards";
import { SignOutForm } from "@/components/SignOutForm";

// Server-side role boundary for the whole practitioner area (spec §6).
export default async function PractitionerLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePractitioner();

  return (
    <div className="min-h-screen">
      <header className="border-b border-line bg-white/60">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <Link href="/practitioner/clients" className="text-sm font-semibold text-wine">
              Veritas · Practitioner
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/practitioner/clients" className="text-ink underline-offset-4 hover:text-wine hover:underline">
                Clients
              </Link>
              <Link href="/practitioner/library" className="text-ink underline-offset-4 hover:text-wine hover:underline">
                Library
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-slate sm:inline">{user.email}</span>
            <SignOutForm />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1120px] px-6 py-10">{children}</main>
    </div>
  );
}
