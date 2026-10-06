import en from "@/messages/en/referral.json";
import es from "@/messages/es/referral.json";
import { type SignupLocale } from "@/lib/signup-copy";

// C23-REFERRAL §3 — bilingual copy for /practitioner/referrals (law #7: no
// English-only screen). Same catalog-lookup shape as lib/capture-copy.ts.
//
// The LOCALE here is the signed-in practitioner's own `User.locale` — this is a
// portal screen, not a public one — with `?lang=` accepted as an explicit
// override for the same reason the public surface has one (and so the gate can
// prove both locales render without editing a user row mid-run).

export { fill } from "@/lib/signup-copy";
export type ReferralLocale = SignupLocale;

type Catalog = typeof en;
const CATALOGS: Record<ReferralLocale, Catalog> = { en, es: es as unknown as Catalog };

export function referralCopy(locale: ReferralLocale): Catalog["referrals"] {
  return CATALOGS[locale].referrals;
}

/** `?lang=` wins when it names a locale we ship; otherwise the practitioner's
 *  saved preference; otherwise English. */
export function resolvePortalLocale(
  lang: string | string[] | undefined,
  userLocale: string | null | undefined,
): ReferralLocale {
  const explicit = Array.isArray(lang) ? lang[0] : lang;
  if (explicit === "es" || explicit === "en") return explicit;
  return userLocale === "es" ? "es" : "en";
}
