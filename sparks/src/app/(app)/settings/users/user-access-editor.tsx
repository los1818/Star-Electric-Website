"use client";

import { useState, useTransition } from "react";
import { ROLES, ROLE_LABELS, type Role } from "@/lib/auth/permissions";
import { updateUserAccess } from "@/server/actions/users";

interface UserRow {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  active: boolean;
  employeeId: string | null;
}

export function UserAccessEditor({ users, employees, currentUserId }: { users: UserRow[]; employees: { id: string; label: string }[]; currentUserId: string }) {
  return (
    <table className="mt-6 w-full border-collapse rounded bg-white text-sm">
      <thead>
        <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-wide text-gray-500">
          <th className="p-2">User</th>
          <th className="p-2">Role</th>
          <th className="p-2">Employee</th>
          <th className="w-16 p-2">Active</th>
          <th className="w-40 p-2" />
        </tr>
      </thead>
      <tbody>
        {users.map((u) => (
          <UserRowForm key={u.id} user={u} employees={employees} isSelf={u.id === currentUserId} />
        ))}
      </tbody>
    </table>
  );
}

function UserRowForm({ user, employees, isSelf }: { user: UserRow; employees: { id: string; label: string }[]; isSelf: boolean }) {
  const [role, setRole] = useState<Role>(user.role);
  const [active, setActive] = useState(user.active);
  const [employeeId, setEmployeeId] = useState(user.employeeId ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const who = user.name ?? user.email;

  function save() {
    startTransition(async () => {
      const result = await updateUserAccess({ userId: user.id, role, active, employeeId: employeeId || null });
      setMessage(result.ok ? "Saved" : result.error);
    });
  }

  return (
    <tr className={`border-b border-gray-100 ${user.role === "PENDING" ? "bg-amber-50" : ""}`}>
      <td className="p-2">
        <div className="font-medium">{who}{isSelf && <span className="text-gray-500"> (you)</span>}</div>
        <div className="text-xs text-gray-500">{user.email}</div>
      </td>
      <td className="p-2">
        <select aria-label={`Role for ${who}`} value={role} onChange={(e) => setRole(e.target.value as Role)} className="rounded border border-gray-300 px-2 py-1">
          {ROLES.map((r) => (
            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
          ))}
        </select>
      </td>
      <td className="p-2">
        <select aria-label={`Employee for ${who}`} value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className="max-w-56 rounded border border-gray-300 px-2 py-1">
          <option value="">Not linked</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.label}</option>
          ))}
        </select>
      </td>
      <td className="p-2">
        <input aria-label={`Active for ${who}`} type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
      </td>
      <td className="p-2">
        <button onClick={save} disabled={pending} className="rounded bg-ink px-3 py-1 text-xs font-medium text-white disabled:opacity-50">
          {pending ? "Saving…" : "Save"}
        </button>
        {message && <span className="ml-2 text-xs text-gray-600">{message}</span>}
      </td>
    </tr>
  );
}
