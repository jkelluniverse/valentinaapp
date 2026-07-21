import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/lib/prisma";
import { requireClient } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { ThemeToggle } from "@/components/ThemeToggle";
import { PushToggle } from "@/components/PushToggle";
import { changePassword, requestEmailChange, signOutEverywhere } from "@/app/account/actions";
import { saveLocale, saveNotifications, requestDeletion, setRecordingConsent } from "./actions";
import { RECORDING_CONSENT_TEXT } from "@/lib/recording";
import { PendingButton } from "@/components/PendingButton";

export const dynamic = "force-dynamic";

// AMD-05 — the client's settings: hairline rows, sectioned, calm. Everything
// here either works or isn't shown; nothing is a card grid (AMENDMENT-04).

const SAVED = ["password", "email", "language", "notifications", "deletion"] as const;
const ERRORS = [
  "pw-rate",
  "pw-short",
  "pw-match",
  "pw-current",
  "email-rate",
  "email-format",
  "email-same",
  "email-taken",
  "del-rate",
] as const;

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

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: { saved?: string; error?: string };
}) {
  const user = await requireClient();
  const t = await getTranslations("settings");

  const [profile, pendingDeletion, recordingConsent] = await Promise.all([
    prisma.clientProfile.findUnique({ where: { userId: user.id } }),
    prisma.deletionRequest.findFirst({
      where: { userId: user.id, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.recordingConsent.findUnique({ where: { clientId: user.id } }),
  ]);

  const dateFmt = new Intl.DateTimeFormat(user.locale === "es" ? "es" : "en", {
    dateStyle: "long",
  });

  const saved = SAVED.find((k) => k === searchParams.saved);
  const error = ERRORS.find((k) => k === searchParams.error);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>{t("eyebrow")}</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">{t("title")}</h1>
        <SignatureRule />
        <p className="max-w-prose text-ink">{t("intro")}</p>
      </div>

      {saved && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          {t(`saved.${saved}`)}
        </p>
      )}
      {error && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          {t(`errors.${error}`)}
        </p>
      )}

      {/* Profile */}
      <Section title={t("profile.heading")}>
        <div className="flex items-center justify-between gap-4 py-4">
          <div>
            <p className="font-medium text-ink-strong">{t("profile.row")}</p>
            <p className="text-sm text-slate">{t("profile.hint")}</p>
          </div>
          <Link
            href="/space/profile"
            className="text-sm font-medium text-wine underline-offset-4 hover:underline"
          >
            {t("profile.open")} →
          </Link>
        </div>
      </Section>

      {/* Account */}
      <Section title={t("account.heading")}>
        <div className="py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-ink-strong">{t("account.email.label")}</p>
              <p className="text-sm text-slate">{user.email}</p>
            </div>
          </div>
          <details className="mt-2">
            <summary className="cursor-pointer text-sm font-medium text-wine underline-offset-4 hover:underline">
              {t("account.email.change")}
            </summary>
            <form
              action={requestEmailChange.bind(null, "/space/settings")}
              className="mt-3 flex max-w-md flex-col gap-3"
            >
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink-strong">
                  {t("account.email.newLabel")}
                </span>
                <input type="email" name="newEmail" required className={inputCls} />
              </label>
              <p className="text-xs text-slate">{t("account.email.note")}</p>
              <PendingButton className={primaryBtn}>{t("account.email.send")}</PendingButton>
            </form>
          </details>
        </div>

        <div className="py-4">
          <p className="font-medium text-ink-strong">{t("account.password.label")}</p>
          <details className="mt-2">
            <summary className="cursor-pointer text-sm font-medium text-wine underline-offset-4 hover:underline">
              {t("account.password.change")}
            </summary>
            <form
              action={changePassword.bind(null, "/space/settings")}
              className="mt-3 flex max-w-md flex-col gap-3"
            >
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink-strong">
                  {t("account.password.current")}
                </span>
                <input
                  type="password"
                  name="current"
                  required
                  autoComplete="current-password"
                  className={inputCls}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink-strong">
                  {t("account.password.new")}
                </span>
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
                <span className="text-sm font-medium text-ink-strong">
                  {t("account.password.confirm")}
                </span>
                <input
                  type="password"
                  name="confirm"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className={inputCls}
                />
              </label>
              <p className="text-xs text-slate">{t("account.password.hint")}</p>
              <PendingButton className={primaryBtn}>{t("account.password.submit")}</PendingButton>
            </form>
          </details>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div>
            <p className="font-medium text-ink-strong">{t("account.signout.label")}</p>
            <p className="max-w-prose text-sm text-slate">{t("account.signout.hint")}</p>
          </div>
          <form action={signOutEverywhere}>
            <PendingButton className={quietBtn}>{t("account.signout.button")}</PendingButton>
          </form>
        </div>
      </Section>

      {/* Language & appearance */}
      <Section title={t("language.heading")}>
        <form
          action={saveLocale}
          className="flex flex-wrap items-center justify-between gap-4 py-4"
        >
          <div>
            <p className="font-medium text-ink-strong">{t("language.label")}</p>
            <p className="text-sm text-slate">{t("language.hint")}</p>
          </div>
          <div className="flex items-center gap-3">
            <select name="locale" defaultValue={user.locale === "es" ? "es" : "en"} className={inputCls}>
              <option value="en">{t("language.en")}</option>
              <option value="es">{t("language.es")}</option>
            </select>
            <PendingButton className={quietBtn}>{t("language.save")}</PendingButton>
          </div>
        </form>
        <div className="flex items-center justify-between gap-4 py-4">
          <div>
            <p className="font-medium text-ink-strong">{t("language.theme")}</p>
            <p className="text-sm text-slate">{t("language.themeHint")}</p>
          </div>
          <ThemeToggle />
        </div>
      </Section>

      {/* C19 §0 — session recording: its own consent, in context, revocable. */}
      <Section title={user.locale === "es" ? "Grabación de sesiones" : "Session recording"}>
        <div className="flex flex-col gap-3 py-4">
          <p className="max-w-prose text-sm leading-relaxed text-ink">
            {RECORDING_CONSENT_TEXT[user.locale === "es" ? "es" : "en"]}
          </p>
          {recordingConsent && !recordingConsent.revokedAt ? (
            <form action={setRecordingConsent.bind(null, false)} className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-wine">
                {user.locale === "es"
                  ? `Consentimiento dado el ${dateFmt.format(recordingConsent.grantedAt)}`
                  : `Consent given ${dateFmt.format(recordingConsent.grantedAt)}`}
              </span>
              <PendingButton className="rounded-md border border-line px-3.5 py-1.5 text-sm font-medium text-slate transition-colors hover:border-mocha hover:text-wine">
                {user.locale === "es" ? "Revocar" : "Revoke"}
              </PendingButton>
            </form>
          ) : (
            <form action={setRecordingConsent.bind(null, true)}>
              <PendingButton className="self-start rounded-md border border-mocha px-4 py-2 text-sm font-medium text-wine transition-colors hover:bg-blush">
                {user.locale === "es" ? "Doy mi consentimiento" : "I give my consent"}
              </PendingButton>
            </form>
          )}
          <p className="text-[12px] text-whisper">
            {user.locale === "es"
              ? "Sin este consentimiento, ninguna sesión tuya se graba — nunca."
              : "Without this consent, none of your sessions are recorded — ever."}
          </p>
        </div>
      </Section>

      {/* Notifications */}
      <Section title={t("notifications.heading")}>
        {process.env.VAPID_PUBLIC_KEY && (
          <div className="flex items-center justify-between gap-4 border-b border-line py-4">
            <div>
              <p className="font-medium text-ink-strong">{t("notifications.push")}</p>
              <p className="text-sm text-slate">{t("notifications.pushHint")}</p>
            </div>
            <PushToggle
              vapidPublicKey={process.env.VAPID_PUBLIC_KEY}
              labels={{
                enable: t("notifications.pushEnable"),
                disable: t("notifications.pushDisable"),
                on: t("notifications.pushOn"),
                unsupported: t("notifications.pushUnsupported"),
                blocked: t("notifications.pushBlocked"),
                iosHint: t("notifications.pushIosHint"),
              }}
            />
          </div>
        )}
        <form action={saveNotifications} className="flex flex-col divide-y divide-line">
          <p className="py-4 text-sm text-slate">{t("notifications.hint")}</p>
          <label className="flex items-start gap-3 py-4">
            <input
              type="checkbox"
              name="paymentReminders"
              defaultChecked={!(profile?.paymentRemindersMuted ?? false)}
              className="mt-1 h-4 w-4 accent-wine"
            />
            <span>
              <span className="block font-medium text-ink-strong">
                {t("notifications.payment")}
              </span>
              <span className="block text-sm text-slate">{t("notifications.paymentHint")}</span>
            </span>
          </label>
          <label className="flex items-start gap-3 py-4">
            <input
              type="checkbox"
              name="renewalNotes"
              defaultChecked={!(profile?.renewalMessagesMuted ?? false)}
              className="mt-1 h-4 w-4 accent-wine"
            />
            <span>
              <span className="block font-medium text-ink-strong">
                {t("notifications.renewal")}
              </span>
              <span className="block text-sm text-slate">{t("notifications.renewalHint")}</span>
            </span>
          </label>
          <div className="py-4">
            <PendingButton className={quietBtn}>{t("notifications.save")}</PendingButton>
          </div>
        </form>
      </Section>

      {/* Your record — the consent's own promises, honored (AMD-05 B3) */}
      <Section title={t("record.heading")}>
        <div className="flex items-center justify-between gap-4 py-4">
          <div>
            <p className="font-medium text-ink-strong">{t("record.consent")}</p>
            <p className="text-sm text-slate">{t("record.consentHint")}</p>
          </div>
          <Link
            href="/space/settings/consent"
            className="text-sm font-medium text-wine underline-offset-4 hover:underline"
          >
            {t("record.read")} →
          </Link>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div>
            <p className="font-medium text-ink-strong">{t("record.export")}</p>
            <p className="max-w-prose text-sm text-slate">{t("record.exportHint")}</p>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="/space/settings/export"
              className="text-sm font-medium text-wine underline-offset-4 hover:underline"
            >
              {t("record.exportJson")}
            </a>
            <Link
              href="/space/settings/keepsake"
              className="text-sm font-medium text-wine underline-offset-4 hover:underline"
            >
              {t("record.keepsake")}
            </Link>
          </div>
        </div>

        <div className="py-4">
          <p className="font-medium text-ink-strong">{t("record.deletion")}</p>
          {pendingDeletion ? (
            <p className="mt-1 max-w-prose text-sm text-ink">
              {t("record.deletionPending", { date: dateFmt.format(pendingDeletion.createdAt) })}
            </p>
          ) : (
            <>
              <p className="mt-1 max-w-prose text-sm text-slate">{t("record.deletionHint")}</p>
              <details className="mt-2">
                <summary className="cursor-pointer text-sm font-medium text-wine underline-offset-4 hover:underline">
                  {t("record.deletionOpen")}
                </summary>
                <form action={requestDeletion} className="mt-3 flex max-w-md flex-col gap-3">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium text-ink-strong">
                      {t("record.deletionNote")}
                    </span>
                    <textarea name="note" rows={3} maxLength={2000} className={inputCls} />
                  </label>
                  <p className="text-xs text-slate">{t("record.deletionTimeline")}</p>
                  <PendingButton className={primaryBtn}>{t("record.deletionSubmit")}</PendingButton>
                </form>
              </details>
            </>
          )}
        </div>
      </Section>
    </div>
  );
}
