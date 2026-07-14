import Link from "next/link";
import { SITE } from "@/content/site-content";

// C18 §2/§6 — public chrome. Imports ONLY next/link + static content. No session,
// no portal libs, no data. The quiet "Log in" door lives top-right of every page
// and routes to /login, which already lands each role in the right portal.

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center px-5 md:px-8">
        <Link href="/" className="font-headline text-xl font-semibold text-wine">
          veritas <span className="text-mocha">✦</span>
        </Link>
        <nav className="ml-auto flex items-center gap-5 text-sm">
          <Link href="/book" className="hidden text-ink underline-offset-4 hover:text-wine hover:underline sm:inline">
            Book a call
          </Link>
          <Link
            href="/login"
            className="rounded-pill border border-wine/40 px-4 py-1.5 font-medium text-wine transition-colors hover:bg-wine hover:text-white"
          >
            Log in
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="mt-24 border-t border-line/70 bg-blush/20">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-5 py-10 text-sm text-slate md:flex-row md:items-center md:px-8">
        <div className="flex flex-col gap-0.5">
          <span className="font-headline text-base font-semibold text-wine">{SITE.practitioner}</span>
          <span className="text-whisper">{SITE.credential}</span>
        </div>
        <nav className="flex flex-wrap items-center gap-4 md:ml-auto">
          <Link href="/book" className="underline-offset-4 hover:text-wine hover:underline">
            Book a discovery call
          </Link>
          <Link href="/privacy" className="underline-offset-4 hover:text-wine hover:underline">
            Privacy
          </Link>
          <Link href="/login" className="underline-offset-4 hover:text-wine hover:underline">
            Log in
          </Link>
        </nav>
      </div>
      <p className="pb-8 text-center text-xs text-whisper">
        Coaching, not medical or psychological treatment. © {SITE.practitioner}
      </p>
    </footer>
  );
}
