import Link from "next/link";
import { SignOutForm } from "@/components/SignOutForm";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AvatarSheet } from "@/components/mobile/AvatarSheet";
import { BottomTabBar, type Tab, type MoreLink } from "@/components/mobile/BottomTabBar";

// PLATFORM Layer 1 — layout: journey-v1, client side (the Sanctuary frame).
// Extracted VERBATIM from Valentina's live layout (Phase 0 Rule 0.1). This
// tree arranges; features behave. Data, translations, and server actions
// arrive as props from the app layout — the shell knows nothing about them.

export type ClientShellLabels = {
  topMap: string;
  topPath: string;
  topJourney: string;
  topSessions: string;
  topDesign: string;
  topSettings: string;
  topMessages: string;
  topNewMessage: string;
  topProfile: string;
  you: string;
};

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
      <header className="sticky top-0 z-30 border-b border-line bg-surface/60 pt-safe backdrop-blur">
        {/* Mobile bar: wordmark + avatar only. */}
        <div className="flex h-12 items-center px-4 md:hidden">
          <Link href="/space" className="font-headline text-lg font-semibold text-wine">
            veritas <span className="text-mocha">✧</span>
          </Link>
          <span className="ml-auto">
            <AvatarSheet initial={initial} name={user.name} email={user.email} signOutAction={signOutAction} />
          </span>
        </div>

        {/* Desktop bar: wordmark + quiet links. */}
        <div className="mx-auto hidden max-w-[720px] items-center gap-4 px-6 py-4 md:flex">
          <Link href="/space" className="font-headline text-lg font-semibold text-wine">
            veritas <span className="text-mocha">✧</span>
          </Link>
          <nav className="ml-auto flex items-center gap-4 text-[13px] text-whisper">
            <Link href="/space/first-map" className="underline-offset-4 hover:text-wine hover:underline">
              {labels.topMap}
            </Link>
            <Link href="/space/courses" className="underline-offset-4 hover:text-wine hover:underline">
              {labels.topPath}
            </Link>
            <Link href="/space/journey" className="underline-offset-4 hover:text-wine hover:underline">
              {labels.topJourney}
            </Link>
            <Link href="/space/schedule" className="underline-offset-4 hover:text-wine hover:underline">
              {labels.topSessions}
            </Link>
            <Link href="/space/design" className="underline-offset-4 hover:text-wine hover:underline">
              {labels.topDesign}
            </Link>
            <Link href="/space/settings" className="underline-offset-4 hover:text-wine hover:underline">
              {labels.topSettings}
            </Link>
            <Link href="/space/messages" className="inline-flex items-center gap-1 underline-offset-4 hover:text-wine hover:underline">
              {labels.topMessages}
              {unread > 0 && <span className="h-1.5 w-1.5 rounded-full bg-wine" aria-label={labels.topNewMessage} />}
            </Link>
          </nav>
          <span className="ml-2">
            <ThemeToggle />
          </span>
          <Link
            href="/space/profile"
            aria-label={labels.topProfile}
            className="flex h-9 w-9 items-center justify-center rounded-pill bg-blush text-sm font-semibold text-wine ring-1 ring-line transition-colors hover:bg-blush-deep"
          >
            {initial}
          </Link>
          <SignOutForm />
        </div>
      </header>

      <main className="mx-auto max-w-[720px] px-4 py-6 pb-tabbar md:px-6 md:py-10">{children}</main>

      <BottomTabBar tabs={tabs} moreLabel={labels.you} moreIcon="person" moreLinks={youLinks} />
    </div>
  );
}
