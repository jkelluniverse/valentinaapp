import { prisma } from "@/lib/prisma";
import { createCustomer, createSubscription, priceIdFor, stripeConfigured } from "./stripe";

// BILLING §4.2 — the provisioning billing step (extends Platform §7).
// FOUNDING_COMP and DEMO tenants get NO Stripe objects, ever — a pinned
// ACTIVE row and nothing else. Paid plans create Customer + Subscription.
// Idempotent: a tenant that already has billing keeps it.

export type ProvisionResult =
  | { ok: true; comped: boolean }
  | { ok: false; error: "exists" | "unconfigured" | "unknown-plan" | "provider" };

export async function provisionTenantBilling(args: {
  tenantId: string;
  plan: string; // "CARE_99" | "CARE_125" | "CARE_149" | "FOUNDING_COMP"
  ownerName: string;
  ownerEmail: string;
  demo?: boolean;
}): Promise<ProvisionResult> {
  const existing = await prisma.tenantBilling.findFirst({ where: { tenantId: args.tenantId } });
  if (existing) return { ok: false, error: "exists" };

  if (args.plan === "FOUNDING_COMP" || args.demo) {
    await prisma.tenantBilling.create({
      data: { tenantId: args.tenantId, plan: "FOUNDING_COMP", status: "ACTIVE" },
    });
    return { ok: true, comped: true };
  }

  if (!stripeConfigured()) return { ok: false, error: "unconfigured" };
  const priceId = priceIdFor(args.plan);
  if (!priceId) return { ok: false, error: "unknown-plan" };

  try {
    const customerId = await createCustomer({
      tenantId: args.tenantId,
      name: args.ownerName,
      email: args.ownerEmail,
    });
    const sub = await createSubscription(customerId, priceId);
    await prisma.tenantBilling.create({
      data: {
        tenantId: args.tenantId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: sub.id,
        plan: args.plan,
        status: "ACTIVE",
        currentPeriodEnd: sub.currentPeriodEnd,
      },
    });
    return { ok: true, comped: false };
  } catch {
    return { ok: false, error: "provider" };
  }
}
