// Exit code 0 if the database has no users yet (a brand-new install that needs demo data), 1 otherwise.
// Used by the start-local scripts so re-installing or updating never wipes existing data.
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
db.user
  .count()
  .then((n) => {
    process.exitCode = n === 0 ? 0 : 1;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 2;
  })
  .finally(() => db.$disconnect());
