import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  // Trust the deployment host (Railway terminates TLS at a proxy). Without this,
  // Auth.js v5 rejects requests with "UntrustedHost: Host must be trusted".
  trustHost: true,
  pages: { signIn: "/login" },
  callbacks: {
    // Coarse route gate for edge middleware: require a session on the private
    // areas. The real role check lives server-side in each protected layout
    // (see lib/auth-guards.ts) — middleware is a convenience, not the boundary.
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const path = nextUrl.pathname;
      const isProtected = path.startsWith("/practitioner") || path.startsWith("/app");
      if (isProtected) return isLoggedIn; // -> redirect to /login when signed out
      return true;
    },
    jwt({ token, user }) {
      if (user) {
        (token as any).role = (user as any).role;
        (token as any).id = (user as any).id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as any).role = (token as any).role;
        (session.user as any).id = (token as any).id ?? token.sub;
      }
      return session;
    },
  },
  providers: [], // real providers live in auth.ts (Node runtime)
} satisfies NextAuthConfig;
