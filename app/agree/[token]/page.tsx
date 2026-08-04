import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { agreementByToken, markViewed, markDisclosureShown, signAgreement, declineAgreement, E_RECORDS_DISCLOSURE } from "@/lib/agreements";
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
    return <Done title="Signed — thank you" message="Your copy is on its way by email, sealed and kept for both of you." />;
  }
  if (agreement.status === "DECLINED") return <Done title="Noted" message="You chose not to sign. Nothing else happens without you." />;
  if (agreement.status === "EXPIRED") return <Done title="This link has expired" message="Ask for a fresh one and it will be resent." />;
  if (agreement.status === "VOIDED") return <Done title="This agreement was withdrawn" message="There's nothing to sign here anymore." />;

  const actor = agreement.leadId ? "lead" : "client";
  await markViewed(agreement.id, actor);
  await markDisclosureShown(agreement.id, actor);
  const locale = (agreement.locale === "es" ? "es" : "en") as "en" | "es";

  async function doSign(formData: FormData) {
    "use server";
    const a = await agreementByToken(params.token);
    if (!a) redirect(`/agree/${params.token}`);
    const h = headers();
    const who = a!.leadId ? "lead" : "client";
    const result = await signAgreement({
      agreementId: a!.id,
      signerName: String(formData.get("signerName") ?? ""),
      drawn: String(formData.get("drawn") ?? "") || null,
      ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      agent: h.get("user-agent"),
      actor: who,
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
      <SignFlow
        title={agreement.titleSnapshot}
        body={agreement.bodySnapshot}
        disclosure={E_RECORDS_DISCLOSURE[locale]}
        locale={locale}
        onSign={doSign}
        onDecline={doDecline}
      />
    </main>
  );
}
