import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/server";
import { signOutAction } from "@/server/actions/sign-out";

export const metadata = { title: "Awaiting access" };

export default async function PendingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "PENDING") redirect("/dashboard");

  return (
    <main className="flex min-h-full items-center justify-center p-6">
      <div className="max-w-md rounded-lg border border-gray-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold">Your account is waiting for access</h1>
        <p className="mt-2 text-sm text-gray-600">
          You&apos;re signed in as <strong>{user.email}</strong>. An administrator needs to assign your role before you can
          use Sparks.
        </p>
        <form action={signOutAction} className="mt-6">
          <button className="rounded bg-ink px-4 py-2 text-sm font-medium text-white">Sign out</button>
        </form>
      </div>
    </main>
  );
}
