// Exit code 0 if the database has no users yet (a brand-new install that needs demo data), 10 if it
// already has data. Anything else is an error (e.g. a crash exits 1), so a failure is never
// mistaken for "already has data". Used by the start-local scripts so updating never wipes data.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
db.user
  .count()
  .then((n) => {
    process.exitCode = n === 0 ? 0 : 10;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  })
  .finally(() => db.$disconnect());
