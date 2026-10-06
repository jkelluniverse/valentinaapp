import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { SquareCardForm } from "@/components/SquareCardForm";
import { squarePublicConfig, squareConfigured } from "@/lib/square";
import { formatMoney } from "@/lib/billing";
import { purchasePackage } from "../../actions";

export const dynamic = "force-dynamic";

// C13-PKG §10 — the package purchase page. One SKU, her name for it, the
// Square card form; paid → the package activates on its own and the client
// lands back on their sessions with a gentle confirmation.
export default async function PurchasePackagePage({
  params,
}: {
  params: { priceBookId: string };
}) {
  await requireClient();
  const t = await getTranslations("sessions");

  const sku = await prisma.priceBook.findFirst({
    where: { id: params.priceBookId, active: true, kind: "PACKAGE" },
  });
  if (!sku) notFound();

  const sq = await squarePublicConfig();
  const amountLabel = formatMoney(sku.amountCents, sku.currency);
  const boundPay = purchasePackage.bind(null, sku.id);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Eyebrow>{t("continue.title")}</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">{sku.name}</h1>
        <SignatureRule />
      </div>

      <div className="rounded-lg border border-line bg-white p-6 shadow-soft">
        <p className="text-lg font-medium text-ink-strong">
          {sku.sessionsIncluded
            ? `${t("continue.sessions", { count: sku.sessionsIncluded })} · ${amountLabel}`
            : amountLabel}
        </p>
        <p className="mt-1 max-w-prose text-sm text-slate">{t("purchase.note")}</p>

        <div className="mt-6">
          {squareConfigured() && sq ? (
            <SquareCardForm
              applicationId={sq.applicationId}
              locationId={sq.locationId}
              scriptUrl={sq.scriptUrl}
              sandbox={sq.sandbox}
              amountLabel={amountLabel}
              payAction={boundPay}
              successPath="/space/schedule?package=1"
            />
          ) : (
            <p className="max-w-prose text-sm text-ink">{t("purchase.offline")}</p>
          )}
        </div>
      </div>

      <Link
        href="/space/schedule"
        className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline"
      >
        {t("purchase.back")}
      </Link>
    </div>
  );
}
