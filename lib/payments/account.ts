import { prisma } from "@/lib/prisma";
import { DEFAULT_TENANT_ID } from "@/lib/tenancy/scope";
import { decryptToken } from "./crypto";
import type { ConnectedAccountRef } from "./types";

// The tenant's payment connection, as the app reads it.
//
// Valentina zero-change representation (B1 acceptance): her Square
// arrangement predates OAuth — an access token in env, used by lib/square.ts
// exactly as before. Until/unless she opts into the Connect flow, her
// account is REPRESENTED as a virtual CONNECTED row derived from env; no
// DB row, no behavior change, her existing payment paths untouched.

export type AccountView = {
  source: "oauth" | "env-legacy";
  provider: string;
  merchantId: string;
  merchantName: string | null;
  status: "CONNECTED" | "NEEDS_RECONNECT" | "REVOKED";
  connectedAt: Date | null;
  scopes: string[];
};

export async function getAccountView(tenantId: string): Promise<AccountView | null> {
  const row = await prisma.connectedPaymentAccount.findFirst({ where: { tenantId } });
  if (row) {
    return {
      source: "oauth",
      provider: row.provider,
      merchantId: row.merchantId,
      merchantName: row.merchantName,
      status: row.status,
      connectedAt: row.connectedAt,
      scopes: row.scopes,
    };
  }
  const legacyToken =
    process.env.SQUARE_ENVIRONMENT === "production"
      ? process.env.SQUARE_ACCESS_TOKEN
      : process.env.SQUARE_SANDBOX_ACCESS_TOKEN || process.env.SQUARE_ACCESS_TOKEN;
  if (tenantId === DEFAULT_TENANT_ID && legacyToken) {
    return {
      source: "env-legacy",
      provider: "square",
      merchantId: process.env.SQUARE_LOCATION_ID ?? "existing setup",
      merchantName: null,
      status: "CONNECTED",
      connectedAt: null,
      scopes: [],
    };
  }
  return null;
}

// Decrypted reference for provider calls — OAuth rows only; the env-legacy
// path keeps using lib/square.ts directly (zero change).
export async function getAccountRef(tenantId: string): Promise<ConnectedAccountRef | null> {
  const row = await prisma.connectedPaymentAccount.findFirst({ where: { tenantId } });
  if (!row || row.status !== "CONNECTED") return null;
  return {
    tenantId,
    provider: row.provider,
    merchantId: row.merchantId,
    locationId: row.locationId,
    accessToken: decryptToken(row.accessTokenEnc),
  };
}
