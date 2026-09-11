import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { readPracticeSetting } from "@/lib/practice-settings";
import { requirePractitioner } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getPractitioner, getOrCreateConfig } from "@/lib/schedule";
import { changePassword, requestEmailChange, signOutEverywhere } from "@/app/account/actions";
import { savePractitionerLocale, savePolicy, setDeletionStatus , setAssistNotify } from "./actions";
import { savePractitionerSignatureAction } from "@/app/practitioner/agreements/actions";
import { SignaturePadForm } from "@/components/agreements/SignaturePadForm";
import { PendingButton } from "@/components/PendingButton";
import {
  practitionerSettingsCopy,
  resolvePortalLocale,
  fill,
} from "@/lib/practitioner-settings-copy";

export const dynamic = "force-dynamic";

// AMD-05 — the practitioner's settings. Same calm hairline-row idiom as the
// client surface. Its labels used to be inline English; task #78 moved them
// into messages/{en,es}/practitionerSettings.json (wording unchanged) so this
// surface has a Spanish half like every other one.

const inputCls = "rounded-md border border-line px-3 py-2 text-ink";
const primaryBtn =
  "self-start rounded-md bg-wine px-4 py-2 text-sm font-medium text-cream transition-colors hover:bg-wine/90";
const quietBtn =
  "rounded-md border border-mocha px-3 py-1.5 text-sm font-medium text-wine transition-colors hover:bg-blush";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-white p-6 shadow-soft">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mt-2 divide-y divide-line">{children}</div>
    </section>
  );
}

function LinkRow({
  href,
  label,
  hint,
  open,
}: {
  href: string;
  label: string;
  hint: string;
  open: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-4">
      <div>
        <p className="font-medium text-ink-strong">{label}</p>
        <p className="text-sm text-slate">{hint}</p>
      </div>
      <Link
        href={href}
        className="shrink-0 text-sm font-medium text-wine underline-offset-4 hover:underline"
      >
        {open}
      </Link>
    </div>
  );
}

