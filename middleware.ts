import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

// Explicit middleware: we control the response ourselves instead of relying on
// the `authorized` callback's implicit auto-redirect (which was redirecting
// public routes on Railway's runtime). Only the two private areas require a
// session here; the real role checks live in the server-side layouts.
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isProtected = pathname.startsWith("/practitioner") || pathname.startsWith("/app");

  if (isProtected && !req.auth?.user) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }

  const res = NextResponse.next();
  res.headers.set("x-mw", isProtected ? "protected" : "public");
  return res;
});

export const config = {
  // Run on everything except API routes and static assets, but the handler
  // above only redirects the protected areas.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
