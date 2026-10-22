import { parseArgs } from "node:util";
import { PrismaClient } from "@prisma/client";
import { isRole } from "../src/lib/auth/permissions";

// Create or update a user, e.g. the first administrator before anyone can sign in:
//   npm run user:create -- --email you@starelectric.ca --name "Your Name" --role ADMIN

async function main() {
  const { values } = parseArgs({
    options: { email: { type: "string" }, name: { type: "string" }, role: { type: "string", default: "ADMIN" } },
  });
  const email = values.email?.trim().toLowerCase();
  if (!email || !email.includes("@")) throw new Error("--email is required");
  if (!isRole(values.role)) throw new Error(`--role must be ADMIN, OFFICE, TECHNICIAN or PENDING`);

  const db = new PrismaClient();
  try {
    const user = await db.user.upsert({
      where: { email },
      create: { email, name: values.name ?? null, role: values.role, active: true },
      update: { role: values.role, active: true, ...(values.name ? { name: values.name } : {}) },
    });
    console.log(`${user.email} is now ${user.role} (active). They can sign in with Microsoft.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
