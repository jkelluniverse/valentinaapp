"use client";

import { useFormStatus } from "react-dom";

// A submit button that tells the truth about what's happening: a spinner while
// the save is in flight (the form is disabled-ish — double taps ignored), and
// the caller renders the "Saved ✓" confirmation right beside it.
export function SaveButton({
  children,
  variant = "outline",
}: {
  children: React.ReactNode;
  variant?: "outline" | "solid";
}) {
  const { pending } = useFormStatus();
  const base =
    variant === "solid"
      ? "rounded-md bg-wine px-5 py-2.5 text-sm font-medium text-cream transition-colors hover:bg-wine/90"
      : "rounded-md border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush";
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${base} inline-flex items-center gap-2 disabled:cursor-wait disabled:opacity-70`}
    >
      {pending && (
        <span
          aria-hidden
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {pending ? "Saving…" : children}
    </button>
  );
}
