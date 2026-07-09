import type { NextAuthConfig } from "next-auth";

export const authConfig = {
  // Trust the deployment host (Railway terminates TLS at a proxy). Without this,
  // Auth.js v5 rejects requests with "UntrustedHost: Host must be trusted".
  trustHost: true,
  pages: { signIn: "/login" },
  callbacks: {
    // Route protection is handled explicitly in middleware.ts and in the
    // server-side layout guards (lib/auth-guards.ts). No `authorized` callback
    // here, to avoid its implicit auto-redirect firing on public routes.
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
