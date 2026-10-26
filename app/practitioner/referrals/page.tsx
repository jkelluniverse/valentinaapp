import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requirePractitioner } from "@/lib/auth-guards";
import { SignatureRule, Eyebrow } from "@/components/brand";
import { getBaseUrl } from "@/lib/base-url";
import { ownProspect, referralCounts, listReferred } from "@/lib/referrals";
import { referralJoinUrl } from "@/lib/referral-config";
import { referralCopy, resolvePortalLocale, fill } from "@/lib/referral-copy";

// C23-REFERRAL §3 — the referrer's own view. A NEW route on purpose: the spec
// forbids adding anything to the practitioner dashboard or any screen the
// 16-screen byte baseline covers (Architect ruling 11), so this build stays
// clear of Valentina's chrome entirely. It is reachable from
// /practitioner/settings and from nowhere in the navigation.
//
// WHAT IT SHOWS, and nothing else: the practitioner's own code, a one-tap way
// to pass it on, how many prospects arrived on it and how many became
// practices, their founding-partner standing, and the FIRST NAMES of the people
// who came in behind them.
//
// WHAT IT DOES NOT SHOW: no reward, no credit, no figure, no progress bar
// toward anything. The offer Jacob ratified is a finished portal plus founding-
// partner recognition — this page shows what is true and stops there.
//
// CROSS-TENANT ISOLATION: the code is found from the SIGNED-IN session only
// (the request's tenant, then the session's email). There is no code, id or
// tenant parameter on this route, so there is nothing a practitioner could
// change to look at another practitioner's referrals; auth-guards already
// refuses a session whose tenant is not the request's.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your referral code",
  robots: { index: false, follow: false },
};