export default async function PractitionerSettingsPage({
  searchParams,
}: {
  searchParams: { saved?: string; error?: string; lang?: string | string[] };
}) {
  const user = await requirePractitioner();
  const t = practitionerSettingsCopy(resolvePortalLocale(searchParams.lang, user.locale));
  const practitioner = await getPractitioner();
  if (!practitioner) return null;

  const [config, deletionRequests, toolRows] = await Promise.all([
    getOrCreateConfig(practitioner.id),
    prisma.deletionRequest.findMany({
      where: { status: { in: ["OPEN", "ACKNOWLEDGED"] } },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
    // Phase 4 — tools link only for tenants with tool modules enabled
    // (Valentina has none: her settings render byte-identically).
    // TenantModule is platform config, NOT in the scoped-model list — the
    // tenant filter must be explicit here.
    (async () => {
      const { getTenant } = await import("@/lib/tenancy");
      const t = await getTenant();
      return prisma.tenantModule.findMany({
        where: { tenantId: t.id, enabled: true, moduleKey: { in: ["tarot-draw", "lookup-console"] } },
        select: { id: true },
      });
    })(),
  ]);
  const hasTools = toolRows.length > 0;

  const fee = (config.lateFeeCents / 100).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  });
  const dateFmt = new Intl.DateTimeFormat("en-US", { dateStyle: "long" });

  const assistNotifyRow = await readPracticeSetting("assistNotifyEmail");
  const assistNotifyOn = assistNotifyRow?.value !== "off";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>{t.eyebrow}</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">{t.title}</h1>
        <SignatureRule />
        <p className="max-w-prose text-ink">{t.intro}</p>
      </div>

      {searchParams.saved && (t.saved as Record<string, string>)[searchParams.saved] && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          {(t.saved as Record<string, string>)[searchParams.saved]}
        </p>
      )}
      {searchParams.error && (t.errors as Record<string, string>)[searchParams.error] && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          {(t.errors as Record<string, string>)[searchParams.error]}
        </p>
      )}

      {/* Account */}
      <Section title={t.account.heading}>
        <div className="py-4">
          <p className="font-medium text-ink-strong">{t.account.emailLabel}</p>
          <p className="text-sm text-slate">{user.email}</p>
          <details className="mt-2">
            <summary className="cursor-pointer text-sm font-medium text-wine underline-offset-4 hover:underline">
              {t.account.emailChange}
            </summary>
            <form
              action={requestEmailChange.bind(null, "/practitioner/settings")}
              className="mt-3 flex max-w-md flex-col gap-3"
            >
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink-strong">{t.account.emailNewLabel}</span>
                <input type="email" name="newEmail" required className={inputCls} />
              </label>
              <p className="text-xs text-slate">{t.account.emailNote}</p>
              <PendingButton className={primaryBtn}>{t.account.emailSend}</PendingButton>
            </form>
          </details>
        </div>

        <div className="py-4">
          <p className="font-medium text-ink-strong">{t.account.passwordLabel}</p>
          <details className="mt-2">
            <summary className="cursor-pointer text-sm font-medium text-wine underline-offset-4 hover:underline">
              {t.account.passwordChange}
            </summary>
            <form
              action={changePassword.bind(null, "/practitioner/settings")}
              className="mt-3 flex max-w-md flex-col gap-3"
            >
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink-strong">{t.account.passwordCurrent}</span>
                <input
                  type="password"
                  name="current"
                  required
                  autoComplete="current-password"
                  className={inputCls}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink-strong">{t.account.passwordNew}</span>
                <input
                  type="password"
                  name="next"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className={inputCls}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink-strong">{t.account.passwordConfirm}</span>
                <input
                  type="password"
                  name="confirm"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className={inputCls}
                />
              </label>
              <p className="text-xs text-slate">{t.account.passwordHint}</p>
              <PendingButton className={primaryBtn}>{t.account.passwordSubmit}</PendingButton>
            </form>
          </details>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div>
            <p className="font-medium text-ink-strong">{t.account.signoutLabel}</p>
            <p className="max-w-prose text-sm text-slate">{t.account.signoutHint}</p>
          </div>
          <form action={signOutEverywhere}>
            <PendingButton className={quietBtn}>{t.account.signoutButton}</PendingButton>
          </form>
        </div>
      </Section>

      {/* Language & appearance */}
      <Section title={t.language.heading}>
        <form
          action={savePractitionerLocale}
          className="flex flex-wrap items-center justify-between gap-4 py-4"
        >
          <div>
            <p className="font-medium text-ink-strong">{t.language.label}</p>
            <p className="text-sm text-slate">{t.language.hint}</p>
          </div>
          <div className="flex items-center gap-3">
            <select
              name="locale"
              defaultValue={user.locale === "es" ? "es" : "en"}
              className={inputCls}
            >
              <option value="en">{t.language.en}</option>
              <option value="es">{t.language.es}</option>
            </select>
            <PendingButton className={quietBtn}>{t.language.save}</PendingButton>
          </div>
        </form>
        <div className="flex items-center justify-between gap-4 py-4">
          <div>
            <p className="font-medium text-ink-strong">{t.language.theme}</p>
            <p className="text-sm text-slate">{t.language.themeHint}</p>
          </div>
          <ThemeToggle />
        </div>
      </Section>

      {/* Practice */}
      <Section title={t.practice.heading}>
        <LinkRow
          href="/practitioner/billing"
          label={t.practice.billingLabel}
          hint={t.practice.billingHint}
          open={t.open}
        />
        <LinkRow
          href="/practitioner/availability"
          label={t.practice.availabilityLabel}
          hint={t.practice.availabilityHint}
          open={t.open}
        />
        <LinkRow
          href="/practitioner/settings/payments"
          label={t.practice.paymentsLabel}
          hint={t.practice.paymentsHint}
          open={t.open}
        />
        <LinkRow
          href="/practitioner/settings/billing"
          label={t.practice.planLabel}
          hint={t.practice.planHint}
          open={t.open}
        />
        {hasTools && (
          <LinkRow
            href="/practitioner/tools"
            label={t.practice.toolsLabel}
            hint={t.practice.toolsHint}
            open={t.open}
          />
        )}
        <LinkRow
          href="/practitioner/agreements"
          label={t.practice.agreementsLabel}
          hint={t.practice.agreementsHint}
          open={t.open}
        />
        {/* C21 — her stored signature: drawn or uploaded once, applied
            automatically (with the auto-set date) when she signs or
            countersigns. */}
        <div id="signature" className="flex flex-col gap-2 scroll-mt-24 py-4">
          <p className="font-medium text-ink-strong">{t.practice.signatureLabel}</p>
          <p className="max-w-prose text-sm text-slate">{t.practice.signatureHint}</p>
          <SignaturePadForm
            current={await (await import("@/lib/agreements")).getPractitionerSignature()}
            onSave={savePractitionerSignatureAction}
          />
        </div>
        <LinkRow
          href="/practitioner/settings/intake-preview"
          label={t.practice.intakePreviewLabel}
          hint={t.practice.intakePreviewHint}
          open={t.open}
        />
        {/* C23-REFERRAL §3 — the referrer's own view lives on its own route,
            reachable from here and from nowhere in the navigation. */}
        <LinkRow
          href="/practitioner/referrals"
          label={t.practice.referralsLabel}
          hint={t.practice.referralsHint}
          open={t.open}
        />
        <LinkRow
          href="/practitioner/messages"
          label={t.practice.messagesLabel}
          hint={t.practice.messagesHint}
          open={t.open}
        />
        {/* AMD-06 — assist-session transparency email, her conscious default. */}
        <form action={setAssistNotify} className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div>
            <p className="font-medium text-ink-strong">{t.practice.assistLabel}</p>
            <p className="max-w-prose text-sm text-slate">{t.practice.assistHint}</p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="assistNotify" defaultChecked={assistNotifyOn} />{" "}
              {t.practice.assistOn}
            </label>
            <PendingButton className="rounded-md border border-line px-3.5 py-1.5 text-sm font-medium text-slate transition-colors hover:border-mocha hover:text-wine">
              {t.practice.assistSave}
            </PendingButton>
          </div>
        </form>
      </Section>

      {/* Session-change policy */}
      <Section title={t.policy.heading}>
        <form action={savePolicy} className="flex flex-col gap-4 py-4">
          <div className="grid max-w-md grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-strong">{t.policy.cutoffLabel}</span>
              <input
                type="number"
                name="cancelCutoffHours"
                min={0}
                max={336}
                defaultValue={config.cancelCutoffHours}
                className={inputCls}
              />
              <span className="text-xs text-slate">{t.policy.cutoffUnit}</span>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-strong">{t.policy.feeLabel}</span>
              <input
                type="number"
                name="lateFee"
                min={0}
                step="0.01"
                defaultValue={(config.lateFeeCents / 100).toFixed(2)}
                className={inputCls}
              />
              <span className="text-xs text-slate">{t.policy.feeUnit}</span>
            </label>
          </div>
          {/* C20 v3.1 counsel note — liquidated-damages proportionality: a
              soft warning only, never a block (her call + counsel's). */}
          {await (async () => {
            const rate = await prisma.priceBook.findFirst({
              where: { active: true, kind: "SESSION" },
              orderBy: { createdAt: "desc" },
              select: { amountCents: true },
            });
            return rate && config.lateFeeCents > rate.amountCents ? (
              <p className="rounded-md border border-mocha bg-blush px-3 py-2 text-xs text-wine">
                {t.policy.proportionality}
              </p>
            ) : null;
          })()}
          <label className="flex items-start gap-3 text-sm text-ink">
            <input
              type="checkbox"
              name="lateFeeAutoApply"
              defaultChecked={config.lateFeeAutoApply}
              className="mt-0.5 h-4 w-4 accent-wine"
            />
            <span>
              {t.policy.autoLabel}
              <span className="block text-xs text-slate">{t.policy.autoHint}</span>
            </span>
          </label>
          <p className="max-w-prose text-xs text-slate">
            {fill(t.policy.summary, { hours: config.cancelCutoffHours, fee })}
          </p>
          <PendingButton className={primaryBtn}>{t.policy.save}</PendingButton>
        </form>
      </Section>

      {/* Deletion requests (AMD-05 B3) */}
      <Section title={t.deletion.heading}>
        {deletionRequests.length === 0 ? (
          <p className="py-4 text-sm text-slate">{t.deletion.none}</p>
        ) : (
          deletionRequests.map((r) => (
            <div key={r.id} className="flex flex-col gap-2 py-4">
              <div className="flex flex-wrap items-center gap-3">
                <p className="font-medium text-ink-strong">{r.user.name ?? r.user.email}</p>
                <p className="text-sm text-slate">{r.user.email}</p>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    r.status === "OPEN" ? "bg-blush-deep text-wine" : "bg-line/50 text-slate"
                  }`}
                >
                  {r.status === "OPEN" ? t.deletion.statusOpen : t.deletion.statusAcknowledged}
                </span>
                <p className="ml-auto text-sm text-slate">{dateFmt.format(r.createdAt)}</p>
              </div>
              {r.note && (
                <p className="max-w-prose whitespace-pre-wrap text-sm text-ink">{r.note}</p>
              )}
              <p className="text-xs text-slate">{t.deletion.promise}</p>
              <div className="flex gap-3">
                {r.status === "OPEN" && (
                  <form action={setDeletionStatus.bind(null, r.id, "ACKNOWLEDGED")}>
                    <PendingButton className={quietBtn}>{t.deletion.acknowledge}</PendingButton>
                  </form>
                )}
                <form action={setDeletionStatus.bind(null, r.id, "CLOSED")}>
                  <PendingButton className={quietBtn}>{t.deletion.close}</PendingButton>
                </form>
              </div>
            </div>
          ))
        )}
      </Section>
    </div>
  );
}
