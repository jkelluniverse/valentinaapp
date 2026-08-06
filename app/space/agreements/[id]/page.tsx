import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { requireClient } from "@/lib/auth-guards";
import { prisma } from "@/lib/prisma";
import { markViewed, markDisclosureShown, signAgreement, declineAgreement, E_RECORDS_DISCLOSURE, initialItemsOf } from "@/lib/agreements";
import { sealIfComplete } from "@/lib/agreements/seal";
import { Eyebrow } from "@/components/brand";
import { SignFlow } from "@/components/agreements/SignFlow";

// C20 §3 — the portal sign flow: the authenticated session IS the
// attribution basis (plus typed name + IP + user agent at signing).

export const dynamic = "force-dynamic";

export default async function SignAgreementPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { error?: string };
}) {
  const user = await requireClient();
  const agreement = await prisma.agreement.findFirst({ where: { id: params.id, clientId: user.id } });
  if (!agreement) notFound();
  if (!["SENT", "VIEWED"].includes(agreement.status)) redirect("/space/agreements");

  await markViewed(agreement.id, "client");
  await markDisclosureShown(agreement.id, "client");
  const locale = (agreement.locale === "es" ? "es" : "en") as "en" | "es";
  const template = await prisma.agreementTemplate.findFirst({ where: { id: agreement.templateId }, select: { initialItems: true } });
  const items = initialItemsOf(template ?? {});

  async function doSign(formData: FormData) {
    "use server";
    const me = await requireClient();
    const a = await prisma.agreement.findFirst({ where: { id: params.id, clientId: me.id } });
    if (!a) notFound();
    const h = headers();
    const initials: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      if (key.startsWith("ack:")) initials[key.slice(4)] = String(value);
      if (key.startsWith("fill:")) initials[key.slice(5)] = String(value);
    }
    const result = await signAgreement({
      agreementId: a!.id,
      signerName: String(formData.get("signerName") ?? ""),
      drawn: String(formData.get("drawn") ?? "") || null,
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      agent: h.get("user-agent"),
      actor: "client",
      initials,
    });
    if (result.ok) {
      await sealIfComplete(a!.id);
      redirect("/space/agreements");
    }
    redirect(`/space/agreements/${params.id}?error=${encodeURIComponent(result.ok ? "" : result.error)}`);
  }

  async function doDecline() {
    "use server";
    const me = await requireClient();
    const a = await prisma.agreement.findFirst({ where: { id: params.id, clientId: me.id } });
    if (a) await declineAgreement(a.id, "client");
    redirect("/space/agreements");
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 py-6">
      <Eyebrow>Agreement</Eyebrow>
      {searchParams.error && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">{searchParams.error}</p>
      )}
      <SignFlow
        title={agreement.titleSnapshot}
        body={agreement.bodySnapshot}
        disclosure={E_RECORDS_DISCLOSURE[locale]}
        locale={locale}
        items={items}
        onSign={doSign}
        onDecline={doDecline}
      />
    </div>
  );
}
