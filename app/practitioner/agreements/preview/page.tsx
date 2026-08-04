import Link from "next/link";
import { requirePractitioner } from "@/lib/auth-guards";
import { getTenant } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { previewAgreement } from "@/lib/agreements";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { PendingButton } from "@/components/PendingButton";
import { sendAgreementAction } from "../actions";

// C20 §2 — "preview merged → Send", literally: this page renders the SAME
// resolver output the send path uses (one function, so preview and sent
// text can never drift), writes nothing, and only the wine button sends.

export const dynamic = "force-dynamic";

export default async function AgreementPreview({
  searchParams,
}: {
  searchParams: { templateId?: string; clientId?: string; package_name?: string; price?: string; term?: string };
}) {
  await requirePractitioner();
  const tenant = await getTenant();

  const merge = {
    ...(searchParams.package_name ? { package_name: searchParams.package_name } : {}),
    ...(searchParams.price ? { price: searchParams.price } : {}),
    ...(searchParams.term ? { term: searchParams.term } : {}),
  };
  const preview = await previewAgreement({
    tenantId: tenant.id,
    templateId: searchParams.templateId ?? "",
    clientId: searchParams.clientId || undefined,
    merge,
  });
  const client = searchParams.clientId
    ? await prisma.user.findFirst({ where: { id: searchParams.clientId }, select: { name: true, email: true } })
    : null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <Link href="/practitioner/agreements" className="text-[13px] text-whisper underline-offset-4 hover:text-wine hover:underline">
        ← agreements
      </Link>
      <div className="flex flex-col gap-2">
        <Eyebrow>Preview</Eyebrow>
        <h1 className="font-headline text-[1.75rem] font-medium text-ink-strong">
          {preview.ok ? preview.title : "Something's off"}
        </h1>
        <SignatureRule />
        {preview.ok ? (
          <p className="text-sm text-slate">
            Exactly what {client?.name ?? "your client"} will read
            {preview.locale === "es" ? " (served in Spanish — their language)" : ""}. Nothing has
            been sent yet.
          </p>
        ) : (
          <p className="text-sm text-wine">REFUSED: {preview.error}</p>
        )}
      </div>

      {preview.ok && (
        <>
          <div className="whitespace-pre-wrap rounded-card border border-line bg-white p-6 text-[14.5px] leading-relaxed text-ink shadow-soft">
            {preview.body}
          </div>
          <form action={sendAgreementAction} className="flex items-center gap-4">
            <input type="hidden" name="templateId" value={searchParams.templateId ?? ""} />
            <input type="hidden" name="clientId" value={searchParams.clientId ?? ""} />
            <input type="hidden" name="package_name" value={searchParams.package_name ?? ""} />
            <input type="hidden" name="price" value={searchParams.price ?? ""} />
            <input type="hidden" name="term" value={searchParams.term ?? ""} />
            <PendingButton
              pendingLabel="Sending…"
              className="rounded-lg bg-wine px-6 py-2.5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-wine-dark"
            >
              Send it{client?.name ? ` to ${client.name}` : ""}
            </PendingButton>
            <Link href="/practitioner/agreements" className="text-sm text-slate underline-offset-4 hover:text-wine hover:underline">
              Go back
            </Link>
          </form>
        </>
      )}
    </div>
  );
}
