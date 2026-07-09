import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

// Coarse "are you signed in" gate for the two private areas. The authoritative
// role/active checks live server-side in each protected layout (auth-guards.ts).
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isProtected = pathname.startsWith("/practitioner") || pathname.startsWith("/space");

  if (isProtected && !req.auth?.user) {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/practitioner/:path*", "/space/:path*"],
};
