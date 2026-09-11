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

export default auth((req) => {
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
  // Expose the path to server components (the client space uses it to enforce
  // the one-time consent re-ask without re-asking on the consent page itself).
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers: requestHeaders } });
});

export const config = {
  matcher: ["/", "/practitioner/:path*", "/space/:path*"],
};
