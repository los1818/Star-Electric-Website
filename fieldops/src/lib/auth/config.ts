import type { NextAuthConfig } from "next-auth";
import { isRole } from "./permissions";

/** Dev-only email login: never available in production builds. */
export const devLoginEnabled = process.env.NODE_ENV !== "production" && process.env.AUTH_DEV_LOGIN === "true";

export const entraConfigured = Boolean(process.env.AUTH_MICROSOFT_ENTRA_ID_ID && process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET);

/** Email domains allowed to sign in with SSO (comma-separated env var). */
export function allowedEmailDomains(value = process.env.AUTH_ALLOWED_EMAIL_DOMAINS ?? "starelectric.ca"): string[] {
  return value
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

export function isAllowedEmail(email: string | null | undefined, domains: string[]): boolean {
  if (!email) return false;
  const at = email.lastIndexOf("@");
  if (at < 1) return false;
  return domains.includes(email.slice(at + 1).toLowerCase());
}

/**
 * Edge-safe part of the Auth.js config, shared by middleware and the full config in
 * ../../auth.ts. No database access here.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (pathname.startsWith("/login") || pathname.startsWith("/api/auth")) return true;
      return Boolean(auth?.user);
    },
    jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid as string;
        session.user.role = isRole(token.role) ? token.role : "PENDING";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
