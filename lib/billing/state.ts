import { prisma } from "@/lib/prisma";

// BILLING §4.4 — the tenant's billing posture, as the app reads it.
// A missing row NEVER breaks a practice: it reads as FOUNDING_COMP pinned
// ACTIVE (Valentina and any not-yet-provisioned tenant). Billing failures
// degrade to banners and soft gates — reading, exporting, and client access
// are never touched (Rule 0.7).

export const PLAN_LABELS: Record<string, string> = {
  CARE_99: "Care · $99/mo",
  CARE_125: "Care · $125/mo",
  CARE_149: "Care · $149/mo",
  FOUNDING_COMP: "Founding partner",
};

export type BillingView = {
  plan: string;
  planLabel: string;
  status: "ACTIVE" | "PAST_DUE" | "SUSPENDED" | "CANCELED";
  comped: boolean; // no Stripe objects behind it
  stripeCustomerId: string | null;
  graceUntil: Date | null;
  currentPeriodEnd: Date | null;
};

export async function getBillingView(tenantId: string): Promise<BillingView> {
  const row = await prisma.tenantBilling.findFirst({ where: { tenantId } }).catch(() => null);
  if (!row) {
    return {
      plan: "FOUNDING_COMP",
      planLabel: PLAN_LABELS.FOUNDING_COMP,
      status: "ACTIVE",
      comped: true,
      stripeCustomerId: null,
      graceUntil: null,
      currentPeriodEnd: null,
    };
  }
  return {
    plan: row.plan,
    planLabel: PLAN_LABELS[row.plan] ?? row.plan,
    status: row.status,
    comped: !row.stripeCustomerId,
    stripeCustomerId: row.stripeCustomerId,
    graceUntil: row.graceUntil,
    currentPeriodEnd: row.currentPeriodEnd,
  };
}

// §4.4 SUSPENDED/CANCELED soft gate: NEW activity only — no new client
// invites, no new session processing. Everything else (read, export,
// client logins, existing flows) stays untouched.
export async function newActivityAllowed(tenantId: string): Promise<boolean> {
  const view = await getBillingView(tenantId);
  return view.status === "ACTIVE" || view.status === "PAST_DUE";
}

export const BILLING_PAUSED_MESSAGE =
  "New activity is paused while there's a billing issue on the practice — everything already here stays safe and readable. See Settings → Plan & billing.";
