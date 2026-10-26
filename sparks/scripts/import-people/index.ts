import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { PrismaClient, type Role } from "@prisma/client";
import { formatDocumentNumber } from "../../src/lib/numbering";
import { parseCsv } from "../import-trimble-csv/parse";

// Create Sparks users (and employee records for electricians) from a CSV kept on your own PC.
// The list has real names, so it never goes in the repo (*.csv is git-ignored).
//
// Columns: Name, User Name, Role[, Email]
//   Role: Administrator → ADMIN, Office → OFFICE, Basic User / Technician / Electrician → TECHNICIAN
//   Email: defaults to <User Name>@<--domain> (starelectric.ca)
// Safe to run again: matches on email and updates name and role.
//
//   npx tsx scripts/import-people/index.ts --file users.csv [--apply] [--domain starelectric.ca]

const ROLES: Record<string, Role> = {
  administrator: "ADMIN",
  admin: "ADMIN",
  office: "OFFICE",
  "basic user": "TECHNICIAN",
  technician: "TECHNICIAN",
  electrician: "TECHNICIAN",
};

async function main() {
  const { values } = parseArgs({ options: { file: { type: "string" }, apply: { type: "boolean", default: false }, domain: { type: "string", default: "starelectric.ca" } } });
  if (!values.file) throw new Error("--file is required");
  const rows = parseCsv(await readFile(values.file, "utf8"));
  const people = rows.map((r, i) => {
    const name = (r["Name"] ?? "").trim();
    const username = (r["User Name"] ?? r["Username"] ?? "").trim().toLowerCase();
    const role = ROLES[(r["Role"] ?? "").trim().toLowerCase()];
    const email = ((r["Email"] ?? "").trim() || (username ? `${username}@${values.domain}` : "")).toLowerCase();
    if (!name || !email.includes("@") || !role) throw new Error(`Row ${i + 2}: needs a Name, a User Name or Email, and a Role (Administrator, Office or Basic User)`);
    const [firstName, ...rest] = name.split(/\s+/);
    return { name, firstName, lastName: rest.join(" "), email, username, role };
  });
  for (const p of people) console.log(`${p.role.padEnd(10)} ${p.name.padEnd(24)} ${p.email}${p.role === "TECHNICIAN" ? "  + employee record" : ""}`);
  if (!values.apply) {
    console.log(`\nDry run: ${people.length} people. Add --apply to create them.`);
    return;
  }

  const db = new PrismaClient();
  try {
    const journeyperson = await db.trade.findUnique({ where: { code: "JOURNEYPERSON" } });
    const rate = await db.laborRate.findUnique({ where: { code: "JOURNEYPERSON" } });
    for (const p of people) {
      await db.$transaction(async (tx) => {
        const user = await tx.user.upsert({
          where: { email: p.email },
          create: { email: p.email, name: p.name, role: p.role, active: true },
          update: { name: p.name, role: p.role, active: true },
        });
        if (p.role !== "TECHNICIAN" || user.employeeId) return;
        // Electricians need an employee record to be scheduled and to enter time.
        const legacyRef = `people:${p.email}`;
        let employee = await tx.employee.findUnique({ where: { legacyRef } });
        if (!employee) {
          const seq = await tx.sequence.update({ where: { code: "EMPLOYEE" }, data: { nextValue: { increment: 1 } } });
          employee = await tx.employee.create({
            data: {
              legacyRef,
              employeeNumber: formatDocumentNumber(seq.prefix, seq.nextValue - 1, seq.padding),
              firstName: p.firstName,
              lastName: p.lastName,
              email: p.email,
              tradeId: journeyperson?.id,
              laborRateId: rate?.id,
            },
          });
        }
        await tx.user.update({ where: { id: user.id }, data: { employeeId: employee.id } });
      });
    }
    console.log(`\nCreated or updated ${people.length} people. Check trades and labour rates in Employees.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
