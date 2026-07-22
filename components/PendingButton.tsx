"use client";

import { useFormStatus } from "react-dom";

// A submit button that shows a quiet spinner while its form's server action
// runs — so slow work (AI scans, drafts) visibly "took" the tap. This is the
// house submit button: every server-action form uses it.
//
// Multi-button forms: pass `formAction` and the spinner appears only on the
// button whose action is actually running (the others just disable).
export function PendingButton({
  children,
  pendingLabel,
  className = "",
  formAction,
  name,
  value,
  disabled,
  title,
  formNoValidate,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  formAction?: any;
  name?: string;
  value?: string;
  disabled?: boolean;
  title?: string;
  formNoValidate?: boolean;
}) {
  const { pending, action } = useFormStatus();
  const mine = pending && (formAction == null || action === formAction);
  return (
    <button
      type="submit"
      formAction={formAction}
      formNoValidate={formNoValidate}
      name={name}
      value={value}
      title={title}
      disabled={pending || disabled}
      className={`inline-flex items-center justify-center gap-2 ${className} disabled:cursor-wait disabled:opacity-70`}
    >
      {mine && (
        <span
          aria-hidden
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
        />
      )}
      {mine ? pendingLabel ?? children : children}
    </button>
  );
}
