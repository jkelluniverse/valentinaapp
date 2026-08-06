import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { agreementByToken, markViewed, markDisclosureShown, signAgreement, declineAgreement, E_RECORDS_DISCLOSURE, initialItemsOf } from "@/lib/agreements";
import { sealIfComplete } from "@/lib/agreements/seal";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { SignFlow } from "@/components/agreements/SignFlow";

// C20 §3 — the signed no-login link (works for Leads pre-portal AND as the
// email path for clients — the verified signed link IS the attribution
// basis, same pattern as discovery reschedule). Opening records "viewed" +
// "disclosure shown"; the sign action carries the typed name and the
// request's IP/user-agent into the attribution stack.

export const dynamic = "force-dynamic";

function Done({ title, message }: { title: string; message: string }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6">
      <Eyebrow>Agreement</Eyebrow>
      <h1 className="text-[2rem] font-semibold">{title}</h1>
      <SignatureRule />
      <p className="text-lg leading-relaxed text-ink">{message}</p>
    </main>
  );
}

export default async function AgreePage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { done?: string; error?: string };
}) {
  const agreement = await agreementByToken(params.token);
  if (!agreement) {
    return <Done title="This link isn't active" message="Ask for a fresh one — nothing is lost." />;
  }
  if (searchParams.done === "signed" || agreement.status === "SIGNED") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6">
        <Eyebrow>Agreement</Eyebrow>
        <h1 className="text-[2rem] font-semibold">Signed — thank you</h1>
        <SignatureRule />
        <p className="text-lg leading-relaxed text-ink">Your copy is on its way by email, sealed and kept for both of you.</p>
        {agreement.sealedKey && (
          <a
            href={`/api/agreements/${agreement.id}/pdf?token=${encodeURIComponent(params.token)}`}
            className="self-start rounded-lg border border-wine px-5 py-2.5 text-[15px] font-medium text-wine hover:bg-blush/20"
          >
            Download your sealed copy
          </a>
        )}
      </main>
    );
  }
  if (agreement.status === "DECLINED") return <Done title="Noted" message="You chose not to sign. Nothing else happens without you." />;
  if (agreement.status === "EXPIRED") return <Done title="This link has expired" message="Ask for a fresh one and it will be resent." />;
  if (agreement.status === "VOIDED") return <Done title="This agreement was withdrawn" message="There's nothing to sign here anymore." />;

  const actor = agreement.leadId ? "lead" : agreement.recipientEmail ? "recipient" : "client";
  await markViewed(agreement.id, actor);
  await markDisclosureShown(agreement.id, actor);
  const locale = (agreement.locale === "es" ? "es" : "en") as "en" | "es";
  const template = await prisma.agreementTemplate.findFirst({ where: { id: agreement.templateId }, select: { initialItems: true } });
  const items = initialItemsOf(template ?? {});
  // C21 — uploaded documents in this request: shown above the sign flow,
  // opened through the hash-verified file route (the token authorizes it).
  const files = await prisma.agreementFile.findMany({ where: { agreementId: agreement.id }, orderBy: { createdAt: "asc" } });

  async function doSign(formData: FormData) {
    "use server";
    const a = await agreementByToken(params.token);
    if (!a) redirect(`/agree/${params.token}`);
    const h = headers();
    const who = a!.leadId ? "lead" : a!.recipientEmail ? "recipient" : "client";
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
      actor: who,
      initials,
    });
    if (result.ok) await sealIfComplete(a!.id);
    redirect(`/agree/${params.token}?${result.ok ? "done=signed" : `error=${encodeURIComponent(result.ok ? "" : result.error)}`}`);
  }

  async function doDecline() {
    "use server";
    const a = await agreementByToken(params.token);
    if (a) await declineAgreement(a.id, a.leadId ? "lead" : "client");
    redirect(`/agree/${params.token}`);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 px-6 py-12">
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
              href={`/api/agreements/${agreement.id}/files/${f.id}?token=${encodeURIComponent(params.token)}`}
              target="_blank"
              className="flex items-center justify-between rounded-md border border-line px-3.5 py-2.5 text-[14px] text-wine underline-offset-4 hover:bg-blush/20 hover:underline"
            >
              <span>{f.filename}</span>
              <span className="text-[12px] text-whisper">{(f.size / 1024).toFixed(0)} KB</span>
            </a>
          ))}
          <p className="text-[12px] text-whisper">
            {locale === "es"
              ? "Ábrelos y léelos con calma antes de firmar; tu firma cubre los documentos listados."
              : "Open and read them in your own time before signing; your signature covers the documents listed."}
          </p>
        </div>
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
    </main>
  );
}
