import Link from "next/link";
import { requirePractitioner } from "@/lib/auth-guards";
import { getTenant } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { PendingButton } from "@/components/PendingButton";
import {
  seedStarterTemplates,
  sendAgreementAction,
  remindAgreement,
  voidAgreementAction,
  countersignAction,
  markPaperAction,
  toggleTemplateTrigger,
} from "./actions";

// C20 §2 — the practitioner's agreements desk: templates (versioned,
// placeholder-marked until the attorney pass), the send flow (manual),
// per-template automatic triggers, and the library-wide list with states.
// States: Draft → Sent → Viewed → Signed → (Declined / Expired / Voided);
// voiding is hers, attributed, never deletes history.

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  SIGNED: "bg-blush text-wine",
  SENT: "border border-line text-slate",
  VIEWED: "border border-mocha text-mocha",
  DECLINED: "border border-line text-slate line-through",
  EXPIRED: "border border-line text-whisper",
  VOIDED: "border border-line text-whisper line-through",
  DRAFT: "border border-line text-whisper",
};

const TRIGGERS: { field: string; label: string }[] = [
  { field: "sendOnInviteAccept", label: "on invite acceptance" },
  { field: "requireBeforeBooking", label: "require before booking" },
  { field: "sendOnPackagePurchase", label: "on package purchase" },
  { field: "sendOnRecordingConsent", label: "on recording consent" },
];

