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
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/85 pb-safe backdrop-blur-md md:hidden"
      >
        <ul className="mx-auto flex max-w-lg items-stretch justify-around">
          {tabs.map((t) => {
            const active = isActive(t);
            const Icon = ICONS[t.icon];
            const tone = active ? "text-wine" : "text-whisper";
            const inner = (
              <span className="relative flex flex-col items-center justify-center gap-1">
                {t.center ? (
                  <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-wine text-white shadow-stone">
                    <Icon className="h-6 w-6" />
                  </span>
                ) : (
                  <span className="relative">
                    <Icon className="h-[22px] w-[22px]" />
                    {t.dot && (
                      <span className="absolute -right-1.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-wine" />
                    )}
                  </span>
                )}
                <span className={`text-[11px] leading-none ${t.center ? "text-wine" : ""}`}>
                  {t.label}
                </span>
              </span>
            );
            return (
              <li key={t.key} className="flex-1">
                <Link
                  href={t.href ?? "#"}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-[3.5rem] items-center justify-center py-1.5 ${tone} transition-colors`}
                >
                  {inner}
                </Link>
              </li>
            );
          })}
          {moreLinks.length > 0 && (
            <li className="flex-1">
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                aria-haspopup="dialog"
                className={`flex min-h-[3.5rem] w-full items-center justify-center py-1.5 transition-colors ${
                  moreActive ? "text-wine" : "text-whisper"
                }`}
              >
                <span className="flex flex-col items-center justify-center gap-1">
                  {MoreGlyph ? <MoreGlyph className="h-[22px] w-[22px]" /> : <MoreDots />}
                  <span className="text-[11px] leading-none">{moreLabel}</span>
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
