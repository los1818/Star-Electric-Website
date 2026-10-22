import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { z } from "zod";
import { db } from "@/lib/db";
import { allowedEmailDomains, authConfig, devLoginEnabled, entraConfigured, isAllowedEmail } from "@/lib/auth/config";

const providers: Provider[] = [];

if (entraConfigured) {
  providers.push(
    MicrosoftEntraID({
      // Our own single tenant issues the email, so linking to a user an administrator
      // already created with that email is safe.
      allowDangerousEmailAccountLinking: true,
      // Entra often omits the optional `email` claim; fall back to the sign-in name. Skip the
      // default profile-photo fetch, which would store a base64 image in the database.
      profile(profile) {
        const email = (profile.email ?? profile.preferred_username ?? "").toLowerCase();
        return { id: profile.sub, name: profile.name, email, image: null };
      },
    }),
  );
}

if (devLoginEnabled) {
  providers.push(
    Credentials({
      id: "dev-login",
      name: "Dev email login",
      credentials: { email: { label: "Email", type: "email" } },
      async authorize(credentials) {
        const parsed = z.object({ email: z.string().email() }).safeParse(credentials);
        if (!parsed.success) return null;
        const user = await db.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
        if (!user || !user.active) return null;
        return user;
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),
  providers,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account }) {
      if (account?.provider === "dev-login") return true;
      // SSO: company email domains only. First-time users are created with the PENDING role
      // (no access) until an administrator assigns one. Deactivated users are refused.
      const email = user.email?.toLowerCase();
      if (!isAllowedEmail(email, allowedEmailDomains())) return false;
      const existing = await db.user.findUnique({ where: { email } });
      return existing ? existing.active : true;
    },
  },
});
