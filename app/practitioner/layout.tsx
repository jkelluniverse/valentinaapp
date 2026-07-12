import Link from "next/link";
import { requirePractitioner } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { signOut } from "@/auth";
import { SignOutForm } from "@/components/SignOutForm";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AvatarSheet } from "@/components/mobile/AvatarSheet";
import { BottomTabBar, type Tab, type MoreLink } from "@/components/mobile/BottomTabBar";

// The Study frame (UI-PRACTITIONER-DESIGN + AMENDMENT-02 Mobile-First). Mobile:
// a 48px top bar (wordmark + avatar sheet) over the notch, a bottom tab bar for
// the spine. Desktop (≥768px): the quiet top-row of links returns and the tab
// bar disappears. data-portal="practitioner" carries the shared Dusk theme.
export default async function PractitionerLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePractitioner();
  const first = user.name?.trim().split(/\s+/)[0] ?? "you";
  const initial = (user.name?.trim()?.[0] ?? user.email[0] ?? "·").toUpperCase();

  // Unread client messages → a soft dot on the Messages tab, a count on desktop.
  const unread = await prisma.message
    .count({ where: { senderRole: "CLIENT", readAt: null, deletedAt: null } })
    .catch(() => 0);

  const NAV = [
    { href: "/practitioner/clients", label: "Clients" },
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
    { href: "/practitioner/library", label: "Library", hint: "Prompts, exercises, worksheets" },
    { href: "/practitioner/worksheets", label: "Worksheets", hint: "The worksheet studio" },
    { href: "/practitioner/courses", label: "Courses", hint: "Course builders" },
    { href: "/practitioner/notes", label: "Notes", hint: "The Margins" },
    { href: "/practitioner/patterns", label: "Pattern Library", hint: "Your method's vocabulary" },
    { href: "/practitioner/billing", label: "Billing", hint: "The ledger" },
    { href: "/practitioner/availability", label: "Availability", hint: "Your hours" },
    { href: "/practitioner/search", label: "Search", hint: "Everything, everywhere" },
  ];

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div data-portal="practitioner" className="min-h-dvh bg-canvas text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 pt-safe backdrop-blur">
        {/* Mobile bar: wordmark + avatar only. */}
        <div className="flex h-12 items-center px-4 md:hidden">
          <Link href="/practitioner" className="font-headline text-lg font-semibold text-wine">
            veritas <span className="text-mocha">✧</span>
          </Link>
          <span className="ml-auto">
            <AvatarSheet initial={initial} name={user.name} email={user.email} signOutAction={doSignOut} />
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

      <main className="mx-auto max-w-[960px] px-6 py-8 pb-tabbar md:py-10">{children}</main>

      <BottomTabBar tabs={tabs} moreLinks={moreLinks} />
    </div>
  );
}
