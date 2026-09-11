import { NextResponse } from "next/server";
import { checkSlug } from "@/lib/signup";

// C23-SIGNUP §3 — live availability feedback for the portal-address field.
// Returns ONE word about a slug and nothing else: no counts, no tenant names,
// no client data. Advisory only — the server action re-decides availability at
// submit time, so a race here cannot create a duplicate.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("slug") ?? "";
  if (!slug || slug.length > 40) return NextResponse.json({ verdict: "invalid" });
  return NextResponse.json({ verdict: await checkSlug(slug) });
}
