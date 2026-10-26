import { getRequestConfig } from "next-intl/server";
import type { AbstractIntlMessages } from "next-intl";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// AMD-05 — portal locale = USER PREFERENCE (authed, no URL churn). Falls back
// to English for signed-out visitors; the public site's own /es routing is a
// separate, later phase (SEO wants the locale in the URL there).

export const LOCALES = ["en", "es"] as const;
export type AppLocale = (typeof LOCALES)[number];

async function userLocale(): Promise<AppLocale> {
  try {
    const session = await auth();
    const u = session?.user as { id?: string; email?: string | null } | undefined;
    if (!u?.id && !u?.email) return "en";
    const user = await prisma.user.findUnique({
      where: u.id ? { id: u.id } : { email: u.email! },
      select: { locale: true },
    });
    return user?.locale === "es" ? "es" : "en";
  } catch {
    return "en";
  }
}

// Namespaced message files, one file per surface, so different features can
// grow their catalogs without touching each other:
//   messages/en/common.json  messages/en/settings.json  messages/en/sessions.json …
async function loadMessages(locale: AppLocale) {
  const load = async (ns: string) => {
    try {
      return (await import(`../messages/${locale}/${ns}.json`)).default as AbstractIntlMessages;
    } catch {
      return {} as AbstractIntlMessages;
    }
  };
  const [common, nav, settings, sessions] = await Promise.all([
    load("common"),
    load("nav"),
    load("settings"),
    load("sessions"),
  ]);
  return { common, nav, settings, sessions };
}

export default getRequestConfig(async () => {
  const locale = await userLocale();
  return {
    locale,
    messages: await loadMessages(locale),
  };
});
