"use client";

import { useEffect, useState } from "react";

// AMENDMENT-02 §4 — a gentle, one-time, dismissible nudge on iPhone Safari to
// add Veritas to the Home Screen. Only shows on iOS Safari, not already
// installed, and never again once dismissed.
const KEY = "veritas-a2h-dismissed";

export function PwaHint() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY)) return;
    } catch {
      return;
    }
    const ua = window.navigator.userAgent;
    const isIOS = /iPhone|iPod/.test(ua);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    // @ts-expect-error - iOS-only standalone flag
    const standalone = window.navigator.standalone === true ||
      window.matchMedia("(display-mode: standalone)").matches;
    if (isIOS && isSafari && !standalone) {
      const t = setTimeout(() => setShow(true), 1600);
      return () => clearTimeout(t);
    }
  }, []);

  if (!show) return null;

  function dismiss() {
    setShow(false);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* private mode */
    }
  }

  return (
    <div className="above-tabbar fixed inset-x-3 z-50 rounded-card border border-line bg-surface p-4 shadow-card md:hidden">
      <div className="flex items-start gap-3">
        <span aria-hidden className="text-xl leading-none text-wine">
          ✧
        </span>
        <div className="flex-1">
          <p className="text-sm text-ink">
            Add <span className="font-medium text-ink-strong">Veritas</span> to your Home Screen for
            the full experience — tap{" "}
            <span aria-hidden className="font-semibold">
              ⎋
            </span>{" "}
            Share, then <em>Add to Home Screen</em>.
          </p>
        </div>
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-pill px-2 py-1 text-whisper hover:text-wine"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
