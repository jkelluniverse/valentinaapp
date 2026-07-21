import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
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
// C18 §2 — the portal is private; never index it.
export const metadata = { robots: { index: false, follow: false } };

export default async function SpaceLayout({ children }: { children: React.ReactNode }) {
  const user = await requireClient();
  // AMD-05 A5.1 — chrome labels follow the reader's User.locale (server-side;
  // client components receive translated strings as props).
  const t = await getTranslations("nav");
  const initial = (user.name?.trim()?.[0] ?? user.email[0] ?? "·").toUpperCase();

  const pathname = headers().get("x-pathname") ?? "";

  // AMD-06 §1 — a temp password works exactly once as a door: the next stop is
  // choosing their own. (Never triggered during assist — that's her session.)
  if (!user.assistedBy && pathname && !pathname.startsWith("/space/consent")) {
    const flag = await prisma.user.findUnique({
      where: { id: user.id },
      select: { mustChangePassword: true },
    });
    if (flag?.mustChangePassword) redirect("/must-change");
  }

  // AMENDMENT-01 §5 — the one-time consent re-ask (consent route exempt).
  if (
    !user.assistedBy &&
    pathname &&
    !pathname.startsWith("/space/consent") &&
    !(await hasConsent(user.id))
  ) {
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
    { key: "home", label: t("tabs.home"), href: "/space", icon: "home" },
    { key: "path", label: t("tabs.path"), href: "/space/courses", icon: "path" },
    { key: "reflect", label: t("tabs.reflect"), href: "/space/new", icon: "star", center: true },
    { key: "messages", label: t("tabs.messages"), href: "/space/messages", icon: "message", dot: unread > 0 },
  ];
  const youLinks: MoreLink[] = [
    { href: "/space/first-map", label: t("menu.firstMap"), hint: t("menu.firstMapHint") },
    { href: "/space/journey", label: t("menu.journey"), hint: t("menu.journeyHint") },
    { href: "/space/design", label: t("menu.design"), hint: t("menu.designHint") },
    { href: "/space/design/reading", label: t("menu.reading"), hint: t("menu.readingHint") },
    { href: "/space/schedule", label: t("menu.sessions"), hint: t("menu.sessionsHint") },
    { href: "/space/settings", label: t("menu.settings"), hint: t("menu.settingsHint") },
    { href: "/space/profile", label: t("menu.profile"), hint: t("menu.profileHint") },
  ];

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  async function doExitAssist() {
    "use server";
    const { requirePractitioner } = await import("@/lib/auth-guards");
    const { endAssist } = await import("@/lib/assist");
    const me = await requirePractitioner();
    const clientId = user.id;
    await endAssist(me.id);
    redirect(`/practitioner/clients/${clientId}`);
  }

  return (
    <div data-portal="client" className="min-h-dvh bg-canvas text-ink">
      {/* AMD-06 §2 — the persistent assist banner: never absent, never subtle. */}
      {user.assistedBy && (
        <div className="sticky top-0 z-40 flex items-center gap-3 bg-wine px-4 py-2 text-[13px] text-cream">
          <span aria-hidden>✧</span>
          <span>
            Assisting {user.name || user.email}&apos;s account — actions are recorded as yours.
            Until {user.assistedBy.expiresAt.toISOString().slice(11, 16)} UTC.
          </span>
          <form action={doExitAssist} className="ml-auto">
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
            <AvatarSheet initial={initial} name={user.name} email={user.email} signOutAction={doSignOut} />
          </span>
        </div>

        {/* Desktop bar: wordmark + quiet links. */}
        <div className="mx-auto hidden max-w-[720px] items-center gap-4 px-6 py-4 md:flex">
          <Link href="/space" className="font-headline text-lg font-semibold text-wine">
            veritas <span className="text-mocha">✧</span>
          </Link>
          <nav className="ml-auto flex items-center gap-4 text-[13px] text-whisper">
            <Link href="/space/first-map" className="underline-offset-4 hover:text-wine hover:underline">
              {t("top.map")}
            </Link>
            <Link href="/space/courses" className="underline-offset-4 hover:text-wine hover:underline">
              {t("top.path")}
            </Link>
            <Link href="/space/journey" className="underline-offset-4 hover:text-wine hover:underline">
              {t("top.journey")}
            </Link>
            <Link href="/space/schedule" className="underline-offset-4 hover:text-wine hover:underline">
              {t("top.sessions")}
            </Link>
            <Link href="/space/design" className="underline-offset-4 hover:text-wine hover:underline">
              {t("top.design")}
            </Link>
            <Link href="/space/settings" className="underline-offset-4 hover:text-wine hover:underline">
              {t("top.settings")}
            </Link>
            <Link href="/space/messages" className="inline-flex items-center gap-1 underline-offset-4 hover:text-wine hover:underline">
              {t("top.messages")}
              {unread > 0 && <span className="h-1.5 w-1.5 rounded-full bg-wine" aria-label={t("top.newMessage")} />}
            </Link>
          </nav>
          <span className="ml-2">
            <ThemeToggle />
          </span>
          <Link
            href="/space/profile"
            aria-label={t("top.profile")}
            className="flex h-9 w-9 items-center justify-center rounded-pill bg-blush text-sm font-semibold text-wine ring-1 ring-line transition-colors hover:bg-blush-deep"
          >
            {initial}
          </Link>
          <SignOutForm />
        </div>
      </header>

      <main className="mx-auto max-w-[720px] px-4 py-6 pb-tabbar md:px-6 md:py-10">{children}</main>

      <BottomTabBar tabs={tabs} moreLabel={t("you")} moreIcon="person" moreLinks={youLinks} />
    </div>
  );
}
