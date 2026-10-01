// Raw client on purpose: token health is a PLATFORM job — it walks every
// tenant's connected account regardless of which host the tick ran on.
import { rawPrisma } from "@/lib/prisma-internal";
import { encryptToken, decryptToken } from "./crypto";
import { refreshAccess, squareConfigured } from "./square";

// CLAUDE-BILLING §3.3 — the unglamorous 30%. Proactive refresh: any
// CONNECTED square account whose access token expires within 7 days (or
// was never verified in the last 24h) gets refreshed; a refresh failure
// flips it to NEEDS_RECONNECT — the UI and (B2) checkout read that state,
// nothing crashes. Runs from the daily tick.

const REFRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const VERIFY_EVERY_MS = 24 * 60 * 60 * 1000;

export async function refreshDueTokens(now = new Date()): Promise<{ refreshed: number; flagged: number }> {
  if (!squareConfigured()) return { refreshed: 0, flagged: 0 };
  const due = await rawPrisma.connectedPaymentAccount.findMany({
    where: {
      provider: "square",
      status: "CONNECTED",
      OR: [
        { expiresAt: { lt: new Date(now.getTime() + REFRESH_WINDOW_MS) } },
        { lastVerifiedAt: null },
        { lastVerifiedAt: { lt: new Date(now.getTime() - VERIFY_EVERY_MS) } },
      ],
    },
  });
  let refreshed = 0;
  let flagged = 0;
  for (const acct of due) {
    try {
      if (!acct.refreshTokenEnc) throw new Error("no refresh token on file");
      const t = await refreshAccess(decryptToken(acct.refreshTokenEnc));
      await rawPrisma.connectedPaymentAccount.update({
        where: { id: acct.id },
        data: {
          accessTokenEnc: encryptToken(t.accessToken),
          refreshTokenEnc: t.refreshToken ? encryptToken(t.refreshToken) : acct.refreshTokenEnc,
          expiresAt: t.expiresAt,
          lastVerifiedAt: now,
          status: "CONNECTED",
        },
      });
      refreshed++;
    } catch (e) {
      // Metadata only — never token material — in logs.
      console.error(`[payments] refresh failed tenant=${acct.tenantId}: ${e instanceof Error ? e.message : "error"}`);
      await rawPrisma.connectedPaymentAccount.update({
        where: { id: acct.id },
        data: { status: "NEEDS_RECONNECT", lastVerifiedAt: now },
      });
      flagged++;
    }
  }
  return { refreshed, flagged };
}
