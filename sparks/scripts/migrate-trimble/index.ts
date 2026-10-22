import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { Prisma, PrismaClient } from "@prisma/client";
import { renderMarkdown, TableProfiler, type TableReport } from "./report";
import { connectSqlServer, loadFixture, type SourceRow, type TrimbleSource } from "./source";

// Trimble T&M Billing → Sparks staging ETL (stub). See README.md.

const HELP = `
Usage: npx tsx scripts/migrate-trimble/index.ts [options]

  --discover            List every table with row count and primary key, then exit
  --tables a,b          Schema-qualified tables to read (e.g. dbo.Customer,dbo.Job)
  --dry-run             Read and profile only; write nothing (default)
  --stage               Write rows to the StgTrimbleRow staging table
  --fixture <file>      Read from a JSON fixture instead of SQL Server
  --help
`;

const BATCH = 500;

async function main() {
  const { values } = parseArgs({
    options: {
      discover: { type: "boolean", default: false },
      tables: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      stage: { type: "boolean", default: false },
      fixture: { type: "string" },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) {
    console.log(HELP);
    return;
  }
  if (values.stage && values["dry-run"]) throw new Error("Choose --dry-run or --stage, not both");
  const dryRun = !values.stage;

  const source: TrimbleSource = values.fixture ? await loadFixture(values.fixture) : await connectSqlServer();
  const db = new PrismaClient();
  try {
    if (values.discover) {
      console.table(await source.discover());
      return;
    }

    const tables = values.tables?.split(",").map((t) => t.trim()).filter(Boolean) ?? [];
    if (tables.length === 0) throw new Error("Pass --tables (run --discover to list them)");

    const startedAt = new Date();
    const batch = dryRun ? null : await db.importBatch.create({ data: { source: values.fixture ? `fixture:${values.fixture}` : "trimble-sqlserver", dryRun } });
    const reports: TableReport[] = [];

    for (const table of tables) {
      const profiler = new TableProfiler(table, await source.primaryKey(table));
      let buffer: Prisma.StgTrimbleRowCreateManyInput[] = [];
      const flush = async () => {
        if (!batch || buffer.length === 0) return;
        const { count } = await db.stgTrimbleRow.createMany({ data: buffer, skipDuplicates: true });
        profiler.report.staged += count;
        buffer = [];
      };

      await source.readRows(table, async (row: SourceRow) => {
        const key = profiler.add(row);
        if (!batch || key === null) return;
        buffer.push({ batchId: batch.id, sourceTable: table, sourceKey: key, data: toJson(row) });
        if (buffer.length >= BATCH) await flush();
      });
      await flush();
      reports.push(profiler.report);
      console.log(`${table}: ${profiler.report.rows} rows${dryRun ? "" : `, ${profiler.report.staged} staged`}`);
    }

    const markdown = renderMarkdown(reports, { dryRun, startedAt });
    const dir = join(__dirname, "reports");
    await mkdir(dir, { recursive: true });
    const file = join(dir, `${startedAt.toISOString().replace(/[:.]/g, "-")}${dryRun ? "-dry-run" : "-stage"}.md`);
    await writeFile(file, markdown);
    if (batch) {
      await db.importBatch.update({ where: { id: batch.id }, data: { finishedAt: new Date(), summary: toJson({ reports }) } });
    }
    console.log(`\nReport written to ${file}`);
  } finally {
    await source.close();
    await db.$disconnect();
  }
}

/** SQL Server values (Dates, Buffers, bigint) → JSON-safe values for the staging column. */
function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => {
      if (typeof v === "bigint") return v.toString();
      if (v && typeof v === "object" && v.type === "Buffer" && Array.isArray(v.data)) return Buffer.from(v.data).toString("base64");
      return v;
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
