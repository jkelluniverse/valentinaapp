import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getPractitioner, getOrCreateConfig } from "@/lib/schedule";
import { changePassword, requestEmailChange, signOutEverywhere } from "@/app/account/actions";
import { savePractitionerLocale, savePolicy, setDeletionStatus , setAssistNotify } from "./actions";
import { PendingButton } from "@/components/PendingButton";

export const dynamic = "force-dynamic";

// AMD-05 — the practitioner's settings. Same calm hairline-row idiom as the
// client surface; plain English (her AI/output language preference follows
// User.locale later).

const SAVED: Record<string, string> = {
  password: "Password changed. Every other session has been signed out.",
  email: "Check the new address for a confirmation link — nothing changes until it's confirmed.",
  language: "Language saved.",
  policy: "Session-change policy saved.",
  assist: "Assist notification preference saved.",
  deletion: "Updated.",
};

const ERRORS: Record<string, string> = {
  "pw-rate": "Too many attempts — give it fifteen minutes and try again.",
  "pw-short": "The new password needs at least 8 characters.",
  "pw-match": "The new passwords didn't match.",
  "pw-current": "That current password isn't right.",
  "email-rate": "Too many requests — try again in an hour.",
  "email-format": "That doesn't look like an email address.",
  "email-same": "That's already your address.",
  "email-taken": "That address can't be used.",
  policy: "Those policy numbers didn't look right — nothing was changed.",
};

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

function LinkRow({ href, label, hint }: { href: string; label: string; hint: string }) {
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
        Open →
      </Link>
    </div>
  );
}

