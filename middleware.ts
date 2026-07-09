import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// EXPERIMENT: plain middleware with NO NextAuth involvement. Route protection
// for /practitioner and /app is enforced by the server-side layout guards
// (lib/auth-guards.ts), so security holds. This isolates whether the NextAuth
// middleware wrapper was injecting the redirect on public routes.
export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  res.headers.set("x-mw2", "plain");
  res.headers.set("x-mw2-path", req.nextUrl.pathname);
  return res;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
