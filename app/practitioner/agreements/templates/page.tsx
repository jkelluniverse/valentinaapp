import Link from "next/link";
import { requirePractitioner } from "@/lib/auth-guards";
import { getTenant } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { PendingButton } from "@/components/PendingButton";
import {
  seedStarterTemplates,
  installMasterV31Action,
  installDisputePacketAction,
  installPaymentAuthAction,
  selfSignAction,
  retireTemplateAction,
  toggleTemplateTrigger,
} from "../actions";
import { V31_SLUG } from "@/lib/agreements/install-v31";
import { DECLARATION_SLUG, PAYMENT_AUTH_SLUG, PAYMENT_AUTH_BODY } from "@/lib/agreements/install-c21";

// C22.2 — the document library, out of the way of daily work: installs
// and updates, per-template automatic-sending triggers, self-sign for
// practitioner-only documents, and RETIRE to keep the shelf curated.

export const dynamic = "force-dynamic";

const TRIGGERS: { field: string; label: string }[] = [
  { field: "sendOnInviteAccept", label: "on invite acceptance" },
  { field: "requireBeforeBooking", label: "require before booking" },
  { field: "sendOnPackagePurchase", label: "on package purchase" },
  { field: "sendOnRecordingConsent", label: "on recording consent" },
];

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: { error?: string; installed?: string; selfsigned?: string; retired?: string };
}) {
  await requirePractitioner();
  const tenant = await getTenant();
  const [templates, clients] = await Promise.all([
    prisma.agreementTemplate.findMany({ where: { tenantId: tenant.id, status: { in: ["ACTIVE", "DRAFT"] } }, orderBy: [{ slug: "asc" }, { locale: "asc" }] }),
    prisma.user.findMany({ where: { role: "CLIENT", active: true }, select: { id: true }, take: 1 }),
  ]);
  const enSlugs = new Set(templates.filter((t) => t.locale === "en").map((t) => t.slug));
  const shown = templates.filter((t) => t.locale === "en" || !enSlugs.has(t.slug));
  const fileCounts = new Map<string, number>();
  for (const g of await prisma.agreementFile.groupBy({ by: ["templateId"], where: { templateId: { not: null } }, _count: true })) {
    if (g.templateId) fileCounts.set(g.templateId, g._count);
  }
  const v31 = templates.find((t) => t.slug === V31_SLUG);
  const payAuth = templates.find((t) => t.slug === PAYMENT_AUTH_SLUG);
  const packetInstalled = templates.some((t) => t.slug === DECLARATION_SLUG);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Eyebrow>Agreements · documents</Eyebrow>
        <h1 className="font-headline text-[1.8rem] font-medium text-ink-strong">Manage documents</h1>
        <SignatureRule />
        <p className="max-w-prose text-[14px] text-slate">
          Your library. Retire what you don&apos;t use — retired documents disappear from every menu, and anything already
          sent or signed is untouched.
        </p>
      </div>

      {searchParams.error && <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">REFUSED: {searchParams.error}</p>}
      {searchParams.installed && <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">Installed.</p>}
      {searchParams.retired && <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">Retired — gone from the menus; history intact.</p>}
      {searchParams.selfsigned && <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">Signed &amp; sealed — the PDF is on the agreements page.</p>}

      {(!v31 || !packetInstalled || !payAuth || payAuth.body !== PAYMENT_AUTH_BODY) && (
        <div className="flex flex-wrap gap-2">
          {!v31 && (
            <form action={installMasterV31Action}>
              <PendingButton className="rounded-lg border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush">
                Install master agreement v3.1 (arrives as DRAFT)
              </PendingButton>
            </form>
          )}
          {!packetInstalled && (
            <form action={installDisputePacketAction}>
              <PendingButton className="rounded-lg border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush">
                Install the dispute packet
              </PendingButton>
            </form>
          )}
          {!payAuth && (
            <form action={installPaymentAuthAction}>
              <PendingButton className="rounded-lg border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush">
                Install the payment authorization (es)
              </PendingButton>
            </form>
          )}
          {payAuth && payAuth.body !== PAYMENT_AUTH_BODY && (
            <form action={installPaymentAuthAction}>
              <PendingButton className="rounded-lg border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush">
                Update the payment authorization (card fields removed)
              </PendingButton>
            </form>
          )}
        </div>
      )}
      {v31?.status === "DRAFT" && (
        <p className="rounded-md border border-line bg-surface px-4 py-2.5 text-sm text-slate">
          Master agreement v3.1 is a DRAFT — preview works, sending is refused until it&apos;s released.
        </p>
      )}

      {templates.length === 0 ? (
        <form action={seedStarterTemplates}>
          <PendingButton className="rounded-lg bg-wine px-5 py-2.5 text-sm font-medium text-white shadow-soft transition-colors hover:bg-wine-dark">
            Add the starter set (placeholders)
          </PendingButton>
        </form>
      ) : (
        <div className="flex flex-col divide-y divide-line rounded-card border border-line bg-white">
          {shown.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-2 px-4 py-3">
              <span className="min-w-0 flex-1 truncate font-medium text-ink-strong">{t.title}</span>
              <span className="text-[12px] text-whisper">
                v{t.versionLabel ?? t.version}
                {t.kind === "FILES" ? ` · ${fileCounts.get(t.id) ?? 0} file${(fileCounts.get(t.id) ?? 0) === 1 ? "" : "s"}` : ""}
                {t.placeholder ? " · placeholder" : ""}
                {t.status === "DRAFT" ? " · DRAFT — not sendable" : ""}
              </span>
              {t.status === "DRAFT" && (
                <Link
                  href={`/practitioner/agreements/preview?templateId=${t.id}&clientId=${clients[0]?.id ?? ""}`}
                  className="text-[12px] font-medium text-wine underline-offset-4 hover:underline"
                >
                  Preview
                </Link>
              )}
              {t.kind === "FILES" && t.status === "ACTIVE" && !t.requiresCountersign && (
                <form action={selfSignAction.bind(null, t.id)}>
                  <PendingButton className="rounded-md border border-wine px-2.5 py-0.5 text-[12px] font-medium text-wine hover:bg-blush/30">
                    Sign &amp; seal myself
                  </PendingButton>
                </form>
              )}
              <span className="flex flex-wrap gap-1.5">
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
              <form action={retireTemplateAction.bind(null, t.id)}>
                <PendingButton className="rounded-md border border-line px-2.5 py-0.5 text-[12px] text-whisper hover:border-mocha hover:text-wine">
                  Retire
                </PendingButton>
              </form>
            </div>
          ))}
        </div>
      )}

      <Link href="/practitioner/agreements" className="text-[13px] text-whisper hover:text-wine">
        ← back to agreements
      </Link>
    </div>
  );
}
