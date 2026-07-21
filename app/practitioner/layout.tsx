import { requirePractitioner } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { signOut } from "@/auth";
import { getLayout } from "@/components/layouts";

// The Study — thin data/action wrapper. The chrome itself lives in the
// tenant's layout tree (components/layouts/*); this file authenticates,
// gathers the little data the shell needs, and selects the layout.
// C18 §2 — the portal is private; never index it.
export const metadata = { robots: { index: false, follow: false } };

export default async function PractitionerLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePractitioner();

  // Unread client messages → a soft dot on the Messages tab, a count on desktop.
  const unread = await prisma.message
    .count({ where: { senderRole: "CLIENT", readAt: null, deletedAt: null } })
    .catch(() => 0);

  async function doSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  const { getTenant } = await import("@/lib/tenancy");
  const tenant = await getTenant();
  const { PractitionerShell } = getLayout(tenant.layoutKey);
  return (
    <PractitionerShell user={{ name: user.name, email: user.email }} unread={unread} signOutAction={doSignOut}>
      {children}
    </PractitionerShell>
  );
}
