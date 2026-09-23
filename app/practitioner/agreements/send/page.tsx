import Link from "next/link";
import { requirePractitioner } from "@/lib/auth-guards";
import { getTenant } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { PendingButton } from "@/components/PendingButton";
import { sendToEmailAction } from "../actions";
import { fieldCls } from "../ui";

// C22.2 — one door, one job: send a document for signature.
// Step 1 pick the document · step 2 say who signs.

export const dynamic = "force-dynamic";

export default async function SendPage({ searchParams }: { searchParams: { error?: string } }) {
  await requirePractitioner();
  const tenant = await getTenant();
  const [templates, clients] = await Promise.all([
    prisma.agreementTemplate.findMany({ where: { tenantId: tenant.id, status: "ACTIVE" }, orderBy: [{ slug: "asc" }, { locale: "asc" }] }),
    prisma.user.findMany({ where: { role: "CLIENT", active: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
  ]);
  const enSlugs = new Set(templates.filter((t) => t.locale === "en").map((t) => t.slug));
  const sendable = templates.filter((t) => t.locale === "en" || !enSlugs.has(t.slug));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Eyebrow>Agreements · send</Eyebrow>
        <h1 className="font-headline text-[1.8rem] font-medium text-ink-strong">Send a document</h1>
        <SignatureRule />
        <p className="text-[14px] text-slate">Pick the document, then say who signs. They read, fill, and sign from a secure page.</p>
      </div>

      {searchParams.error && <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">REFUSED: {searchParams.error}</p>}

      {/* To one of her clients — merged preview first, exactly as before. */}
      <form method="get" action="/practitioner/agreements/preview" className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-card">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-mocha">To a client</p>
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
            Client
            <select name="clientId" required className={fieldCls}>
              <option value="">Choose…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name ?? c.email}
                </option>
              ))}
            </select>
          </label>
          <button className="rounded-lg bg-wine px-5 py-2.5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-wine-dark">
            Preview &amp; send →
          </button>
        </div>
        <details className="text-[12.5px] text-slate">
          <summary className="cursor-pointer text-whisper">Package details (optional merge fields)</summary>
          <div className="mt-2 flex flex-wrap gap-3">
            <label className="flex flex-col gap-1 font-medium">
              Package
              <input name="package_name" className={fieldCls} placeholder="optional" />
            </label>
            <label className="flex flex-col gap-1 font-medium">
              Price
              <input name="price" className={`${fieldCls} w-28`} placeholder="$—" />
            </label>
            <label className="flex flex-col gap-1 font-medium">
              Term
              <input name="term" className={`${fieldCls} w-28`} placeholder="12 weeks" />
            </label>
          </div>
        </details>
      </form>

      {/* To anyone by email. */}
      <form action={sendToEmailAction} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-5 shadow-card">
        <p className="text-[13px] font-semibold uppercase tracking-wide text-mocha">
          To anyone by email <span className="font-normal normal-case tracking-normal text-whisper">— no account needed</span>
        </p>
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
            Their name
            <input name="recipientName" required className={fieldCls} placeholder="Full name" />
          </label>
          <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
            Their email
            <input name="recipientEmail" type="email" required className={fieldCls} placeholder="name@example.com" />
          </label>
          <PendingButton className="rounded-lg bg-wine px-5 py-2.5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-wine-dark">
            Send for signature
          </PendingButton>
        </div>
      </form>

      <Link href="/practitioner/agreements" className="text-[13px] text-whisper hover:text-wine">
        ← back to agreements
      </Link>
    </div>
  );
}