export default async function PractitionerReferralsPage({
  searchParams,
}: {
  searchParams: { lang?: string };
}) {
  const user = await requirePractitioner();
  const locale = resolvePortalLocale(searchParams.lang, user.locale);
  const t = referralCopy(locale);
  const other = locale === "en" ? "es" : "en";

  const { getTenant } = await import("@/lib/tenancy");
  const tenant = await getTenant();

  const mine = await ownProspect({ tenantId: tenant.id, email: user.email });
  // TenantBilling is a scoped model, so this reads the request tenant's row
  // and no other. FOUNDING_COMP is the plan every founding-partner signup
  // lands on (C23-SIGNUP §4) — it is the record of the standing, and the copy
  // states the standing without attaching any benefit to it.
  const billing = mine
    ? await prisma.tenantBilling.findFirst({ where: { tenantId: tenant.id }, select: { plan: true } })
    : null;
  const founding = billing?.plan === "FOUNDING_COMP";

  const counts = mine ? await referralCounts(mine.referralCode) : { total: 0, leads: 0, signedUp: 0, declined: 0 };
  const people = mine ? await listReferred(mine.referralCode) : [];

  const shareUrl = mine ? referralJoinUrl(mine.referralCode, getBaseUrl()) : "";
  const body = mine ? fill(t.shareBody, { code: mine.referralCode, url: shareUrl }) : "";
  const mailto = `mailto:?subject=${encodeURIComponent(t.shareSubject)}&body=${encodeURIComponent(body)}`;
  const sms = `sms:?&body=${encodeURIComponent(body)}`;

  const card = "rounded-lg border border-line bg-white p-6 shadow-soft";
  const dt = "text-[13px] font-semibold uppercase tracking-wide text-mocha";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-4">
          <Eyebrow>{t.eyebrow}</Eyebrow>
          <Link
            href={`/practitioner/referrals?lang=${other}`}
            hrefLang={other}
            className="rounded-pill border border-mocha px-3 py-1 text-[12px] font-semibold uppercase tracking-wide text-wine transition-colors hover:bg-blush"
          >
            {other === "es" ? "Español" : "English"}
          </Link>
        </div>
        <h1 className="text-[2.25rem] font-semibold">{t.heading}</h1>
        <SignatureRule />
        <p className="max-w-prose text-ink">{t.lede}</p>
      </div>

      {!mine ? (
        /* A practice set up directly (Valentina, the demo tenants) was never a
           prospect, so it has no code. Say so plainly: no row is invented and
           no code is issued by looking at a page. */
        <section className={card}>
          <h2 className="text-xl font-semibold">{t.noCodeHeading}</h2>
          <p className="mt-2 max-w-prose text-sm text-slate">{t.noCode}</p>
        </section>
      ) : (
        <>
          <section className="rounded-lg border border-mocha bg-blush p-6">
            <p className={dt}>{t.codeLabel}</p>
            <p className="mt-1.5 font-mono text-3xl font-semibold tracking-[0.18em] text-wine">
              {mine.referralCode}
            </p>
            <p className="mt-3 text-[15px] leading-relaxed text-slate">{t.codeNote}</p>
          </section>

          {/* One tap: the same plain mailto:/sms: pattern /join/thanks uses —
              no clipboard API, no Web Share API, no hydration — with the link
              printed in full underneath, because a share sheet that fails
              leaves the link and a link that fails leaves nothing. */}
          <section className={card}>
            <h2 className="text-xl font-semibold">{t.shareHeading}</h2>
            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href={mailto}
                className="inline-flex items-center justify-center rounded-pill bg-wine px-6 py-3 text-[15px] font-semibold text-cream shadow-soft transition-colors hover:bg-wine/90"
              >
                {t.shareEmail}
              </a>
              <a
                href={sms}
                className="inline-flex items-center justify-center rounded-pill border border-mocha px-6 py-3 text-[15px] font-semibold text-wine transition-colors hover:bg-blush"
              >
                {t.shareSms}
              </a>
            </div>
            <p className={`mt-4 ${dt}`}>{t.linkLabel}</p>
            <p className="mt-1 break-all font-mono text-[14px] text-ink">{shareUrl}</p>
          </section>

          <section className={card}>
            <h2 className="text-xl font-semibold">{t.countsHeading}</h2>
            {counts.total === 0 ? (
              <>
                <p className="mt-2 font-medium text-ink-strong">{t.zeroHeading}</p>
                <p className="mt-1 max-w-prose text-sm text-slate">{t.zero}</p>
              </>
            ) : (
              <div className="mt-4 flex flex-wrap gap-10">
                <div>
                  <p className="font-headline text-3xl font-semibold text-wine">{counts.total}</p>
                  <p className={dt}>{t.countArrived}</p>
                </div>
                <div>
                  <p className="font-headline text-3xl font-semibold text-wine">{counts.signedUp}</p>
                  <p className={dt}>{t.countPractices}</p>
                </div>
              </div>
            )}
          </section>

          {people.length > 0 && (
            <section className={card}>
              <h2 className="text-xl font-semibold">{t.peopleHeading}</h2>
              <p className="mt-1 text-sm text-slate">{t.peopleNote}</p>
              <ul className="mt-4 divide-y divide-line">
                {people.map((p, i) => (
                  <li key={`${p.firstName}-${i}`} className="flex items-center justify-between gap-4 py-3">
                    <span className="font-medium text-ink-strong">{p.firstName || "—"}</span>
                    <span className="text-sm text-slate">{p.converted ? t.tagPractice : t.tagList}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {founding && (
            <section className={card}>
              <h2 className="text-xl font-semibold">{t.standingHeading}</h2>
              <p className="mt-2 font-medium text-ink-strong">{t.standing}</p>
              <p className="mt-1 max-w-prose text-sm text-slate">{t.standingNote}</p>
            </section>
          )}
        </>
      )}

      <p>
        <Link
          href="/practitioner/settings"
          className="text-sm font-medium text-wine underline-offset-4 hover:underline"
        >
          {t.back}
        </Link>
      </p>
    </div>
  );
}
