import { prisma } from "@/lib/prisma";
import { normalizeReferralCode, firstNameOf } from "@/lib/referral-config";

// C23-REFERRAL §1 — attribution, DERIVED. There is no attribution model and no
// attribution ledger: `PractitionerProspect.referredByCode` is the immutable
// first-touch record, and `status`/`tenantId` say whether that prospect became
// a practice. Two sources of truth for the same fact is how you get a referral
// dispute you cannot settle, so counts are computed from those columns every
// time (the §1 index makes the lookup cheap).
//
// `PractitionerProspect` is platform-level (outside SCOPED_MODEL_SET, C23-SIGNUP
// ruling), so the SCOPED client passes these calls through unchanged — no
// guard-prisma allowlist entry is needed, and none is taken. Every caller is
// responsible for its own gate: the public surface may only ask whether a code
// resolves (a boolean — never an identity), the practitioner surface may only
// ask about the code its own signed-in session owns, and the admin surface is
// behind PLATFORM_ADMIN_EMAILS.
//
// PRIVACY, structural rather than remembered: nothing in this module returns a
// referrer's name, email or practice to a visitor, and nothing returns more
// than a first name to a referrer.

/** The owner of a code, identified only. Deliberately carries NO name, email or
 *  practice: a visitor arriving on someone's code was invited by "a founding
 *  partner", not by a named individual who never consented to being named. */
export type CodeOwner = { id: string; referralCode: string; status: string };

export async function resolveReferralCode(raw: string | null | undefined): Promise<CodeOwner | null> {
  const code = normalizeReferralCode(raw);
  if (!code) return null; // malformed → resolves to nobody, never an error
  const row = await prisma.practitionerProspect.findFirst({
    where: { referralCode: code },
    select: { id: true, referralCode: true, status: true },
  });
  return row ?? null;
}

/** All the public surface is allowed to know (§2). */
export async function referralCodeResolves(raw: string | null | undefined): Promise<boolean> {
  return (await resolveReferralCode(raw)) !== null;
}

export type ReferralCounts = { total: number; leads: number; signedUp: number; declined: number };

/** How many prospects arrived on this code, split by what became of them.
 *  Case-insensitive on the stored code so a lowercase typo still counts. */
export async function referralCounts(raw: string | null | undefined): Promise<ReferralCounts> {
  const code = normalizeReferralCode(raw);
  const empty: ReferralCounts = { total: 0, leads: 0, signedUp: 0, declined: 0 };
  if (!code) return empty;
  const rows = await prisma.practitionerProspect.groupBy({
    by: ["status"],
    where: { referredByCode: { equals: code, mode: "insensitive" } },
    _count: { _all: true },
  });
  const out = { ...empty };
  for (const r of rows) {
    const n = r._count._all;
    out.total += n;
    if (r.status === "SIGNED_UP") out.signedUp += n;
    else if (r.status === "DECLINED") out.declined += n;
    else out.leads += n;
  }
  return out;
}

/** The referrer's own view of who came in behind them: FIRST NAME ONLY (§3) —
 *  enough to recognise someone they invited, not a contact list they can
 *  export. No email, no surname, no practice name leaves this function. */
export type ReferredPerson = { firstName: string; converted: boolean; at: Date };

export async function listReferred(raw: string | null | undefined): Promise<ReferredPerson[]> {
  const code = normalizeReferralCode(raw);
  if (!code) return [];
  const rows = await prisma.practitionerProspect.findMany({
    where: { referredByCode: { equals: code, mode: "insensitive" } },
    // Only the three columns the view is allowed to use.
    select: { name: true, status: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return rows.map((r) => ({
    firstName: firstNameOf(r.name),
    converted: r.status === "SIGNED_UP",
    at: r.createdAt,
  }));
}

/** The signed-in practitioner's OWN prospect row — the only way the referrals
 *  page finds a code. Keyed on the session's tenant and the session's email, so
 *  there is no parameter a practitioner could change to see someone else's
 *  data. Returns null for a practitioner who was never a prospect (Valentina,
 *  the demo tenants): no row is invented and no code is issued on a GET. */
export async function ownProspect(params: {
  tenantId: string;
  email: string;
}): Promise<{ id: string; referralCode: string; referredByCode: string | null; status: string } | null> {
  const select = { id: true, referralCode: true, referredByCode: true, status: true } as const;
  const byTenant = await prisma.practitionerProspect.findFirst({
    where: { tenantId: params.tenantId },
    select,
    orderBy: { createdAt: "asc" },
  });
  if (byTenant) return byTenant;
  const email = params.email.trim().toLowerCase();
  if (!email) return null;
  return await prisma.practitionerProspect.findUnique({ where: { email }, select });
}

/** §4 — the admin's top-referrers view: which founding partner is actually
 *  carrying the network. Admin-only by its caller's gate; this is the one place
 *  a code is paired with its owner's name, and it is Jacob's own screen. */
export type TopReferrer = {
  code: string;
  ownerName: string | null;
  ownerEmail: string | null;
  referred: number;
  conversions: number;
};

export async function topReferrers(limit = 50): Promise<TopReferrer[]> {
  const grouped = await prisma.practitionerProspect.groupBy({
    by: ["referredByCode"],
    where: { referredByCode: { not: null } },
    _count: { _all: true },
  });
  const codes = grouped
    .map((g) => g.referredByCode)
    .filter((c): c is string => Boolean(c && c.trim()));
  if (codes.length === 0) return [];

  const upper = [...new Set(codes.map((c) => c.trim().toUpperCase()))];
  const [owners, converted] = await Promise.all([
    prisma.practitionerProspect.findMany({
      where: { referralCode: { in: upper } },
      select: { referralCode: true, name: true, email: true },
    }),
    prisma.practitionerProspect.groupBy({
      by: ["referredByCode"],
      where: { referredByCode: { not: null }, status: "SIGNED_UP" },
      _count: { _all: true },
    }),
  ]);
  const ownerOf = new Map(owners.map((o) => [o.referralCode.toUpperCase(), o]));

  // Fold case variants of the same code together — the code IS the identity.
  const referredBy = new Map<string, number>();
  for (const g of grouped) {
    const key = (g.referredByCode ?? "").trim().toUpperCase();
    if (!key) continue;
    referredBy.set(key, (referredBy.get(key) ?? 0) + g._count._all);
  }
  const conversionsBy = new Map<string, number>();
  for (const g of converted) {
    const key = (g.referredByCode ?? "").trim().toUpperCase();
    if (!key) continue;
    conversionsBy.set(key, (conversionsBy.get(key) ?? 0) + g._count._all);
  }

  return [...referredBy.entries()]
    .map(([code, referred]) => ({
      code,
      ownerName: ownerOf.get(code)?.name ?? null,
      ownerEmail: ownerOf.get(code)?.email ?? null,
      referred,
      conversions: conversionsBy.get(code) ?? 0,
    }))
    .sort((a, b) => b.conversions - a.conversions || b.referred - a.referred || a.code.localeCompare(b.code))
    .slice(0, limit);
}
