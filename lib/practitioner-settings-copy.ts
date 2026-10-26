import en from "@/messages/en/practitionerSettings.json";
import es from "@/messages/es/practitionerSettings.json";
import { resolvePortalLocale, type ReferralLocale } from "@/lib/referral-copy";

// C24.1-TENANT-SCOPE §4 (task #78) — the catalog for `/practitioner/settings`.
// That page shipped with its labels inline in English, so it was the one
// practitioner surface with no Spanish. This is an i18n MOVE, not a copy
// rewrite: every English string here is byte-identical to what the page
// rendered before, and the Spanish is the new half.
//
// Same shape as lib/referral-copy.ts (the portal-surface precedent): locale is
// the signed-in practitioner's `User.locale`, with `?lang=` as an explicit
// override (ruling 14), so a gate can prove both locales render without
// editing a user row mid-run.

export { fill } from "@/lib/signup-copy";
export { resolvePortalLocale };
export type PractitionerSettingsLocale = ReferralLocale;

type Catalog = typeof en;
const CATALOGS: Record<PractitionerSettingsLocale, Catalog> = { en, es: es as unknown as Catalog };

export function practitionerSettingsCopy(
  locale: PractitionerSettingsLocale,
): Catalog["practitionerSettings"] {
  return CATALOGS[locale].practitionerSettings;
}
