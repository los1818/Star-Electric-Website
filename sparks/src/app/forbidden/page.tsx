import Link from "next/link";

export const metadata = { title: "Not allowed" };

export default function ForbiddenPage() {
  return (
    <main className="flex min-h-full items-center justify-center bg-ink p-6">
      <div className="max-w-md rounded-md border-t-4 border-brand bg-white p-8 text-center shadow-card">
        <h1 className="text-xl font-extrabold">You don&apos;t have access to that page</h1>
        <p className="mt-2 text-sm text-gray-600">Ask an administrator if you think you should.</p>
        <Link href="/dashboard" className="mt-6 inline-block rounded-md bg-ink px-4 py-2 text-sm font-medium text-white">
          Back to dashboard
        </Link>
      </div>
    </main>
  );
}
