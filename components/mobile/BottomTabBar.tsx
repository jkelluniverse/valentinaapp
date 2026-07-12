"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Sheet } from "./Sheet";
import { ICONS, type IconName } from "./icons";

// AMENDMENT-02 §1 — the bottom tab bar (the missing spine). Mobile only
// (<768px); hidden on desktop where the top-row links take over. Quiet Warm
// Stone: hairline top, blur over canvas, whisper inactive / wine active, a soft
// dot (never a number) for "something new". The center tab may render as a
// slightly raised flourish. "More" opens a calm sheet-list, not a drawer.
// The bar hides on immersive routes and returns on exit.

export type Tab = {
  key: string;
  label: string;
  href?: string; // omit for the More tab (opens the sheet)
  icon: IconName; // a serializable name; resolved to a component client-side
  dot?: boolean;
  center?: boolean; // the one raised flourish (client Reflect)
  match?: string; // path prefix that counts as active (defaults to href)
};

export type MoreLink = { href: string; label: string; hint?: string };

export function BottomTabBar({
  tabs,
  moreLabel = "More",
  moreIcon,
  moreLinks = [],
  hideOn = [],
}: {
  tabs: Tab[];
  moreLabel?: string;
  moreIcon?: IconName;
  moreLinks?: MoreLink[];
  hideOn?: string[];
}) {
  const MoreGlyph = moreIcon ? ICONS[moreIcon] : null;
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  // Immersive surfaces (writing, video, constellation) hide the bar entirely.
  if (hideOn.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return null;

  const isActive = (t: Tab) => {
    const base = t.match ?? t.href;
    if (!base) return false;
    if (base === "/space" || base === "/practitioner") return pathname === base;
    return pathname === base || pathname.startsWith(`${base}/`);
  };
  const moreActive = moreLinks.some(
    (l) => pathname === l.href || pathname.startsWith(`${l.href}/`),
  );

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-mocha/30 bg-surface pb-safe shadow-[0_-6px_24px_rgba(88,12,34,0.12)] md:hidden"
      >
        <ul className="mx-auto flex max-w-lg items-stretch justify-around">
          {tabs.map((t) => {
            const active = isActive(t);
            const Icon = ICONS[t.icon];
            const tone = active ? "text-wine" : "text-whisper";
            const inner = (
              <span className="relative flex flex-col items-center justify-center gap-1">
                {t.center ? (
                  <span className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-wine text-white shadow-stone ring-4 ring-surface">
                    <Icon className="h-6 w-6" />
                  </span>
                ) : (
                  <span
                    className={`relative flex h-9 w-12 items-center justify-center rounded-pill transition-colors ${
                      active ? "bg-blush-deep" : ""
                    }`}
                  >
                    <Icon className="h-[22px] w-[22px]" />
                    {t.dot && (
                      <span className="absolute right-2 top-1 h-2 w-2 rounded-full bg-wine ring-2 ring-surface" />
                    )}
                  </span>
                )}
                <span
                  className={`text-[11px] leading-none ${active || t.center ? "font-semibold text-wine" : ""}`}
                >
                  {t.label}
                </span>
              </span>
            );
            return (
              <li key={t.key} className="relative flex-1">
                {active && !t.center && (
                  <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-wine" aria-hidden />
                )}
                <Link
                  href={t.href ?? "#"}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-[3.75rem] items-center justify-center py-1.5 ${tone} transition-colors`}
                >
                  {inner}
                </Link>
              </li>
            );
          })}
          {moreLinks.length > 0 && (
            <li className="relative flex-1">
              {moreActive && (
                <span className="absolute inset-x-6 top-0 h-0.5 rounded-full bg-wine" aria-hidden />
              )}
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                aria-haspopup="dialog"
                className={`flex min-h-[3.75rem] w-full items-center justify-center py-1.5 transition-colors ${
                  moreActive ? "text-wine" : "text-whisper"
                }`}
              >
                <span className="flex flex-col items-center justify-center gap-1">
                  <span
                    className={`flex h-9 w-12 items-center justify-center rounded-pill transition-colors ${
                      moreActive ? "bg-blush-deep" : ""
                    }`}
                  >
                    {MoreGlyph ? <MoreGlyph className="h-[22px] w-[22px]" /> : <MoreDots />}
                  </span>
                  <span className={`text-[11px] leading-none ${moreActive ? "font-semibold text-wine" : ""}`}>
                    {moreLabel}
                  </span>
                </span>
              </button>
            </li>
          )}
        </ul>
      </nav>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title={moreLabel}>
        <ul className="flex flex-col">
          {moreLinks.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                onClick={() => setMoreOpen(false)}
                className="flex min-h-[56px] flex-col justify-center gap-0.5 border-b border-line py-3 last:border-0"
              >
                <span className="text-[15px] font-medium text-ink-strong">{l.label}</span>
                {l.hint && <span className="text-[13px] text-whisper">{l.hint}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}

function MoreDots() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </svg>
  );
}
