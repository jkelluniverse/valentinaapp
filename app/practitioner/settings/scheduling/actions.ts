"use server";

import { revalidatePath } from "next/cache";
import { requirePractitioner } from "@/lib/auth-guards";
import { getTenant } from "@/lib/tenancy";
import { prisma } from "@/lib/prisma";
import { encryptToken, newIngressToken, acuityIngressUrl } from "@/lib/scheduling/external/connection";

// C37 §6 — connecting and disconnecting a booking tool. The scoped client is
// used throughout: unlike the webhook ingress, THIS runs inside a practitioner's
// own authenticated request, so the tenant is hers and scoping is correct.

export type ConnectState = { error?: string; ingressUrl?: string };

export async function connectCalendlyAction(_prev: ConnectState, form: FormData): Promise<ConnectState> {
  await requirePractitioner();
  const tenant = await getTenant();
  const signingKey = String(form.get("signingKey") ?? "").trim();
  const owner = String(form.get("owner") ?? "").trim();
  if (!signingKey || !owner) return { error: "Both the signing key and your Calendly user link are needed." };
  if (!/^https:\/\/api\.calendly\.com\/users\//.test(owner)) {
    return { error: "That does not look like a Calendly user URI. It starts with https://api.calendly.com/users/" };
  }

  await prisma.externalSchedulingConnection.upsert({
    where: { tenantId_provider: { tenantId: tenant.id, provider: "calendly" } },
    create: {
      tenantId: tenant.id, provider: "calendly", externalOwner: owner,
      credentialEnc: encryptToken(signingKey), signingKeyEnc: encryptToken(signingKey), status: "CONNECTED",
    },
    update: {
      externalOwner: owner, signingKeyEnc: encryptToken(signingKey),
      credentialEnc: encryptToken(signingKey), status: "CONNECTED", lastError: null,
    },
  });
  revalidatePath("/practitioner/settings/scheduling");
  return {};
}

export async function connectAcuityAction(_prev: ConnectState, form: FormData): Promise<ConnectState> {
  await requirePractitioner();
  const tenant = await getTenant();
  const apiKey = String(form.get("apiKey") ?? "").trim();
  if (!apiKey) return { error: "Your Acuity API key is needed to check that incoming bookings are genuine." };

  // RULING 196 — a fresh per-connection ingress token. Only its HASH is stored,
  // so the URL below is shown ONCE and cannot be recovered from the database
  // afterwards. Reconnecting issues a new one and retires the old.
  const token = newIngressToken();
  await prisma.externalSchedulingConnection.upsert({
    where: { tenantId_provider: { tenantId: tenant.id, provider: "acuity" } },
    create: {
      tenantId: tenant.id, provider: "acuity", credentialEnc: encryptToken(apiKey),
      ingressTokenHash: token.hash, status: "CONNECTED",
    },
    update: { credentialEnc: encryptToken(apiKey), ingressTokenHash: token.hash, status: "CONNECTED", lastError: null },
  });
  revalidatePath("/practitioner/settings/scheduling");
  // The raw token leaves this function exactly once, to be shown to her.
  return { ingressUrl: acuityIngressUrl(token.raw) };
}

export async function disconnectAction(form: FormData): Promise<void> {
  await requirePractitioner();
  const tenant = await getTenant();
  const provider = String(form.get("provider") ?? "");
  if (provider !== "calendly" && provider !== "acuity") return;
  // Deleting the row invalidates the ingress token with it: nothing left to
  // hash against, so a delivery on the old URL resolves to no connection.
  await prisma.externalSchedulingConnection.deleteMany({ where: { tenantId: tenant.id, provider } });
  revalidatePath("/practitioner/settings/scheduling");
}
