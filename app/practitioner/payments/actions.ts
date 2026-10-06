"use server";

import { redirect } from "next/navigation";
import { requirePractitioner } from "@/lib/auth-guards";
import { getTenant } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { createCheckoutLink } from "@/lib/payments/checkout";

// BILLING §3.5 Phase B2 — create a one-off Square-hosted checkout link for a
// client. Amounts handled as integer cents end-to-end (Rule: money is int).

export async function createPaymentLinkAction(formData: FormData) {
  await requirePractitioner();
  const tenant = await getTenant();

  const clientId = String(formData.get("clientId") ?? "");
  const purpose = String(formData.get("purpose") ?? "session");
  const description = String(formData.get("description") ?? "").trim();
  const amountRaw = String(formData.get("amount") ?? "").trim();

  // Dollars in the form → integer cents, rejecting anything lossy.
  const amountCents = Math.round(Number(amountRaw) * 100);
  if (!amountRaw || !Number.isFinite(amountCents) || amountCents <= 0 || amountCents > 5_000_00) {
    redirect("/practitioner/payments?error=amount");
  }
  const client = await prisma.user.findFirst({
    where: { id: clientId, role: "CLIENT" },
    select: { id: true },
  });
  if (!client) redirect("/practitioner/payments?error=client");
  if (!description) redirect("/practitioner/payments?error=description");

  const { getBaseUrlSafe } = await import("@/lib/base-url");
  const result = await createCheckoutLink({
    tenantId: tenant.id,
    clientId,
    purpose: ["session", "package", "other"].includes(purpose) ? purpose : "other",
    amountCents,
    description,
    redirectUrl: `${getBaseUrlSafe()}/space?paid=1`,
  }).catch(() => null);

  if (!result) redirect("/practitioner/payments?error=provider");
  if (!result.ok) redirect(`/practitioner/payments?error=${result.reason}`);
  redirect(`/practitioner/payments?created=${result.paymentId}`);
}
