import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { roleHome } from "@/lib/roles";

const { auth } = NextAuth(authConfig);

// Coarse "are you signed in" gate for the two private areas. The authoritative
// role/active checks live server-side in each protected layout (auth-guards.ts).
// The public marketing home (`/`) stays static for strangers; a signed-in
// visitor who lands there is bounced to their portal so they never see the ad.
// The origin the VISITOR sees. Behind the proxy chain (Cloudflare → Railway)
// the Host header the app receives can be the internal railway.app domain;
// building absolute redirects from it strands users off the custom domain.
// x-forwarded-host carries the real public host — always prefer it.
function publicOrigin(req: { headers: Headers; nextUrl: URL }): string {
  const host = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.nextUrl.host;
  const proto =
    req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    req.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}

// C29-EVENT-CHROME — a NON-DEFAULT practice's public root goes to that
// practice's own booking page (which is tenant-correct, C26-proven), instead
// of serving Valentina's static marketing one-pager on their domain. Redirect,
// not design: what a practice's public site should SAY belongs to the
// brand-web track. Trivially revertible (this block + the helper below).
//
// The decision needs the DB (a real tenant subdomain redirects; an unknown
// slug keeps today's default-home behavior), which middleware cannot reach —
// so it asks /api/tenant-kind in-process, cached 60s per host. Cheap by
// construction: the default slug (all of Valentina's hosts) short-circuits
// with no lookup, and any failure PASSES THROUGH — the static home under C26's
// unresolved serves identical bytes anyway, and never another identity.
const KIND_TTL_MS = 60_000;
const kindCache = new Map<string, { at: number; redirect: boolean }>();
async function nonDefaultTenantRoot(req: { headers: Headers; nextUrl: URL }): Promise<boolean> {
  const host = (req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || req.nextUrl.host).toLowerCase();
  const platformDomain = process.env.PLATFORM_DOMAIN;
  const clean = host.split(":")[0];
  if (!platformDomain || clean === platformDomain || !clean.endsWith(`.${platformDomain}`)) return false;
  const sub = clean.slice(0, -(platformDomain.length + 1));
  if (!sub || sub.includes(".") || sub === "valentina") return false; // "valentina" = DEFAULT_TENANT_SLUG, duplicated because lib/tenancy imports the raw prisma client and cannot load in middleware; zero cost for her hosts
  const hit = kindCache.get(clean);
  if (hit && Date.now() - hit.at < KIND_TTL_MS) return hit.redirect;
  try {
    const res = await fetch(new URL("/api/tenant-kind", req.nextUrl.origin), {
      headers: { "x-forwarded-host": host },
    });
    if (!res.ok) return false;
    const { kind, isDefault } = (await res.json()) as { kind: string; isDefault: boolean };
    const redirect = kind === "tenant" && !isDefault;
    kindCache.set(clean, { at: Date.now(), redirect });
    return redirect;
  } catch {
    return false; // resolution unavailable: pass through, never guess
  }
}

export default auth(async (req) => {
  const { pathname } = req.nextUrl;
  const isProtected = pathname.startsWith("/practitioner") || pathname.startsWith("/space");

  if (isProtected && !req.auth?.user) {
    return NextResponse.redirect(new URL("/login", publicOrigin(req)));
  }
  if (pathname === "/" && req.auth?.user) {
    return NextResponse.redirect(
      new URL(roleHome((req.auth.user as { role?: string }).role), publicOrigin(req)),
    );
  }
  if (pathname === "/" && (await nonDefaultTenantRoot(req))) {
    return NextResponse.redirect(new URL("/book", publicOrigin(req)));
  }
  // Expose the path to server components (the client space uses it to enforce
  // the one-time consent re-ask without re-asking on the consent page itself).
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
});

export const config = {
  matcher: ["/", "/practitioner/:path*", "/space/:path*"],
};
