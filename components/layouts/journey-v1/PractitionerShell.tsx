import Link from "next/link";
import { SignOutForm } from "@/components/SignOutForm";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AvatarSheet } from "@/components/mobile/AvatarSheet";
import { BottomTabBar, type Tab, type MoreLink } from "@/components/mobile/BottomTabBar";

// PLATFORM Layer 1 — layout: journey-v1, practitioner side ("The Study").
// Extracted VERBATIM from Valentina's live layout (Phase 0 Rule 0.1): this
// file arranges; features behave. Improvements belong in journey-v2 — this
// tree is immutable while any tenant lives on it.

export function PractitionerShell({
  user,
  unread,
  signOutAction,
  children,
}: {
  user: { name: string | null; email: string };
  unread: number;
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const first = user.name?.trim().split(/\s+/)[0] ?? "you";
  const initial = (user.name?.trim()?.[0] ?? user.email[0] ?? "·").toUpperCase();

  const NAV = [
    { href: "/practitioner/clients", label: "Clients" },
    { href: "/practitioner/leads", label: "Leads" },
    { href: "/practitioner/messages", label: "Messages" },
    { href: "/practitioner/library", label: "Library" },
    { href: "/practitioner/courses", label: "Courses" },
    { href: "/practitioner/schedule", label: "Schedule" },
    { href: "/practitioner/billing", label: "Billing" },
    { href: "/practitioner/notes", label: "Notes" },
  ];

  const tabs: Tab[] = [
    { key: "today", label: "Today", href: "/practitioner", icon: "home" },
    { key: "clients", label: "Clients", href: "/practitioner/clients", icon: "users" },
    { key: "messages", label: "Messages", href: "/practitioner/messages", icon: "message", dot: unread > 0 },
    { key: "calendar", label: "Calendar", href: "/practitioner/schedule", icon: "calendar", match: "/practitioner/schedule" },
  ];
  const moreLinks: MoreLink[] = [
    { href: "/practitioner/leads", label: "Leads", hint: "Discovery-call prospects" },
    { href: "/practitioner/library", label: "Library", hint: "Prompts, exercises, worksheets" },
    { href: "/practitioner/worksheets", label: "Worksheets", hint: "The worksheet studio" },
    { href: "/practitioner/courses", label: "Courses", hint: "Course builders" },
    { href: "/practitioner/notes", label: "Notes", hint: "The Margins" },
    { href: "/practitioner/patterns", label: "Pattern Library", hint: "Your method's vocabulary" },
    { href: "/practitioner/billing", label: "Billing", hint: "The ledger" },
    { href: "/practitioner/availability", label: "Availability", hint: "Your hours" },
    { href: "/practitioner/settings", label: "Settings", hint: "Account, language, policy" },
    { href: "/practitioner/search", label: "Search", hint: "Everything, everywhere" },
  ];

  return (
    <div data-portal="practitioner" className="min-h-dvh bg-canvas text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 pt-safe backdrop-blur">
        {/* Mobile bar: wordmark + avatar only. */}
        <div className="flex h-12 items-center px-4 md:hidden">
          <Link href="/practitioner" className="font-headline text-lg font-semibold text-wine">
            veritas <span className="text-mocha">✧</span>
          </Link>
          <span className="ml-auto">
            <AvatarSheet initial={initial} name={user.name} email={user.email} signOutAction={signOutAction} />
          </span>
        </div>

        {/* Desktop bar: wordmark + quiet top-row links. */}
        <div className="mx-auto hidden max-w-[960px] items-center gap-5 px-6 py-4 md:flex">
          <Link href="/practitioner" className="font-headline text-lg font-semibold text-wine">
            veritas <span className="text-mocha">✧</span>
          </Link>
          <nav className="flex items-center gap-4 text-[13px] text-whisper">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="inline-flex items-center gap-1 underline-offset-4 hover:text-wine hover:underline"
              >
                {n.label}
                {n.href === "/practitioner/messages" && unread > 0 && (
                  <span
                    className="inline-flex h-4 min-w-4 items-center justify-center rounded-pill bg-wine px-1 text-[10px] font-semibold text-white"
                    aria-label={`${unread} unread`}
                  >
                    {unread}
                  </span>
                )}
              </Link>
            ))}
            <Link href="/practitioner/search" className="underline-offset-4 hover:text-wine hover:underline">
              Search
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
            <span className="text-[13px] text-whisper">{first}</span>
            <span className="flex h-9 w-9 items-center justify-center rounded-pill bg-blush text-sm font-semibold text-wine ring-1 ring-line">
              {initial}
            </span>
            <SignOutForm />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[960px] px-4 py-5 pb-tabbar md:px-6 md:py-10">{children}</main>

      <BottomTabBar tabs={tabs} moreLinks={moreLinks} />
    </div>
  );
}
