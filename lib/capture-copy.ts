import en from "@/messages/en/capture.json";
import es from "@/messages/es/capture.json";
import { type SignupLocale } from "@/lib/signup-copy";

// C23-CAPTURE — bilingual copy for the event floor. The MECHANISM is the one
// ratified for the public surface in C23-SIGNUP (`?lang=` wins, else
// Accept-Language, else English): `resolvePublicLocale` and `fill` are reused
// from lib/signup-copy.ts rather than re-implemented, and this module only
// adds the catalog lookup. Both catalogs ship together (law #7).

export { resolvePublicLocale, fill, SIGNUP_LOCALES as CAPTURE_LOCALES } from "@/lib/signup-copy";
export type CaptureLocale = SignupLocale;

type Catalog = typeof en;
const CATALOGS: Record<CaptureLocale, Catalog> = { en, es: es as unknown as Catalog };

export function captureCopy(locale: CaptureLocale): Catalog["capture"] {
  return CATALOGS[locale].capture;
}
