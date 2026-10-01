import Link from "next/link";
import { requirePractitioner } from "@/lib/auth-guards";
import { getTenant } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { PendingButton } from "@/components/PendingButton";
import { createSignLinkAction } from "../actions";
import { CopyButton } from "@/components/agreements/CopyButton";
import { fieldCls } from "../ui";

// C22.2 — one door, one job: a sign link to pass along by hand
// (WhatsApp, text, your client forwards it to their payer).

export const dynamic = "force-dynamic";

export default async function SignLinkPage({
  searchParams,
}: {
  searchParams: { error?: string; signlink?: string; signee?: string };
}) {
  await requirePractitioner();
  const tenant = await getTenant();
  const templates = await prisma.agreementTemplate.findMany({
    where: { tenantId: tenant.id, status: "ACTIVE" },
    orderBy: [{ slug: "asc" }, { locale: "asc" }],
  });
  const enSlugs = new Set(templates.filter((t) => t.locale === "en").map((t) => t.slug));
  const sendable = templates.filter((t) => t.locale === "en" || !enSlugs.has(t.slug));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Eyebrow>Agreements · sign link</Eyebrow>
        <h1 className="font-headline text-[1.8rem] font-medium text-ink-strong">Create a sign link</h1>
        <SignatureRule />
        <p className="text-[14px] text-slate">
          No email needed. You get a link; send it any way you like — your client can forward it to whoever signs.
        </p>
      </div>

      {searchParams.error && <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">REFUSED: {searchParams.error}</p>}

      {searchParams.signlink && (
        <div id="signlink" className="flex scroll-mt-24 flex-col gap-2 rounded-card border border-wine bg-blush/30 p-4">
          <p className="text-sm font-medium text-wine">
            Link ready for {searchParams.signee ?? "the signer"} — it works for 30 days. The signed result shows on your
            agreements page, and they get their sealed copy on the signing page.
          </p>
          <div className="flex w-full items-center gap-2">
            <input
              readOnly
              value={searchParams.signlink}
              className="min-w-0 flex-1 select-all rounded-md border border-line bg-white px-3 py-2 font-mono text-[12.5px] text-ink"
            />
            <CopyButton value={searchParams.signlink} />
          </div>
        </div>
      )}

      <form action={createSignLinkAction} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-card">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
            Document
            <select name="templateId" required className={fieldCls}>
              <option value="">Choose…</option>
              {sendable.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
            Signer&apos;s name
            <input name="signerName" required className={fieldCls} placeholder="Who will sign" />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
            Their email (optional)
            <input name="signerEmail" type="email" className={fieldCls} placeholder="for their sealed copy" />
          </label>
          <PendingButton className="rounded-lg bg-wine px-5 py-2.5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-wine-dark">
            Create the link
          </PendingButton>
        </div>
      </form>

      <Link href="/practitioner/agreements" className="text-[13px] text-whisper hover:text-wine">
        ← back to agreements
      </Link>
    </div>
  );
}
