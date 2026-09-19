// C23-CAPTURE — the event floor's PURE configuration. Same discipline as
// lib/signup-config.ts: no database import anywhere in this module's graph, so
// the public /join screen can import it without dragging the data layer behind
// it (C18 §2, the public wall).

export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Length caps. Every optional field is capped SERVER-SIDE; the form's
// maxLength is a courtesy.
export const CAPS = {
  name: 120,
  email: 200,
  phone: 40,
  practiceName: 160,
  note: 500,
  source: 120,
  referredByCode: 64,
} as const;

// The `?src=` the printed event QR carries. One constant so the QR page, the
// admin filters and the acceptance harness cannot drift apart.
export const EVENT_SOURCE = "event-sept23";
export const DEFAULT_SOURCE = "web";

/** The absolute URL a printed QR encodes. PLATFORM_DOMAIN is the platform apex. */
export function joinUrl(src: string = EVENT_SOURCE, origin?: string): string {
  const base = origin ?? (process.env.PLATFORM_DOMAIN ? `https://${process.env.PLATFORM_DOMAIN}` : "");
  const path = `/join?src=${encodeURIComponent(src)}`;
  return base ? `${base.replace(/\/+$/, "")}${path}` : path;
}
