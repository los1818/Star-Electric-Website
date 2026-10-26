import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { PrismaClient } from "@prisma/client";
import { DEFAULT_EMAIL_DOMAIN, parsePeopleCsv } from "../../src/lib/imports/people";
import { upsertPerson } from "../../src/server/imports/people";

// Create Sparks users (and employee records for electricians) from a CSV kept on your own PC.
// Easier: Settings → Users → "Import users from a file" in Sparks does the same thing.
// The list has real names, so it never goes in the repo (*.csv is git-ignored).
//
// Columns: Name, User Name, Role[, Email]
//   Role: Administrator / Office Admin → ADMIN, Office → OFFICE, Basic User / Technician → TECHNICIAN
//   Email: defaults to <User Name>@starelectric.ca
//
//   npx tsx scripts/import-people/index.ts --file users.csv [--apply] [--domain starelectric.ca]

async function main() {
  const { values } = parseArgs({ options: { file: { type: "string" }, apply: { type: "boolean", default: false }, domain: { type: "string", default: DEFAULT_EMAIL_DOMAIN } } });
  if (!values.file) throw new Error("--file is required");
  const { people, errors } = parsePeopleCsv(await readFile(values.file, "utf8"), values.domain);
  if (errors.length) throw new Error(errors.join("\n"));
  for (const p of people) console.log(`${p.role.padEnd(10)} ${p.name.padEnd(24)} ${p.email}${p.electrician ? "  + employee record" : ""}`);
  if (!values.apply) {
    console.log(`\nDry run: ${people.length} people. Add --apply to create them.`);
    return;
  }
  const db = new PrismaClient();
  try {
    for (const p of people) await db.$transaction((tx) => upsertPerson(tx, p));
    console.log(`\nDone: ${people.length} people. Anyone who already had a login kept their role. Check trades and labour rates in Employees.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
