// AMENDMENT-02 §1 — simple line icons for the bottom tab bar. Stroke uses
// currentColor so whisper→wine happens by text color, no per-icon theming.

type P = { className?: string };
const base = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function HomeIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
    </svg>
  );
}
export function UsersIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.5a3 3 0 0 1 0 5.8M18 20a5.5 5.5 0 0 0-3-4.9" />
    </svg>
  );
}
export function MessageIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M4 5h16v11H8l-4 3.5V5Z" />
    </svg>
  );
}
export function CalendarIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" />
    </svg>
  );
}
export function MoreIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <circle cx="5" cy="12" r="1.4" />
      <circle cx="12" cy="12" r="1.4" />
      <circle cx="19" cy="12" r="1.4" />
    </svg>
  );
}
export function PenIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M4 20h16" />
      <path d="M14.5 4.5l5 5L9 20l-5 1 1-5L14.5 4.5Z" />
    </svg>
  );
}
export function StarIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M12 3.5v17M3.5 12h17M6 6l12 12M18 6 6 18" />
    </svg>
  );
}
export function PathIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <path d="M12 3.5 20 8l-8 4.5L4 8l8-4.5Z" />
      <path d="M4 12.5 12 17l8-4.5M4 16.5 12 21l8-4.5" />
    </svg>
  );
}
export function PersonIcon({ className }: P) {
  return (
    <svg {...base} className={className} aria-hidden>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </svg>
  );
}

// Registry so server layouts can pass a serializable icon NAME (a string) to
// the client tab bar, which resolves it here. Function components can't cross
// the server→client props boundary.
export type IconName =
  | "home"
  | "users"
  | "message"
  | "calendar"
  | "pen"
  | "star"
  | "path"
  | "person"
  | "more";

export const ICONS: Record<IconName, (props: P) => JSX.Element> = {
  home: HomeIcon,
  users: UsersIcon,
  message: MessageIcon,
  calendar: CalendarIcon,
  pen: PenIcon,
  star: StarIcon,
  path: PathIcon,
  person: PersonIcon,
  more: MoreIcon,
};
