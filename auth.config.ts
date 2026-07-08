import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  // Trust the deployment host (Railway terminates TLS at a proxy). Without this,
  // Auth.js v5 rejects requests with "UntrustedHost: Host must be trusted".
  trustHost: true,
  pages: { signIn: "/login" },
  callbacks: {
    // Route protection for middleware (edge runtime).
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnDashboard = nextUrl.pathname.startsWith("/dashboard");
      if (isOnDashboard) return isLoggedIn; // redirect to /login if not
      return true;
    },
    jwt({ token, user }) {
      if (user) (token as any).role = (user as any).role;
      return token;
    },
    session({ session, token }) {
      if (session.user) (session.user as any).role = (token as any).role;
      return session;
    },
  },
  providers: [], // real providers live in auth.ts (Node runtime)
} satisfies NextAuthConfig;
