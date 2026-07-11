"use client";

import { useFormStatus } from "react-dom";

// A submit button that shows a quiet spinner while its form's server action
// runs — so slow work (AI scans, drafts) visibly "took" the tap.
export function PendingButton({
  children,
  pendingLabel,
  className = "",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex items-center justify-center gap-2 ${className} disabled:cursor-wait disabled:opacity-70`}
    >
      {pending && (
        <span
          aria-hidden
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {pending ? pendingLabel ?? children : children}
    </button>
  );
}
