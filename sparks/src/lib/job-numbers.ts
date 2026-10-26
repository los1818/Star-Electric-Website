// Job numbers: one list shared by projects and stand-alone service work orders (work orders under a
// project use the project's). Same format as Trimble's "File #": the year, then a three-digit count
// that restarts each January (Regina calendar): 2026001, 2026002, ...

/** (2026, 14) → "2026014". Past 999 in a year it simply grows: "20261000". */
export function formatJobNumber(year: number, value: number): string {
  if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`Invalid job number ${value}`);
  return `${year}${String(value).padStart(3, "0")}`;
}

/** The Sequence row for a year's job numbers. */
export const jobSequenceCode = (year: number) => `JOB-${year}`;

/** What to show as a work order's job number: its project's, else its own. */
export function jobNumberOf(wo: { jobNumber: string | null; project?: { jobNumber: string | null } | null }): string | null {
  return wo.project?.jobNumber ?? wo.jobNumber;
}

/**
 * Gives every project and stand-alone work order without a job number one, in creation order per
 * Regina year, and moves each year's sequence past the highest number used. Used by the migration
 * that introduced job numbers (same SQL) and by the demo seed. Run the statements in order on one
 * connection (a transaction): they share a temporary table.
 */
export const BACKFILL_JOB_NUMBERS_SQL = [
  `CREATE TEMP TABLE job_backfill AS
   WITH jobs AS (
     SELECT 'P' AS kind, id, "createdAt" FROM "Project" WHERE "jobNumber" IS NULL
     UNION ALL
     SELECT 'W', id, "createdAt" FROM "WorkOrder" WHERE "projectId" IS NULL AND "jobNumber" IS NULL
   ), used AS (
     SELECT CAST(substr(code, 5) AS int) AS yr, "nextValue" - 1 AS last FROM "Sequence" WHERE code LIKE 'JOB-%'
   )
   SELECT j.kind, j.id,
          CAST(date_part('year', j."createdAt" - interval '6 hours') AS int) AS yr,
          COALESCE((SELECT last FROM used u WHERE u.yr = CAST(date_part('year', j."createdAt" - interval '6 hours') AS int)), 0)
            + row_number() OVER (PARTITION BY date_part('year', j."createdAt" - interval '6 hours') ORDER BY j."createdAt", j.id) AS n
   FROM jobs j`,
  `UPDATE "Project" p SET "jobNumber" = CAST(b.yr AS text) || lpad(CAST(b.n AS text), 3, '0')
   FROM job_backfill b WHERE b.kind = 'P' AND b.id = p.id`,
  `UPDATE "WorkOrder" w SET "jobNumber" = CAST(b.yr AS text) || lpad(CAST(b.n AS text), 3, '0')
   FROM job_backfill b WHERE b.kind = 'W' AND b.id = w.id`,
  `INSERT INTO "Sequence" (code, prefix, "nextValue", padding, "updatedAt")
   SELECT 'JOB-' || yr, '', MAX(n) + 1, 3, now() FROM job_backfill GROUP BY yr
   ON CONFLICT (code) DO UPDATE SET "nextValue" = GREATEST("Sequence"."nextValue", EXCLUDED."nextValue"), "updatedAt" = now()`,
  `DROP TABLE job_backfill`,
];
