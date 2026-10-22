import Image from "next/image";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { db } from "@/lib/db";
import { devLoginEnabled, entraConfigured } from "@/lib/auth/config";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/server";

export const metadata = { title: "Sign in" };

async function devSignIn(formData: FormData) {
  "use server";
  try {
    await signIn("dev-login", { email: formData.get("email"), redirectTo: "/dashboard" });
  } catch (error) {
    if (error instanceof AuthError) redirect("/login?error=dev");
    throw error;
  }
}

async function entraSignIn() {
  "use server";
  await signIn("microsoft-entra-id", { redirectTo: "/dashboard" });
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { error } = await searchParams;

  const devUsers = devLoginEnabled
    ? await db.user.findMany({
        where: { active: true },
        orderBy: [{ role: "asc" }, { name: "asc" }],
        select: { email: true, name: true, role: true },
        take: 12,
      })
    : [];

  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-8 shadow-sm">
        <Image src="/logo.png" alt="Star Electric" width={1486} height={704} priority className="mx-auto h-auto w-56" />
        <h1 className="mt-2 text-center text-lg font-semibold">Sparks</h1>

        {error && (
          <p role="alert" className="mt-4 rounded bg-red-50 p-2 text-sm text-red-700">
            Sign-in failed. Your account may not exist or may be inactive.
          </p>
        )}

        {entraConfigured && (
          <form action={entraSignIn} className="mt-6">
            <button className="w-full rounded bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-black">
              Sign in with Microsoft
            </button>
          </form>
        )}

        {!entraConfigured && !devLoginEnabled && (
          <p className="mt-6 text-sm text-gray-600">No sign-in method is configured. Set the Entra ID variables in .env.</p>
        )}

        {devLoginEnabled && (
          <div className="mt-6 border-t border-dashed border-amber-400 pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Development login</p>
            <form action={devSignIn} className="mt-2 flex gap-2">
              <label htmlFor="email" className="sr-only">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                placeholder="you@starelectric.test"
                className="min-w-0 flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
              />
              <button className="rounded bg-brand px-3 py-1.5 text-sm font-medium text-ink hover:bg-brand-dark">Sign in</button>
            </form>
            {devUsers.length > 0 && (
              <ul className="mt-3 space-y-1">
                {devUsers.map((u) => (
                  <li key={u.email}>
                    <form action={devSignIn}>
                      <input type="hidden" name="email" value={u.email} />
                      <button className="w-full rounded px-2 py-1 text-left text-sm hover:bg-gray-100">
                        {u.name} <span className="text-gray-500">· {ROLE_LABELS[u.role]}</span>
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
