import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Credentials from "next-auth/providers/credentials";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { z } from "zod";
import { db } from "@/lib/db";
import { authConfig, devLoginEnabled, entraConfigured } from "@/lib/auth/config";

const providers: Provider[] = [];

if (entraConfigured) {
  providers.push(
    MicrosoftEntraID({
      // Our own single tenant issues the email, so linking to the pre-created user by
      // email is safe. Users must exist (created by an administrator) to sign in.
      allowDangerousEmailAccountLinking: true,
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
      // SSO: only users an administrator has already created (and left active) may sign in.
      if (!user.email) return false;
      const existing = await db.user.findUnique({ where: { email: user.email.toLowerCase() } });
      return Boolean(existing?.active);
    },
  },
});
