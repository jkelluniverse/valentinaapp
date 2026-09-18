import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";
import { roleHome } from "@/lib/roles";
import { isPlatformHost } from "@/lib/platform-host";

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
  // C32 §1 / ruling 77 — every branch of this decision LOGS. The rehearsal walk
  // found the redirect never firing in production while /api/tenant-kind on the
  // same host answered {kind:"tenant",isDefault:false}: the silent catch below
  // had turned an unobserved failure into a cached pass-through. Root requests
  // are rare and cached 60s, so this logging is bounded.
  //
  // C32 §2 — the self-fetch goes to LOOPBACK, never req.nextUrl.origin. In
  // production origin resolves to the public domain, so the "self"-fetch left
  // the box and re-entered through Railway's edge, which overwrites the
  // hand-set x-forwarded-host with the wire host — tenant-kind then truthfully
  // answered about the DEFAULT host and the redirect could not fire (observed
  // live, C32 §1 log). Loopback stays in-process: the header below survives,
  // which is the exact configuration every localhost gate proves. PORT is set
  // by Railway in production and by each gate's spawned env; 3000 is next
  // start's own default when PORT is absent.
  const target = new URL("/api/tenant-kind", `http://127.0.0.1:${process.env.PORT || "3000"}`);
  try {
    const res = await fetch(target, {
      headers: { "x-forwarded-host": host },
    });
    if (!res.ok) {
      console.error(`[middleware] tenant-kind NOT OK for host=${clean} target=${target.origin} status=${res.status} — passing through`);
      return false;
    }
    const { kind, isDefault } = (await res.json()) as { kind: string; isDefault: boolean };
    const redirect = kind === "tenant" && !isDefault;
    console.log(`[middleware] tenant-kind host=${clean} target=${target.origin} kind=${kind} isDefault=${isDefault} redirect=${redirect}`);
    kindCache.set(clean, { at: Date.now(), redirect });
    return redirect;
  } catch (err) {
    console.error(
      `[middleware] tenant-kind FETCH FAILED for host=${clean} target=${target.origin}: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)} — passing through (C26: never guess)`,
    );
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
  // P2.2 — the PLATFORM host's root serves the platform's own page, never a
  // practice's marketing. Tenant hosts never reach this branch, so the static
  // root and its 16-screen baseline are untouched.
  //
  // A REDIRECT, and the first attempt's failure is why. It shipped as a rewrite
  // to `new URL("/platform", req.nextUrl)` and 404'd in production: C32's
  // finding applies here too — req.nextUrl.origin is the DEFAULT TENANT'S
  // domain whoever is visiting, so the target became
  // https://valentinavelez.com/platform, where this route's own host guard
  // correctly refuses. The deployed server printed the evidence in its own
  // response header: `x-middleware-rewrite: https://valentinavelez.com/platform`.
  // Rebuilding the target from publicOrigin() fixes the address but NOT the
  // mechanism: a rewrite whose origin differs from nextUrl's is PROXIED, so the
  // app would fetch its own public URL through Railway's edge — the exact
  // self-fetch pattern C32 removed from this file. A redirect has no such hop
  // and uses the same publicOrigin() builder the /book redirect below has been
  // proving in production since C29. The cost is an honest one: the visitor's
  // address bar reads /platform.
  if (pathname === "/" && isPlatformHost(req.headers.get("x-forwarded-host") || req.nextUrl.host)) {
    return NextResponse.redirect(new URL("/platform", publicOrigin(req)));
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
