// C23-SIGNUP — the front door's PURE configuration: the shapes and lists that
// both the public screens and the server action need, with no database import
// anywhere in the module graph. The public surface imports THIS, never
// lib/signup.ts, so a marketing page can never drag the data layer behind it.

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}$/; // same regex lib/provisioning validates on

// The house password floor (app/must-change/actions.ts uses the same 8).
export const PASSWORD_MIN = 8;

// The three standard modules — the platform's structured-content launch trio,
// the same set provisioning/demo-journey.json (journey-v1 + warm-clay) carries.
export const STANDARD_MODULES = ["body-graph", "archetypal-keys", "values-spiral"] as const;

// §4.2 — the reserved list, decided here and nowhere else. Three families:
//   1. hosts that are OURS: the production practice, the platform's own names,
//      and every infrastructure subdomain a mail/CDN/proxy record could want.
//   2. product paths a practitioner claiming them would make ambiguous or
//      dangerous (`admin`, `login`, `api`, `billing`…).
//   3. anything that reads as a system word rather than a practice.
// Plus, dynamically, every slug already taken by a tenant, and the `demo-`
// prefix the platform's own demo tenants live under.
export const RESERVED_SLUGS: readonly string[] = [
  // ours
  "valentina", "psychefolio", "veritas", "platform", "www", "app", "apps", "web",
  "staging", "stage", "prod", "production", "preview", "dev", "test", "demo", "sandbox",
  // infrastructure
  "api", "cdn", "assets", "static", "media", "files", "img", "images", "mail", "email",
  "smtp", "imap", "pop", "mx", "ns", "ns1", "ns2", "dns", "ftp", "vpn", "proxy", "edge",
  "webhook", "webhooks", "status", "health", "metrics",
  // product paths / roles
  "admin", "administrator", "root", "system", "support", "help", "docs", "blog", "about",
  "login", "logout", "signin", "signup", "register", "auth", "account", "accounts",
  "billing", "pay", "payments", "checkout", "invoice", "invoices", "settings",
  "dashboard", "portal", "practitioner", "client", "clients", "space", "book", "booking",
  "privacy", "terms", "legal", "security", "contact", "press", "careers", "team",
  // system words
  "null", "undefined", "none", "new", "me", "my", "you", "us", "internal", "private", "public",
];

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents so "Núñez" → "nunez"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 31)
    .replace(/-+$/g, "");
}

// The portal address we PROMISE on the confirmation screen. PLATFORM_DOMAIN is
// the platform's own apex; without it configured we still name the slug rather
// than inventing a host.
export function portalHostFor(slug: string): string {
  const domain = process.env.PLATFORM_DOMAIN;
  return domain ? `${slug}.${domain}` : slug;
}
