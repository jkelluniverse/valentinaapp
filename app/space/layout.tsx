import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireClient } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { hasConsent } from "@/lib/consent";
import { SignOutForm } from "@/components/SignOutForm";
import { ThemeToggle } from "@/components/ThemeToggle";

// The client frame (UI-CLIENT-DESIGN A). A hairline top bar — wordmark and a
// calm set of quiet links — over the warm "canvas". data-portal="client" scopes
// the Dusk (dark) theme to this subtree only; the practitioner stays light.
export default async function SpaceLayout({ children }: { children: React.ReactNode }) {
  const user = await requireClient();
  const initial = (user.name?.trim()?.[0] ?? user.email[0] ?? "·").toUpperCase();

  // AMENDMENT-01 §5 — the one-time consent re-ask. Any space page a client lands
  // on sends them to the consent screen first (the screen itself is exempt, so
  // no loop). Once granted, this never fires again.
  const pathname = headers().get("x-pathname") ?? "";
  // Only redirect when we can confirm we're NOT already on the consent screen;
  // an unknown path fails open (write-action gates still protect writes), so
  // there is never a redirect loop.
  if (pathname && !pathname.startsWith("/space/consent") && !(await hasConsent(user.id))) {
    redirect("/space/consent");
  }

  // A soft "•" presence when a reply is waiting — never an unread count.
  // Fail-soft: this runs on EVERY page, so a not-yet-migrated Message table
  // must dim the dot, not take down the whole portal.
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

  return (
    <div data-portal="client" className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-line bg-surface/60 backdrop-blur">
        <div className="mx-auto flex max-w-[720px] items-center gap-4 px-6 py-4">
          <Link href="/space" className="font-headline text-lg font-semibold text-wine">
            veritas <span className="text-mocha">✧</span>
          </Link>
          <nav className="ml-auto hidden items-center gap-4 text-[13px] text-whisper sm:flex">
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
          <span className="ml-auto sm:ml-0">
            <ThemeToggle />
          </span>
          <Link
            href="/space/profile"
            aria-label="Your profile"
            className="flex h-9 w-9 items-center justify-center rounded-pill bg-blush text-sm font-semibold text-wine ring-1 ring-line transition-colors hover:bg-blush-deep"
          >
            {initial}
          </Link>
          <span className="hidden sm:block">
            <SignOutForm />
          </span>
        </div>
      </header>
      <main className="mx-auto max-w-[720px] px-6 py-12">{children}</main>
    </div>
  );
}