export default async function PractitionerSettingsPage({
  searchParams,
}: {
  searchParams: { saved?: string; error?: string };
}) {
  const user = await requirePractitioner();
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

  const assistNotifyRow = await prisma.practiceSetting.findUnique({
    where: { key: "assistNotifyEmail" },
  });
  const assistNotifyOn = assistNotifyRow?.value !== "off";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <Eyebrow>Your practice</Eyebrow>
        <h1 className="text-[2.25rem] font-semibold">Settings</h1>
        <SignatureRule />
        <p className="max-w-prose text-ink">
          Your account, your language, and the policies your practice runs on.
        </p>
      </div>

      {searchParams.saved && SAVED[searchParams.saved] && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          {SAVED[searchParams.saved]}
        </p>
      )}
      {searchParams.error && ERRORS[searchParams.error] && (
        <p className="rounded-md bg-blush-deep px-4 py-2.5 text-sm text-wine">
          {ERRORS[searchParams.error]}
        </p>
      )}

      {/* Account */}
      <Section title="Account">
        <div className="py-4">
          <p className="font-medium text-ink-strong">Email</p>
          <p className="text-sm text-slate">{user.email}</p>
          <details className="mt-2">
            <summary className="cursor-pointer text-sm font-medium text-wine underline-offset-4 hover:underline">
              Change email
            </summary>
            <form
              action={requestEmailChange.bind(null, "/practitioner/settings")}
              className="mt-3 flex max-w-md flex-col gap-3"
            >
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink-strong">New email address</span>
                <input type="email" name="newEmail" required className={inputCls} />
              </label>
              <p className="text-xs text-slate">
                Nothing changes until you confirm from the new address — a link (valid 24 hours)
                goes there, and a notice goes to your current address.
              </p>
              <PendingButton className={primaryBtn}>Send confirmation link</PendingButton>
            </form>
          </details>
        </div>

        <div className="py-4">
          <p className="font-medium text-ink-strong">Password</p>
          <details className="mt-2">
            <summary className="cursor-pointer text-sm font-medium text-wine underline-offset-4 hover:underline">
              Change password
            </summary>
            <form
              action={changePassword.bind(null, "/practitioner/settings")}
              className="mt-3 flex max-w-md flex-col gap-3"
            >
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink-strong">Current password</span>
                <input
                  type="password"
                  name="current"
                  required
                  autoComplete="current-password"
                  className={inputCls}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink-strong">New password</span>
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
                <span className="text-sm font-medium text-ink-strong">Confirm new password</span>
                <input
                  type="password"
                  name="confirm"
                  required
                  minLength={8}
                  autoComplete="new-password"
                  className={inputCls}
                />
              </label>
              <p className="text-xs text-slate">
                At least 8 characters. Changing it signs you out on every other device.
              </p>
              <PendingButton className={primaryBtn}>Change password</PendingButton>
            </form>
          </details>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div>
            <p className="font-medium text-ink-strong">Sign out everywhere</p>
            <p className="max-w-prose text-sm text-slate">
              Ends every session on every device, including this one — sign in again after.
            </p>
          </div>
          <form action={signOutEverywhere}>
            <PendingButton className={quietBtn}>Sign out everywhere</PendingButton>
          </form>
        </div>
      </Section>

      {/* Language & appearance */}
      <Section title="Language & appearance">
        <form
          action={savePractitionerLocale}
          className="flex flex-wrap items-center justify-between gap-4 py-4"
        >
          <div>
            <p className="font-medium text-ink-strong">Language</p>
            <p className="text-sm text-slate">
              Your portal language — AI-drafted output will follow it too.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              name="locale"
              defaultValue={user.locale === "es" ? "es" : "en"}
              className={inputCls}
            >
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
            <PendingButton className={quietBtn}>Save</PendingButton>
          </div>
        </form>
        <div className="flex items-center justify-between gap-4 py-4">
          <div>
            <p className="font-medium text-ink-strong">Theme</p>
            <p className="text-sm text-slate">Daylight or Dusk — remembered on this device.</p>
          </div>
          <ThemeToggle />
        </div>
      </Section>

      {/* Practice */}
      <Section title="Practice">
        <LinkRow
          href="/practitioner/billing"
          label="Rates & billing"
          hint="Your price book, packages, and the ledger."
        />
        <LinkRow
          href="/practitioner/availability"
          label="Availability & session config"
          hint="Hours, session length, buffers, and video links."
        />
        <LinkRow
          href="/practitioner/settings/payments"
          label="Getting paid"
          hint="Your payment connection — money goes directly to you."
        />
        <LinkRow
          href="/practitioner/settings/billing"
          label="Plan &amp; billing"
          hint="Your platform plan — card, invoices, and receipts."
        />
        {hasTools && (
          <LinkRow
            href="/practitioner/tools"
            label="Session &amp; research tools"
            hint="Draw tools and lookups for work in the moment."
          />
        )}
        <LinkRow
          href="/practitioner/agreements"
          label="Agreements"
          hint="Send, sign, and keep the sealed record — for both of you."
        />
        <LinkRow
          href="/practitioner/settings/intake-preview"
          label="Preview intake"
          hint="See the intake exactly as your client will — nothing is saved."
        />
        <LinkRow
          href="/practitioner/messages"
          label="Response rhythm & away note"
          hint="How the Open Line sets expectations."
        />
        {/* AMD-06 — assist-session transparency email, her conscious default. */}
        <form action={setAssistNotify} className="flex flex-wrap items-center justify-between gap-4 py-4">
          <div>
            <p className="font-medium text-ink-strong">Email clients after an assist session</p>
            <p className="max-w-prose text-sm text-slate">
              A quiet note — “Valentina helped with your account today” — each time you enter
              their portal to help. Recommended on; the visible line in their settings stays
              either way.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" name="assistNotify" defaultChecked={assistNotifyOn} /> On
            </label>
            <PendingButton className="rounded-md border border-line px-3.5 py-1.5 text-sm font-medium text-slate transition-colors hover:border-mocha hover:text-wine">
              Save
            </PendingButton>
          </div>
        </form>
      </Section>

      {/* Session-change policy */}
      <Section title="Session-change policy">
        <form action={savePolicy} className="flex flex-col gap-4 py-4">
          <div className="grid max-w-md grid-cols-2 gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-strong">Free-change cutoff</span>
              <input
                type="number"
                name="cancelCutoffHours"
                min={0}
                max={336}
                defaultValue={config.cancelCutoffHours}
                className={inputCls}
              />
              <span className="text-xs text-slate">hours before the session</span>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-strong">Late fee</span>
              <input
                type="number"
                name="lateFee"
                min={0}
                step="0.01"
                defaultValue={(config.lateFeeCents / 100).toFixed(2)}
                className={inputCls}
              />
              <span className="text-xs text-slate">dollars</span>
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
                Heads-up: the late fee is higher than the current session rate — counsel flagged
                that a late-change fee should stay a reasonable proportion of the session price.
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
              Apply the fee automatically
              <span className="block text-xs text-slate">
                Unchecked, you&apos;ll be prompted each time instead.
              </span>
            </span>
          </label>
          <p className="max-w-prose text-xs text-slate">
            More than {config.cancelCutoffHours}h notice → free. Less → {fee}. No-shows → {fee}.
          </p>
          <PendingButton className={primaryBtn}>Save policy</PendingButton>
        </form>
      </Section>

      {/* Deletion requests (AMD-05 B3) */}
      <Section title="Deletion requests">
        {deletionRequests.length === 0 ? (
          <p className="py-4 text-sm text-slate">None — all quiet.</p>
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
                  {r.status === "OPEN" ? "Open" : "Acknowledged"}
                </span>
                <p className="ml-auto text-sm text-slate">{dateFmt.format(r.createdAt)}</p>
              </div>
              {r.note && (
                <p className="max-w-prose whitespace-pre-wrap text-sm text-ink">{r.note}</p>
              )}
              <p className="text-xs text-slate">
                The promise: a response within 7 days, deletion completed within 30 days of
                confirmation.
              </p>
              <div className="flex gap-3">
                {r.status === "OPEN" && (
                  <form action={setDeletionStatus.bind(null, r.id, "ACKNOWLEDGED")}>
                    <PendingButton className={quietBtn}>Acknowledge</PendingButton>
                  </form>
                )}
                <form action={setDeletionStatus.bind(null, r.id, "CLOSED")}>
                  <PendingButton className={quietBtn}>Mark closed</PendingButton>
                </form>
              </div>
            </div>
          ))
        )}
      </Section>
    </div>
  );
}
