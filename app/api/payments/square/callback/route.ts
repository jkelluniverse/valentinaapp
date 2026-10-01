import { NextResponse, type NextRequest } from "next/server";
import { requirePractitioner } from "@/lib/auth-guards";
import { getTenant } from "@/lib/tenancy";
import { getBaseUrl } from "@/lib/base-url";
import { prisma } from "@/lib/prisma";
import { encryptToken, verifyState } from "@/lib/payments/crypto";
import { exchangeCode, fetchMerchantName } from "@/lib/payments/square";

// CLAUDE-BILLING §3.2 — the OAuth callback: verify the signed state against
// THIS tenant (CSRF), exchange the code, encrypt tokens at rest, store the
// connection. Token material never reaches logs or the browser.

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  await requirePractitioner();
  const tenant = await getTenant();
  const back = (flag: string) =>
    NextResponse.redirect(`${getBaseUrl()}/practitioner/settings/payments?pay=${flag}`);

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  if (!code || !state) return back("denied");
  const parsed = verifyState(state);
  if (!parsed || parsed.tenantId !== tenant.id) return back("badstate");

  try {
    const t = await exchangeCode(code, `${getBaseUrl()}/api/payments/square/callback`);
    const merchantName = await fetchMerchantName(t.merchantId, t.accessToken);
    const existing = await prisma.connectedPaymentAccount.findFirst({ where: { tenantId: tenant.id } });
    const data = {
      provider: "square",
      merchantId: t.merchantId,
      merchantName,
      accessTokenEnc: encryptToken(t.accessToken),
      refreshTokenEnc: t.refreshToken ? encryptToken(t.refreshToken) : null,
      scopes: (process.env.SQUARE_OAUTH_SCOPES ?? "MERCHANT_PROFILE_READ PAYMENTS_READ PAYMENTS_WRITE").split(/[\s,+]+/).filter(Boolean),
      status: "CONNECTED" as const,
      connectedAt: new Date(),
      lastVerifiedAt: new Date(),
      expiresAt: t.expiresAt,
    };
    if (existing) {
      await prisma.connectedPaymentAccount.update({ where: { id: existing.id }, data });
    } else {
      await prisma.connectedPaymentAccount.create({ data: { ...data, tenantId: tenant.id } });
    }
    return back("connected");
  } catch (e) {
    console.error(`[payments] connect failed tenant=${tenant.id}: ${e instanceof Error ? e.message : "error"}`);
    return back("failed");
  }
}
