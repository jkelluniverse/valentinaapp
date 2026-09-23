import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth-guards";
import { isPlatformAdmin } from "@/lib/platform-admin";
import { listProspects, normalizeFilter, prospectsCsv } from "@/lib/prospects";

// C23-CAPTURE §3 — the follow-up list has to leave the building. CSV of the
// CURRENT filter (same query layer as the page, so the two cannot disagree).
//
// Same gate as the page: the PLATFORM_ADMIN_EMAILS allowlist, and a 404 — not
// a 403 — for everyone else, so the endpoint does not confirm its own
// existence to a signed-in stranger.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getSessionUser();
  if (!user || user.role !== "PRACTITIONER" || !isPlatformAdmin(user.email)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const sp = req.nextUrl.searchParams;
  const filter = normalizeFilter({
    status: sp.get("status") ?? undefined,
    source: sp.get("source") ?? undefined,
    q: sp.get("q") ?? undefined,
  });

  const rows = await listProspects(filter);
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(prospectsCsv(rows), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="prospects-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
