import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireClient } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { hasConsent } from "@/lib/consent";
import { signOut } from "@/auth";
import { SignOutForm } from "@/components/SignOutForm";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AvatarSheet } from "@/components/mobile/AvatarSheet";
import { BottomTabBar, type Tab, type MoreLink } from "@/components/mobile/BottomTabBar";

// The client frame (UI-CLIENT-DESIGN + AMENDMENT-02 Mobile-First). Mobile: a
// 48px top bar (wordmark + avatar sheet) over the notch, and a bottom tab bar
// with the Reflect flourish at center. Desktop (≥768px): the quiet top-row of
// links returns, no tab bar. data-portal="client" scopes Dusk to this subtree.
export default async function SpaceLayout({ children }: { children: React.ReactNode }) {
  const user = await requireClient();
  const initial = (user.name?.trim()?.[0] ?? user.email[0] ?? "·").toUpperCase();

  // AMENDMENT-01 §5 — the one-time consent re-ask (consent route exempt).
  const pathname = headers().get("x-pathname") ?? "";
  if (pathname && !pathname.startsWith("/space/consent") && !(await hasConsent(user.id))) {
    redirect("/space/consent");
  }

  // A soft "•" presence when a reply is waiting — never an unread count.
  const unread = await prisma.message
    .count({
      where: {
        conversation: { clientId: user.id },
        senderRole: "PRACTITIONER",
        readAt: null,
        deletedAt: null,
      },
    })
    .catch(() => 0);

  const tabs: Tab[] = [
    { key: "home", label: "Home", href: "/space", icon: "home" },
    { key: "path", label: "Path", href: "/space/courses", icon: "path" },
    { key: "reflect", label: "Reflect", href: "/space/new", icon: "star", center: true },
    { key: "messages", label: "Messages", href: "/space/messages", icon: "message", dot: unread > 0 },
  ];
  const youLinks: MoreLink[] = [
    { href: "/space/journey", label: "Your journey", hint: "The record, over time" },
    { href: "/space/design", label: "Your design", hint: "Charts & First Map" },
    { href: "/space/design/reading", label: "Your reading", hint: "What it all means to you" },
    { href: "/space/schedule", label: "Sessions", hint: "Book & upcoming" },
    { href: "/space/profile", label: "Profile", hint: "Your details" },
  ];

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div data-portal="client" className="min-h-dvh bg-canvas text-ink">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/60 pt-safe backdrop-blur">
        {/* Mobile bar: wordmark + avatar only. */}
        <div className="flex h-12 items-center px-4 md:hidden">
          <Link href="/space" className="font-headline text-lg font-semibold text-wine">
            veritas <span className="text-mocha">✧</span>
          </Link>
          <span className="ml-auto">
            <AvatarSheet initial={initial} name={user.name} email={user.email} signOutAction={doSignOut} />
          </span>
        </div>

        {/* Desktop bar: wordmark + quiet links. */}
        <div className="mx-auto hidden max-w-[720px] items-center gap-4 px-6 py-4 md:flex">
          <Link href="/space" className="font-headline text-lg font-semibold text-wine">
            veritas <span className="text-mocha">✧</span>
          </Link>
          <nav className="ml-auto flex items-center gap-4 text-[13px] text-whisper">
            <Link href="/space/courses" className="underline-offset-4 hover:text-wine hover:underline">
              Your path
            </Link>
            <Link href="/space/journey" className="underline-offset-4 hover:text-wine hover:underline">
              Your journey
            </Link>
            <Link href="/space/schedule" className="underline-offset-4 hover:text-wine hover:underline">
              Sessions
            </Link>
            <Link href="/space/design" className="underline-offset-4 hover:text-wine hover:underline">
              Your design
            </Link>
            <Link href="/space/messages" className="inline-flex items-center gap-1 underline-offset-4 hover:text-wine hover:underline">
              Messages
              {unread > 0 && <span className="h-1.5 w-1.5 rounded-full bg-wine" aria-label="new message" />}
            </Link>
          </nav>
          <span className="ml-2">
            <ThemeToggle />
          </span>
          <Link
            href="/space/profile"
            aria-label="Your profile"
            className="flex h-9 w-9 items-center justify-center rounded-pill bg-blush text-sm font-semibold text-wine ring-1 ring-line transition-colors hover:bg-blush-deep"
          >
            {initial}
          </Link>
          <SignOutForm />
        </div>
      </header>

      <main className="mx-auto max-w-[720px] px-6 py-10 pb-tabbar">{children}</main>

      <BottomTabBar tabs={tabs} moreLabel="You" moreIcon="person" moreLinks={youLinks} />
    </div>
  );
}
