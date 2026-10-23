import Link from "next/link";
import { db } from "@/lib/db";
import { requirePageAccess } from "@/lib/auth/server";
import { UserAccessEditor } from "./user-access-editor";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  const me = await requirePageAccess("users:manage");
  const [users, employees] = await Promise.all([
    db.user.findMany({
      orderBy: [{ role: "asc" }, { name: "asc" }],
      select: { id: true, name: true, email: true, role: true, active: true, employeeId: true },
    }),
    db.employee.findMany({
      where: { active: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, employeeNumber: true },
    }),
  ]);
  const pending = users.filter((u) => u.role === "PENDING").length;

  return (
    <div className="max-w-5xl">
      <Link href="/settings" className="text-sm text-gray-500 hover:underline">← Settings</Link>
      <h1 className="mt-1 text-2xl font-extrabold tracking-tight">Users</h1>
      <div className="mt-2 h-1 w-12 rounded-full bg-brand" aria-hidden />
      <p className="mt-1 text-sm text-gray-600">
        Anyone with a company Microsoft account can sign in; they appear here as <em>Awaiting access</em> until you assign a
        role. Link technicians to their employee record so they see their assigned work orders.
      </p>
      {pending > 0 && (
        <p className="mt-3 rounded-md bg-amber-50 p-2 text-sm text-amber-800">
          {pending} user{pending === 1 ? "" : "s"} waiting for access.
        </p>
      )}
      <UserAccessEditor
        currentUserId={me.id}
        users={users}
        employees={employees.map((e) => ({ id: e.id, label: `${e.lastName}, ${e.firstName} (${e.employeeNumber})` }))}
      />
    </div>
  );
}
