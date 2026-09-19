"use client";

import { useEffect, useRef, useState } from "react";

// AMENDMENT-02 §3.3 — the one bottom-sheet. Every desktop side panel / menu on
// mobile becomes this: a drag handle, a scrim, swipe-down to dismiss, keyboard-
// and overscroll-safe. Warm Stone throughout; respects reduced motion via CSS.
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  const [dragY, setDragY] = useState(0);
  const startY = useRef<number | null>(null);
  const mounted = useRef(false);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    mounted.current = true;
  }, []);

  if (!open) return null;

  function onTouchStart(e: React.TouchEvent) {
    startY.current = e.touches[0].clientY;
  }
  function onTouchMove(e: React.TouchEvent) {
    if (startY.current === null) return;
    const dy = e.touches[0].clientY - startY.current;
    if (dy > 0) setDragY(dy);
  }
  function onTouchEnd() {
    if (dragY > 90) onClose();
    setDragY(0);
    startY.current = null;
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center">
      <button
        aria-label="Close"
        onClick={onClose}
        className="sheet-scrim absolute inset-0 bg-ink-strong/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ transform: dragY ? `translateY(${dragY}px)` : undefined }}
        className="sheet-panel relative max-h-[85dvh] w-full overflow-y-auto rounded-t-card bg-surface pb-safe shadow-card sm:max-w-md sm:rounded-card"
      >
        <div
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          className="sticky top-0 z-10 flex flex-col items-center gap-2 rounded-t-card bg-surface pb-2 pt-3"
        >
          <span className="h-1 w-10 rounded-pill bg-line" aria-hidden />
          {title && (
            <p className="text-eyebrow font-semibold uppercase tracking-wide text-mocha">{title}</p>
          )}
        </div>
        <div className="px-5 pb-5 pt-1">{children}</div>
      </div>
    </div>
  );
}
