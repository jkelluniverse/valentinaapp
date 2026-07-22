import { NextResponse } from "next/server";
import { requirePractitioner } from "@/lib/auth-guards";
import { getTenant } from "@/lib/tenancy";
import { getBaseUrl } from "@/lib/base-url";
import { signState } from "@/lib/payments/crypto";
import { authorizeUrl, squareConfigured } from "@/lib/payments/square";

// CLAUDE-BILLING §3.2 — "Connect Square", step 1: redirect to Square's
// authorize page with a signed state bound to this tenant. Practitioners
// never see an API key (Rule 0.3): OAuth is the only connection path.

export const dynamic = "force-dynamic";

export async function GET() {
  await requirePractitioner(); // redirects if not signed in as practitioner
  const tenant = await getTenant();
  if (!squareConfigured()) {
    return NextResponse.redirect(`${getBaseUrl()}/practitioner/settings/payments?pay=unconfigured`);
  }
  return NextResponse.redirect(authorizeUrl(signState(tenant.id)));
}
