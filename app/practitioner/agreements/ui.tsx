import type { Agreement } from "@prisma/client";

// C22.2 — shared bits for the agreements desk family of pages.

export const fieldCls =
  "rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-wine focus:ring-2 focus:ring-wine/20";

export const STATUS_TONE: Record<string, string> = {
  SIGNED: "bg-blush text-wine",
  SENT: "border border-line text-slate",
  VIEWED: "border border-mocha text-mocha",
  DECLINED: "border border-line text-slate line-through",
  EXPIRED: "border border-line text-whisper",
  VOIDED: "border border-line text-whisper line-through",
  DRAFT: "border border-line text-whisper",
};

export const SHELVES: { key: string; label: string; statuses: string[] | null }[] = [
  { key: "all", label: "All", statuses: null },
  { key: "awaiting", label: "Awaiting signature", statuses: ["SENT", "VIEWED"] },
  { key: "signed", label: "Signed & sealed", statuses: ["SIGNED"] },
  { key: "closed", label: "Declined / expired / voided", statuses: ["DECLINED", "EXPIRED", "VOIDED"] },
];

const TERMINAL: Record<string, string> = {
  DECLINED: "Declined",
  EXPIRED: "Expired",
  VOIDED: "Voided",
};

// The journey of one document, as a colored bar a third-grader can read:
// each little block lights up as the document moves — sent, opened,
// signed, (countersigned,) sealed.
export function StatusBar({ a }: { a: Pick<Agreement, "status" | "sentAt" | "viewedAt" | "signedAt" | "countersignRequired" | "countersignedAt" | "sealedKey"> }) {
  if (TERMINAL[a.status]) {
    return (
      <div data-status-bar className="flex items-center gap-2">
        <div className="h-2 w-full max-w-[260px] rounded-full bg-line" />
        <span className="text-[11px] text-whisper line-through">{TERMINAL[a.status]}</span>
      </div>
    );
  }
  const stages: { label: string; done: boolean }[] = [
    { label: "Sent", done: Boolean(a.sentAt) },
    { label: "Opened", done: Boolean(a.viewedAt) },
    { label: "Signed", done: Boolean(a.signedAt) },
    ...(a.countersignRequired ? [{ label: "Countersigned", done: Boolean(a.countersignedAt) }] : []),
    { label: "Sealed", done: Boolean(a.sealedKey) },
  ];
  const nextIdx = stages.findIndex((s) => !s.done);
  return (
    <div data-status-bar className="flex w-full max-w-[340px] flex-col gap-1">
      <div className="flex gap-1">
        {stages.map((s, i) => (
          <div
            key={s.label}
            className={`h-2 flex-1 rounded-full ${
              s.done ? "bg-wine" : i === nextIdx ? "border border-mocha bg-blush" : "bg-line"
            }`}
            title={s.label}
          />
        ))}
      </div>
      <div className="flex gap-1">
        {stages.map((s, i) => (
          <span
            key={s.label}
            className={`flex-1 text-center text-[10px] leading-tight ${
              s.done ? "font-medium text-wine" : i === nextIdx ? "text-mocha" : "text-whisper"
            }`}
          >
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function signerLabel(
  a: Pick<Agreement, "clientId" | "recipientName" | "recipientEmail">,
  nameFor: Map<string, string | null | undefined>
): string {
  if (a.clientId) return nameFor.get(a.clientId) ?? "—";
  if (a.recipientName) return a.recipientName;
  return "lead";
}
