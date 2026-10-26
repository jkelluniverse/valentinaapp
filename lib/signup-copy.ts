import en from "@/messages/en/signup.json";
import es from "@/messages/es/signup.json";

// C23-SIGNUP — bilingual copy for the PUBLIC front door (law #7: no
// English-only screen).
//
// Why this reads the catalogs directly instead of using next-intl: the portal's
// next-intl config (i18n/request.ts) resolves the locale from the SIGNED-IN
// user's preference, and to do that it imports `@/auth` + `@/lib/prisma` —
// imports the public wall (C18 §2) forbids outright. A signed-out prospect has
// no user row to read a preference from anyway. So the public surface takes its
// locale from the request (`?lang=es`, else Accept-Language) and reads the SAME
// message files the portal uses. Nothing is translated later; both catalogs
// ship together.

export const SIGNUP_LOCALES = ["en", "es"] as const;
export type SignupLocale = (typeof SIGNUP_LOCALES)[number];

type Catalog = typeof en;
const CATALOGS: Record<SignupLocale, Catalog> = { en, es: es as unknown as Catalog };

export function signupCopy(locale: SignupLocale): Catalog["signup"] {
  return CATALOGS[locale].signup;
}

/** `?lang=` wins; otherwise the browser's Accept-Language; otherwise English. */
export function resolvePublicLocale(lang?: string | string[], acceptLanguage?: string | null): SignupLocale {
  const explicit = Array.isArray(lang) ? lang[0] : lang;
  if (explicit && (SIGNUP_LOCALES as readonly string[]).includes(explicit)) return explicit as SignupLocale;
  if (explicit) return "en"; // an unknown ?lang= is not a reason to guess
  if (acceptLanguage && /(^|,)\s*es\b/i.test(acceptLanguage)) return "es";
  return "en";
}

/** Minimal ICU-free interpolation: fill(t, { min: 8 }) → "At least 8 characters." */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}
