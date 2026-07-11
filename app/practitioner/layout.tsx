import Link from "next/link";
import { requirePractitioner } from "@/lib/auth-guards";
import { SignOutForm } from "@/components/SignOutForm";
import { ThemeToggle } from "@/components/ThemeToggle";

// The Study frame (UI-PRACTITIONER-DESIGN). A hairline bar — wordmark, quiet
// wayfinding, name + avatar — over the warm canvas. data-portal="practitioner"
// lets the shared Dusk theme apply here too (inherited from §B verbatim).
export default async function PractitionerLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePractitioner();
  const first = user.name?.trim().split(/\s+/)[0] ?? "you";
  const initial = (user.name?.trim()?.[0] ?? user.email[0] ?? "·").toUpperCase();

  const NAV = [
    { href: "/practitioner", label: "The Study" },
    { href: "/practitioner/clients", label: "Clients" },
    { href: "/practitioner/library", label: "Library" },
    { href: "/practitioner/courses", label: "Courses" },
    { href: "/practitioner/schedule", label: "Schedule" },
    { href: "/practitioner/billing", label: "Billing" },
    { href: "/practitioner/notes", label: "Notes" },
  ];

  return (
    <div data-portal="practitioner" className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-line bg-surface/60 backdrop-blur">
        <div className="mx-auto flex max-w-[960px] items-center gap-5 px-6 py-4">
          <Link href="/practitioner" className="font-headline text-lg font-semibold text-wine">
            veritas <span className="text-mocha">✧</span>
          </Link>
          <nav className="hidden items-center gap-4 text-[13px] text-whisper md:flex">
            {NAV.slice(1).map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="underline-offset-4 hover:text-wine hover:underline"
              >
                {n.label}
              </Link>
            ))}
            <Link
              href="/practitioner/search"
              className="underline-offset-4 hover:text-wine hover:underline"
            >
              Search
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
            <span className="hidden text-[13px] text-whisper sm:inline">{first}</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-pill bg-blush text-sm font-semibold text-wine ring-1 ring-line">
              {initial}
            </span>
            <SignOutForm />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[960px] px-6 py-10">{children}</main>
    </div>
  );
}
