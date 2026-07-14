import Link from "next/link";
import { SITE } from "@/content/site-content";
import { Img } from "./Img";

// C18 — the public marketing chrome. The brand here is HERS (Valentina Vélez),
// not the internal "veritas" product name. Her logo drops in from /public with a
// graceful text fallback. Imports only next/link + static content + a client
// image slot — no data, no portal.

function Wordmark({ variant = "dark" }: { variant?: "dark" | "light" }) {
  // One logo file (dark wine lockup); the footer inverts it to light via CSS.
  return (
    <Img
      src="/valentina-logo.png"
      alt={SITE.practitioner}
      width={352}
      height={220}
      className={
        variant === "light"
          ? "h-11 w-auto shrink-0 self-start opacity-90 [filter:brightness(0)_invert(1)]"
          : "h-14 w-auto shrink-0"
      }
      fallback={
        <span
          className={`font-headline text-[22px] font-semibold ${
            variant === "light" ? "text-cream" : "text-wine"
          }`}
        >
          {SITE.practitioner}
        </span>
      }
    />
  );
}

export function PublicHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-line bg-canvas/85 backdrop-blur">
      <div className="mx-auto flex h-20 max-w-6xl items-center justify-between px-5 md:px-8">
        <Link href="/" aria-label={SITE.practitioner}>
          <Wordmark />
        </Link>
        <nav className="flex items-center gap-5 text-sm">
          <Link href="/book" className="hidden font-medium text-ink hover:text-wine sm:inline">
            Book a call
          </Link>
          <Link
            href="/login"
            className="rounded-pill border border-mocha px-4 py-1.5 font-medium text-wine transition-colors hover:bg-blush"
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
    <footer className="bg-wine-dark text-cream/70">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-11 md:flex-row md:items-center md:justify-between md:px-8">
        <div className="flex flex-col items-start gap-1.5">
          <Wordmark variant="light" />
          <p className="text-sm text-cream/70">{SITE.credential}</p>
          <p className="text-xs text-cream/50">
            Coaching, not medical or psychological treatment. © {SITE.practitioner}
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-6 text-sm">
          <Link href="/book" className="text-cream/85 hover:text-white">
            Book a discovery call
          </Link>
          <Link href="/privacy" className="text-cream/85 hover:text-white">
            Privacy
          </Link>
          <Link href="/login" className="text-cream/85 hover:text-white">
            Log in
          </Link>
        </nav>
      </div>
    </footer>
  );
}
