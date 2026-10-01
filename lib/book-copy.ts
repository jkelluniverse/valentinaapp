import en from "@/messages/en/book.json";
import es from "@/messages/es/book.json";
import { resolvePublicLocale, fill, type SignupLocale } from "@/lib/signup-copy";

// C40 / RULING 224 — /book's copy catalogue. The page had NONE before C40:
// "Confirm my call" was a hardcoded string (BookingFlow.tsx) and the page had
// no locale at all. Ruling 224 requires the request-flow copy in both locales,
// which means giving the page the catalogue it lacked. Same shape as
// lib/signup-copy.ts (the public-surface precedent): `?lang=` wins, then
// Accept-Language, then English — and the public wall forbids importing auth
// or prisma here, so a signed-out visitor's locale comes from the request.
export { resolvePublicLocale, fill };
export type BookLocale = SignupLocale;
type Catalog = typeof en;
const CATALOGS: Record<BookLocale, Catalog> = { en, es: es as unknown as Catalog };
export function bookCopy(locale: BookLocale): Catalog["book"] { return CATALOGS[locale].book; }
