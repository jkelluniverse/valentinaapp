// Small, pure presentational pieces shared across screens. No client hooks, so
// they render fine inside server components.

// The signature tan rule that sits under a headline (BRAND.md §5).
export function SignatureRule({ className = "" }: { className?: string }) {
  return <div className={`h-px w-12 bg-mocha ${className}`} />;
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-label font-semibold uppercase tracking-wide text-mocha">{children}</p>
  );
}

type Status = "Active" | "Invited" | "Revoked" | "Inactive";

const PILL: Record<Status, string> = {
  Active: "bg-blush-deep text-wine",
  Invited: "border border-mocha text-mocha",
  Revoked: "bg-line/50 text-slate",
  Inactive: "bg-line/50 text-slate",
};

export function StatusPill({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${PILL[status]}`}
    >
      {status}
    </span>
  );
}
