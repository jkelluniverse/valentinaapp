import Link from "next/link";
import { SignOutForm } from "@/components/SignOutForm";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AvatarSheet } from "@/components/mobile/AvatarSheet";
import { BottomTabBar, type Tab, type MoreLink } from "@/components/mobile/BottomTabBar";

// PLATFORM Layer 1 — layout: dashboard-v1, practitioner side. Ops-first: a
// fixed sidebar holds the whole practice one click away; the main pane leads
// with Today. Same prop contract as journey-v1 — layouts arrange, features
// behave — and only skin tokens for color, so any skin composes.

export function PractitionerShell({
  wordmark = "veritas",
  user,
  unread,
  signOutAction,
  children,
}: {
  wordmark?: string; // tenant branding.portalTitle (PLATFORM §7 step 4)
  user: { name: string | null; email: string };
  unread: number;
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const first = user.name?.trim().split(/\s+/)[0] ?? "you";
  const initial = (user.name?.trim()?.[0] ?? user.email[0] ?? "·").toUpperCase();

  const NAV: { href: string; label: string; badge?: number }[] = [
    { href: "/practitioner", label: "Today" },
    { href: "/practitioner/clients", label: "Clients" },
    { href: "/practitioner/schedule", label: "Schedule" },
    { href: "/practitioner/messages", label: "Messages", badge: unread },
    { href: "/practitioner/leads", label: "Leads" },
    { href: "/practitioner/billing", label: "Billing" },
    { href: "/practitioner/agreements", label: "Agreements" },
    { href: "/practitioner/library", label: "Library" },
    { href: "/practitioner/worksheets", label: "Worksheets" },
    { href: "/practitioner/courses", label: "Courses" },
    { href: "/practitioner/notes", label: "Notes" },
    { href: "/practitioner/patterns", label: "Patterns" },
    { href: "/practitioner/availability", label: "Availability" },
    { href: "/practitioner/search", label: "Search" },
    { href: "/practitioner/settings", label: "Settings" },
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
    { href: "/practitioner/notes", label: "Notes", hint: "Session and margin notes" },
    { href: "/practitioner/patterns", label: "Patterns", hint: "Your method's vocabulary" },
    { href: "/practitioner/billing", label: "Billing", hint: "The ledger" },
    { href: "/practitioner/agreements", label: "Agreements", hint: "Signatures, sealed and kept" },
    { href: "/practitioner/availability", label: "Availability", hint: "Your hours" },
    { href: "/practitioner/settings", label: "Settings", hint: "Account, language, policy" },
    { href: "/practitioner/search", label: "Search", hint: "Everything, everywhere" },
  ];

  return (
    <div data-portal="practitioner" className="min-h-dvh bg-canvas text-ink">
      {/* Mobile bar — same pattern as the mobile-first layouts. */}
      <header className="sticky top-0 z-30 border-b border-line bg-canvas/85 pt-safe backdrop-blur md:hidden">
        <div className="flex h-12 items-center px-4">
          <Link href="/practitioner" className="font-headline text-lg font-semibold text-wine">
            {wordmark} <span className="text-mocha">✧</span>
          </Link>
          <span className="ml-auto">
            <AvatarSheet initial={initial} name={user.name} email={user.email} signOutAction={signOutAction} />
          </span>
        </div>
      </header>

      <div className="md:flex">
        {/* Desktop sidebar — the whole practice, one click away. */}
        <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-line bg-surface/60 px-4 py-5 md:flex">
          <Link href="/practitioner" className="px-2 font-headline text-lg font-semibold text-wine">
            {wordmark} <span className="text-mocha">✧</span>
          </Link>
          <nav className="mt-6 flex flex-1 flex-col gap-0.5 overflow-y-auto text-sm">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-ink transition-colors hover:bg-blush hover:text-wine"
              >
                {n.label}
                {(n.badge ?? 0) > 0 && (
                  <span
                    className="inline-flex h-4 min-w-4 items-center justify-center rounded-pill bg-wine px-1 text-[10px] font-semibold text-white"
                    aria-label={`${n.badge} unread`}
                  >
                    {n.badge}
                  </span>
                )}
              </Link>
            ))}
          </nav>
          <div className="mt-4 flex items-center gap-2 border-t border-line pt-4">
            <span className="flex h-8 w-8 items-center justify-center rounded-pill bg-blush text-sm font-semibold text-wine ring-1 ring-line">
              {initial}
            </span>
            <span className="min-w-0 flex-1 truncate text-[13px] text-whisper">{first}</span>
            <ThemeToggle />
            <SignOutForm />
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-5 pb-tabbar md:px-8 md:py-8">
          <div className="mx-auto max-w-[1080px]">{children}</div>
        </main>
      </div>

      <BottomTabBar tabs={tabs} moreLinks={moreLinks} />
    </div>
  );
}
