import { PrismaClient } from "@prisma/client";
import { seedLookups } from "./seed/lookups";
import { DEMO_COUNTS, seedDemo } from "./seed/demo";

// Usage:
//   npm run db:seed                       lookups + fake demo data (wipes existing data)
//   npx tsx prisma/seed.ts --lookups-only  lookups only, never deletes (safe for production)

const db = new PrismaClient();

async function wipe() {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
  if (list) await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

async function main() {
  const lookupsOnly = process.argv.includes("--lookups-only");
  if (lookupsOnly) {
    await seedLookups(db);
    console.log("Seeded lookup tables.");
    return;
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to wipe and seed demo data with NODE_ENV=production. Use --lookups-only.");
  }
  await wipe();
  await seedLookups(db);
  await seedDemo(db);
  console.log("Seeded lookups and demo data:", DEMO_COUNTS);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
