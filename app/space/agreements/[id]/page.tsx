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
  const files = await prisma.agreementFile.findMany({ where: { agreementId: agreement.id }, orderBy: { createdAt: "asc" } });

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

  const tenant = await prisma.tenant.findFirst({ where: { id: agreement.tenantId ?? "" }, select: { displayName: true } });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 py-6">
      <Eyebrow>Agreement</Eyebrow>
      {searchParams.error && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">{searchParams.error}</p>
      )}
      {files.length > 0 && (
        <div className="flex flex-col gap-2 rounded-card border border-line bg-white p-4 shadow-soft">
          <span className="text-[13px] font-semibold uppercase tracking-wide text-mocha">
            {locale === "es" ? "Documentos para revisar" : "Documents to review"}
          </span>
          {files.map((f) => (
            <a
              key={f.id}
              href={`/api/agreements/${agreement.id}/files/${f.id}`}
              target="_blank"
              className="flex items-center justify-between rounded-md border border-line px-3.5 py-2.5 text-[14px] text-wine underline-offset-4 hover:bg-blush/20 hover:underline"
            >
              <span>{f.filename}</span>
              <span className="text-[12px] text-whisper">{(f.size / 1024).toFixed(0)} KB</span>
            </a>
          ))}
        </div>
      )}
      <SignFlow
        title={agreement.titleSnapshot}
        body={agreement.bodySnapshot}
        disclosure={E_RECORDS_DISCLOSURE[locale]}
        locale={locale}
        practiceName={tenant?.displayName ?? "Veritas Consulting"}
        items={items}
        onSign={doSign}
        onDecline={doDecline}
      />
    </div>
  );
}
