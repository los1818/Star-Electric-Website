import type { PrismaClient } from "@prisma/client";

// STUB: staging → FieldOps mapping. Filled in once we have the Trimble table list.
//
// Each mapper reads StgTrimbleRow rows for one source table (status PENDING), creates or
// updates the FieldOps record, then marks the staging row MAPPED (with mappedEntity and
// mappedId) or ERROR (with a message). Mappers run in dependency order, e.g.
// customers → job sites → employees → jobs/work orders → time → materials → invoices.

export interface Mapper {
  sourceTable: string;
  targetEntity: string;
  dependsOn: string[];
  run(db: PrismaClient, batchId: string): Promise<{ mapped: number; errors: number }>;
}

export const MAPPERS: Mapper[] = [
  // Example shape (not real; Trimble table and column names unknown):
  // {
  //   sourceTable: "dbo.Customer",
  //   targetEntity: "Customer",
  //   dependsOn: [],
  //   async run(db, batchId) { ... },
  // },
];
