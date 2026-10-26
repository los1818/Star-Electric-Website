// People (users) list for Sparks: from a CSV export (e.g. ServiceBox's user list) or typed in.
// Pure, so it's unit-tested. Writing to the database is src/server/imports/people.ts.
import type { Role } from "@prisma/client";
import { parseCsv } from "./trimble-csv";

export interface PersonRow {
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  /** Electricians get an employee record so they can be scheduled and enter time. */
  electrician: boolean;
}

const ROLES: Record<string, Role> = {
  administrator: "ADMIN",
  admin: "ADMIN",
  "office admin": "ADMIN",
  office: "OFFICE",
  "basic user": "TECHNICIAN",
  technician: "TECHNICIAN",
  electrician: "TECHNICIAN",
};

export const DEFAULT_EMAIL_DOMAIN = "starelectric.ca";

export function personFrom(input: { name: string; username?: string; email?: string; role: string; electrician?: boolean }, domain = DEFAULT_EMAIL_DOMAIN): PersonRow {
  const name = input.name.trim().replace(/\s+/g, " ");
  const role = ROLES[input.role.trim().toLowerCase()] ?? (["ADMIN", "OFFICE", "TECHNICIAN"].includes(input.role) ? (input.role as Role) : undefined);
  const username = (input.username ?? "").trim().toLowerCase();
  const email = ((input.email ?? "").trim() || (username ? `${username}@${domain}` : "")).toLowerCase();
  if (!name) throw new Error("Name is required");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error(`${name}: needs a user name or a valid email`);
  if (!role) throw new Error(`${name}: role "${input.role}" isn't one of Administrator, Office or Basic User`);
  const [firstName, ...rest] = name.split(" ");
  return { name, firstName, lastName: rest.join(" "), email, role, electrician: input.electrician ?? role === "TECHNICIAN" };
}

/** CSV with columns Name, User Name (or Username), Role and optionally Email. */
export function parsePeopleCsv(text: string, domain = DEFAULT_EMAIL_DOMAIN): { people: PersonRow[]; errors: string[] } {
  const people: PersonRow[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const [i, r] of parseCsv(text).entries()) {
    try {
      const p = personFrom({ name: r["Name"] ?? "", username: r["User Name"] ?? r["Username"], email: r["Email"], role: r["Role"] ?? "" }, domain);
      if (seen.has(p.email)) throw new Error(`${p.email} is listed twice`);
      seen.add(p.email);
      people.push(p);
    } catch (error) {
      errors.push(`Row ${i + 2}: ${(error as Error).message}`);
    }
  }
  return { people, errors };
}
