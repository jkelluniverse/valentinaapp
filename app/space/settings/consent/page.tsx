import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { ReadingProse } from "@/components/ReadingProse";
import { getConsentText, CURRENT_CONSENT_VERSION } from "@/lib/consent";

export const dynamic = "force-dynamic";

// AMD-05 B3 — the consent's first promise: the exact versioned text a client
// agreed to stays readable, any time, right where their record lives.
export default async function ConsentRecordPage() {
  const user = await requireClient();
  const t = await getTranslations("settings");

  const grant = await prisma.consentGrant.findUnique({
    where: { userId_version: { userId: user.id, version: CURRENT_CONSENT_VERSION } },
  });

  const dateFmt = new Intl.DateTimeFormat(user.locale === "es" ? "es" : "en", {
    dateStyle: "long",
  });

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>{t("consentPage.eyebrow")}</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">{t("consentPage.title")}</h1>
        <SignatureRule />
        <p className="max-w-prose text-ink">
          {grant
            ? t("consentPage.agreed", {
                version: CURRENT_CONSENT_VERSION,
                date: dateFmt.format(grant.grantedAt),
              })
            : t("consentPage.notAgreed")}
        </p>
      </div>

      <div className="rounded-lg border border-line bg-white p-6 shadow-soft">
        <ReadingProse content={getConsentText()} />
      </div>

      <Link
        href="/space/settings"
        className="self-start text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
      >
        ← {t("consentPage.back")}
      </Link>
    </div>
  );
}
