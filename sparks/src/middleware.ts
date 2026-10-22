import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth/config";

// Coarse gate: every page except /login and /api/auth needs a session. Fine-grained role
// checks happen server-side in pages (requirePageAccess) and actions (requirePermission).
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  // Skip Next internals and public image files (e.g. the logo on the login page).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)"],
};
