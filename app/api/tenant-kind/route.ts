// C29-EVENT-CHROME — the middleware's one question: what KIND of host is this?
// Middleware cannot reach the database, so it asks this route (same process,
// one internal hop, cached middleware-side). Returns the C26 resolution KIND
// and whether the tenant is the default — nothing else: no ids, no branding,
// no data a stranger could not already infer from the page itself.
import { NextResponse } from "next/server";
import { getTenantResolution } from "@/lib/tenancy";
import { DEFAULT_TENANT_ID } from "@/lib/tenancy/scope";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  const r = await getTenantResolution();
  return NextResponse.json(
    {
      kind: r.kind,
      isDefault: r.kind === "unresolved" ? false : r.tenant.id === DEFAULT_TENANT_ID,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
