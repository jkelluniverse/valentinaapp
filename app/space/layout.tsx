import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireClient } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { hasConsent } from "@/lib/consent";
import { signOut } from "@/auth";
import { getLayout } from "@/components/layouts";
import type { Tab, MoreLink } from "@/components/mobile/BottomTabBar";

// The client frame — thin data/action wrapper (UI-CLIENT-DESIGN + AMD-02).
// The chrome lives in the tenant's layout tree (components/layouts/*); this
// file authenticates, runs the gates, gathers data + translations, and
// selects the layout. C18 §2 — the portal is private; never index it.
export const metadata = { robots: { index: false, follow: false } };

export default async function SpaceLayout({ children }: { children: React.ReactNode }) {
  const user = await requireClient();
  // AMD-05 A5.1 — chrome labels follow the reader's User.locale (server-side;
  // client components receive translated strings as props).
  const t = await getTranslations("nav");

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

  // ONBOARDING §4.4 — intake is the forced landing while IN_PROGRESS. The
  // gate fires ONLY when the client has an active flow, so existing clients
  // (no flow) are never redirected and the pixel gate is safe. Assist
  // sessions never land in intake (that's her session, not the client's).
  const onIntake = pathname.startsWith("/space/intake");
  if (!user.assistedBy && pathname && !onIntake) {
    const activeFlow = await prisma.intakeFlow
      .findFirst({ where: { clientId: user.id, purpose: "INITIAL", status: "IN_PROGRESS" }, select: { id: true } })
      .catch(() => null);
    if (activeFlow) redirect("/space/intake");
  }
  // The intake route is a takeover: render it bare, without the space chrome.
  if (onIntake) return <>{children}</>;

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

  const { getTenant } = await import("@/lib/tenancy");
  const tenant = await getTenant();
  const { ClientShell } = getLayout(tenant.layoutKey);
  return (
    <ClientShell
      user={{ name: user.name, email: user.email }}
      assist={user.assistedBy ? { expiresAt: user.assistedBy.expiresAt } : null}
      unread={unread}
      tabs={tabs}
      youLinks={youLinks}
      labels={{
        topMap: t("top.map"),
        topPath: t("top.path"),
        topJourney: t("top.journey"),
        topSessions: t("top.sessions"),
        topDesign: t("top.design"),
        topSettings: t("top.settings"),
        topMessages: t("top.messages"),
        topNewMessage: t("top.newMessage"),
        topProfile: t("top.profile"),
        you: t("you"),
      }}
      signOutAction={doSignOut}
      exitAssistAction={doExitAssist}
      wordmark={(tenant.branding ?? {}).portalTitle || "veritas"}
    >
      <DemoTenantBanner />
      {children}
    </ClientShell>
  );
}

// PLATFORM §7 — DEMO banner (null for ACTIVE tenants; María byte-identical).
async function DemoTenantBanner() {
  const { DemoBanner } = await import("@/components/DemoBanner");
  return <DemoBanner />;
}
