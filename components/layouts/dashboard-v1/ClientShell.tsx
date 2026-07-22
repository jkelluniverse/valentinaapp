import Link from "next/link";
import { SignOutForm } from "@/components/SignOutForm";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AvatarSheet } from "@/components/mobile/AvatarSheet";
import { BottomTabBar, type Tab, type MoreLink } from "@/components/mobile/BottomTabBar";
import type { ClientShellLabels } from "@/components/layouts/journey-v1/ClientShell";

// PLATFORM Layer 1 — layout: dashboard-v1, client side. The same sidebar
// paradigm as the practitioner pane, built entirely from the link sets the
// app layout already passes (tabs + youLinks) so every label stays in the
// tenant's language. Same prop contract as journey-v1.

export function ClientShell({
  user,
  assist,
  unread,
  tabs,
  youLinks,
  labels,
  signOutAction,
  exitAssistAction,
  children,
}: {
  user: { name: string | null; email: string };
  assist: { expiresAt: Date } | null;
  unread: number;
  tabs: Tab[];
  youLinks: MoreLink[];
  labels: ClientShellLabels;
  signOutAction: () => Promise<void>;
  exitAssistAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const initial = (user.name?.trim()?.[0] ?? user.email[0] ?? "·").toUpperCase();

  // Sidebar = the mobile tab set followed by the "you" links, deduped by href.
  const seen = new Set<string>();
  const side: { href: string; label: string; dot?: boolean }[] = [];
  for (const t of tabs) {
    if (!t.href || seen.has(t.href)) continue;
    seen.add(t.href);
    side.push({ href: t.href, label: t.label, dot: t.dot });
  }
  for (const l of youLinks) {
    if (seen.has(l.href)) continue;
    seen.add(l.href);
    side.push({ href: l.href, label: l.label });
  }

  return (
    <div data-portal="client" className="min-h-dvh bg-canvas text-ink">
      {/* AMD-06 §2 — the persistent assist banner: never absent, never subtle. */}
      {assist && (
        <div className="sticky top-0 z-40 flex items-center gap-3 bg-wine px-4 py-2 text-[13px] text-cream">
          <span aria-hidden>✧</span>
          <span>
            Assisting {user.name || user.email}&apos;s account — actions are recorded as yours.
            Until {assist.expiresAt.toISOString().slice(11, 16)} UTC.
          </span>
          <form action={exitAssistAction} className="ml-auto">
            <button className="rounded border border-cream/60 px-3 py-1 text-xs font-semibold text-cream hover:bg-cream/10">
              Exit assist
            </button>
          </form>
        </div>
      )}

      {/* Mobile bar. */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface/60 pt-safe backdrop-blur md:hidden">
        <div className="flex h-12 items-center px-4">
          <Link href="/space" className="font-headline text-lg font-semibold text-wine">
            veritas <span className="text-mocha">✧</span>
          </Link>
          <span className="ml-auto">
            <AvatarSheet initial={initial} name={user.name} email={user.email} signOutAction={signOutAction} />
          </span>
        </div>
      </header>

      <div className="md:flex">
        {/* Desktop sidebar. */}
        <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-r border-line bg-surface/60 px-4 py-5 md:flex">
          <Link href="/space" className="px-2 font-headline text-lg font-semibold text-wine">
            veritas <span className="text-mocha">✧</span>
          </Link>
          <nav className="mt-6 flex flex-1 flex-col gap-0.5 overflow-y-auto text-sm">
            {side.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-ink transition-colors hover:bg-blush hover:text-wine"
              >
                {n.label}
                {(n.dot || (n.href === "/space/messages" && unread > 0)) && (
                  <span className="h-1.5 w-1.5 rounded-full bg-wine" aria-label={labels.topNewMessage} />
                )}
              </Link>
            ))}
          </nav>
          <div className="mt-4 flex items-center gap-2 border-t border-line pt-4">
            <Link
              href="/space/profile"
              aria-label={labels.topProfile}
              className="flex h-8 w-8 items-center justify-center rounded-pill bg-blush text-sm font-semibold text-wine ring-1 ring-line transition-colors hover:bg-blush-deep"
            >
              {initial}
            </Link>
            <span className="min-w-0 flex-1" />
            <ThemeToggle />
            <SignOutForm />
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 pb-tabbar md:px-8 md:py-8">
          <div className="mx-auto max-w-[860px]">{children}</div>
        </main>
      </div>

      <BottomTabBar tabs={tabs} moreLabel={labels.you} moreIcon="person" moreLinks={youLinks} />
    </div>
  );
}