export default async function AgreementsDesk({
  searchParams,
}: {
  searchParams: { sent?: string; error?: string; seeded?: string };
}) {
  await requirePractitioner();
  const tenant = await getTenant();

  const [templates, agreements, clients] = await Promise.all([
    prisma.agreementTemplate.findMany({ where: { tenantId: tenant.id, status: "ACTIVE" }, orderBy: [{ slug: "asc" }, { locale: "asc" }] }),
    prisma.agreement.findMany({ orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.user.findMany({ where: { role: "CLIENT", active: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } }),
  ]);
  const nameFor = new Map(clients.map((c) => [c.id, c.name ?? c.email]));
  const enTemplates = templates.filter((t) => t.locale === "en");
  const anyPlaceholder = templates.some((t) => t.placeholder);
  const fieldCls =
    "rounded-md border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-wine focus:ring-2 focus:ring-wine/20";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>Agreements</Eyebrow>
        <h1 className="font-headline text-[2rem] font-medium text-ink-strong">Signed, and kept</h1>
        <SignatureRule />
        <p className="max-w-prose text-ink">
          Send agreements, collect signatures, and keep the sealed record — for both of you.
        </p>
      </div>

      {anyPlaceholder && (
        <p className="rounded-md border border-dashed border-mocha bg-blush px-4 py-2.5 text-sm text-wine">
          These template texts are placeholders. Nothing real goes out before your attorney
          blesses the wording — the flag stands until then.
        </p>
      )}
      {searchParams.error && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">REFUSED: {searchParams.error}</p>
      )}
      {searchParams.sent && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          Sent — they&apos;ll get the email, and it waits in their space too.
        </p>
      )}

      {templates.length === 0 ? (
        <form action={seedStarterTemplates}>
          <PendingButton className="rounded-lg bg-wine px-5 py-2.5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-wine-dark">
            Add the starter set (placeholders)
          </PendingButton>
        </form>
      ) : (
        <>
          <form action={sendAgreementAction} className="flex flex-wrap items-end gap-3 rounded-card border border-line bg-surface p-5 shadow-card">
            <p className="w-full text-[13px] font-semibold uppercase tracking-wide text-mocha">Send an agreement</p>
            <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
              Template
              <select name="templateId" required className={fieldCls}>
                <option value="">Choose…</option>
                {enTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} (v{t.version})
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
            <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
              Package (merge)
              <input name="package_name" className={fieldCls} placeholder="optional" />
            </label>
            <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
              Price
              <input name="price" className={`${fieldCls} w-28`} placeholder="$—" />
            </label>
            <label className="flex flex-col gap-1 text-[13px] font-medium text-slate">
              Term
              <input name="term" className={`${fieldCls} w-28`} placeholder="12 weeks" />
            </label>
            <PendingButton className="rounded-lg bg-wine px-5 py-2.5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-wine-dark">
              Preview merged &amp; send
            </PendingButton>
          </form>

          <div className="flex flex-col gap-2">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-mocha">Templates &amp; automatic sending</h2>
            {enTemplates.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center gap-2 rounded-card border border-line bg-surface px-4 py-3">
                <span className="font-medium text-ink-strong">{t.title}</span>
                <span className="text-[12px] text-whisper">v{t.version}{t.placeholder ? " · placeholder" : ""}</span>
                <span className="ml-auto flex flex-wrap gap-1.5">
                  {TRIGGERS.map((tr) => {
                    const on = (t as unknown as Record<string, boolean>)[tr.field];
                    return (
                      <form key={tr.field} action={toggleTemplateTrigger.bind(null, t.id, tr.field)}>
                        <PendingButton
                          className={`rounded-full px-2.5 py-0.5 text-[12px] ${on ? "bg-wine text-white" : "border border-line text-slate hover:border-mocha"}`}
                        >
                          {tr.label}
                        </PendingButton>
                      </form>
                    );
                  })}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="flex flex-col gap-2">
        <h2 className="text-[13px] font-semibold uppercase tracking-wide text-mocha">Every agreement</h2>
        {agreements.length === 0 ? (
          <p className="rounded-card border border-line bg-surface p-5 text-sm text-slate shadow-card">
            Nothing sent yet — the first one will appear here with its state.
          </p>
        ) : (
          agreements.map((a) => (
            <div key={a.id} className="flex flex-col gap-2 rounded-card border border-line bg-surface px-4 py-3">
              <div className="flex flex-wrap items-center gap-2 text-[14px]">
                <span className="font-medium text-ink-strong">{a.titleSnapshot}</span>
                <span className="text-slate">· {a.clientId ? nameFor.get(a.clientId) ?? "—" : "lead"}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-[12px] font-medium ${STATUS_TONE[a.status] ?? ""}`}>
                  {a.status.toLowerCase()}
                </span>
                {a.sealedSha256 && <span className="text-[12px] text-whisper">sealed</span>}
                <span className="ml-auto text-[12px] text-whisper">{a.createdAt.toISOString().slice(0, 10)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {["SENT", "VIEWED"].includes(a.status) && (
                  <>
                    <form action={remindAgreement.bind(null, a.id)}>
                      <PendingButton className="rounded-md border border-line px-3 py-1 text-[12px] text-slate hover:border-mocha hover:text-wine">
                        Remind
                      </PendingButton>
                    </form>
                    <form action={markPaperAction.bind(null, a.id)} className="flex items-center gap-1.5">
                      <input name="note" placeholder="signed on paper by…" className="rounded-md border border-line px-2 py-1 text-[12px]" />
                      <PendingButton className="rounded-md border border-line px-3 py-1 text-[12px] text-slate hover:border-mocha hover:text-wine">
                        Mark signed on paper
                      </PendingButton>
                    </form>
                  </>
                )}
                {a.status === "SIGNED" && a.countersignRequired && !a.countersignedAt && (
                  <form action={countersignAction.bind(null, a.id)} className="flex items-center gap-1.5">
                    <input name="name" placeholder="your legal name" className="rounded-md border border-line px-2 py-1 text-[12px]" />
                    <PendingButton className="rounded-md bg-wine px-3 py-1 text-[12px] font-medium text-white hover:bg-wine-dark">
                      Countersign
                    </PendingButton>
                  </form>
                )}
                {a.sealedKey && (
                  <Link href={`/api/agreements/${a.id}/pdf`} className="text-[12px] font-medium text-wine underline-offset-4 hover:underline">
                    Download sealed PDF
                  </Link>
                )}
                {!["VOIDED", "DECLINED"].includes(a.status) && (
                  <form action={voidAgreementAction.bind(null, a.id)} className="ml-auto flex items-center gap-1.5">
                    <input name="reason" placeholder="reason" className="rounded-md border border-line px-2 py-1 text-[12px]" />
                    <PendingButton className="rounded-md border border-line px-3 py-1 text-[12px] text-slate hover:border-mocha hover:text-wine">
                      Void
                    </PendingButton>
                  </form>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
