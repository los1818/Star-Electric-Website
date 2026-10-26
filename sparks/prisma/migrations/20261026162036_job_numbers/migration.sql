-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "jobNumber" TEXT;

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "jobNumber" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Project_jobNumber_key" ON "Project"("jobNumber");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_jobNumber_key" ON "WorkOrder"("jobNumber");


-- Number existing projects and stand-alone work orders (same SQL as BACKFILL_JOB_NUMBERS_SQL in src/lib/job-numbers.ts)
CREATE TEMP TABLE job_backfill AS
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
   FROM jobs j;

UPDATE "Project" p SET "jobNumber" = CAST(b.yr AS text) || lpad(CAST(b.n AS text), 3, '0')
   FROM job_backfill b WHERE b.kind = 'P' AND b.id = p.id;

UPDATE "WorkOrder" w SET "jobNumber" = CAST(b.yr AS text) || lpad(CAST(b.n AS text), 3, '0')
   FROM job_backfill b WHERE b.kind = 'W' AND b.id = w.id;

INSERT INTO "Sequence" (code, prefix, "nextValue", padding, "updatedAt")
   SELECT 'JOB-' || yr, '', MAX(n) + 1, 3, now() FROM job_backfill GROUP BY yr
   ON CONFLICT (code) DO UPDATE SET "nextValue" = GREATEST("Sequence"."nextValue", EXCLUDED."nextValue"), "updatedAt" = now();

DROP TABLE job_backfill;
