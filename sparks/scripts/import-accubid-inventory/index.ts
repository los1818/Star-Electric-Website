import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { PrismaClient } from "@prisma/client";
import { parseAccubidRows, type IssueKind, type ParseResult } from "../../src/lib/imports/accubid";
import { applyAccubidImport, readAccubidWorkbook } from "../../src/server/imports/accubid";

// Import a Trimble Accubid inventory export (.xlsx, "Ext" sheet) into Sparks. See README.md.
// Easier: Inventory -> Import from Accubid in Sparks does the same thing with a preview.

const HELP = `
Usage: npx tsx scripts/import-accubid-inventory/index.ts --file <export.xlsx> [options]

  --file <path>       Accubid export (.xlsx) with an "Ext" sheet
  --apply             Write items to the database (default is a dry run)
  --prices-only       With --apply: update prices but leave stock quantities alone
  --location <code>   Stock location code (default WH, created if missing)
  --help
`;

const ISSUE_LABELS: Record<IssueKind, string> = {
  QTY_INFERRED: "Quantity inferred from value",
  QTY_MISSING: "Quantity missing",
  VALUE_MISMATCH: "Value doesn't match quantity × cost",
  DUPLICATE_MERGED: "Duplicate rows merged",
  STALE_PRICE: "Price older than 3 years",
  ZERO_STOCK: "Zero stock",
  BAD_ROW: "Row skipped",
  TOTALS_MISMATCH: "Totals don't match",
};

function money(cents: number) {
  return `$${(cents / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function renderReport(file: string, result: ParseResult, applied: boolean): string {
  const byCategory = new Map<string, { count: number; value: number }>();
  for (const i of result.items) {
    const c = byCategory.get(i.categoryCode) ?? { count: 0, value: 0 };
    byCategory.set(i.categoryCode, { count: c.count + 1, value: c.value + i.valueCents });
  }
  const byKind = new Map<IssueKind, string[]>();
  for (const issue of result.issues) byKind.set(issue.kind, [...(byKind.get(issue.kind) ?? []), `${issue.description}: ${issue.detail}`]);

  const lines = [
    `# Accubid inventory import ${applied ? "(applied)" : "(dry run)"}`,
    "",
    `File: ${basename(file)} · ${new Date().toISOString()}`,
    "",
    `- Items: **${result.items.length}**`,
    `- Value at cost: **${money(result.importedTotalCents)}**${result.sheetTotalCents !== null ? ` (sheet total ${money(result.sheetTotalCents)})` : ""}`,
    `- Items with stock: ${result.items.filter((i) => i.quantity > 0).length}`,
    "",
    "## Categories (guessed from descriptions; fix in Sparks after import)",
    "",
    "| Category | Items | Value |",
    "|---|---:|---:|",
    ...[...byCategory].sort().map(([code, c]) => `| ${code} | ${c.count} | ${money(c.value)} |`),
    "",
    "## Things to check",
  ];
  for (const [kind, entries] of byKind) {
    lines.push("", `### ${ISSUE_LABELS[kind]} (${entries.length})`, "", ...entries.map((e) => `- ${e}`));
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const { values } = parseArgs({
    options: {
      file: { type: "string" },
      apply: { type: "boolean", default: false },
      "prices-only": { type: "boolean", default: false },
      location: { type: "string", default: "WH" },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help || !values.file) {
    console.log(HELP);
    if (!values.help) process.exitCode = 1;
    return;
  }

  const file = await readFile(values.file);
  const result = parseAccubidRows(await readAccubidWorkbook(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer));
  console.log(`${result.items.length} items, ${money(result.importedTotalCents)} at cost, ${result.issues.length} things to check`);

  if (values.apply) {
    const db = new PrismaClient();
    try {
      console.log("Applied:", await applyAccubidImport(db, result, { updateStock: !values["prices-only"], locationCode: values.location, source: `accubid-inventory:${basename(values.file)}` }));
    } finally {
      await db.$disconnect();
    }
  }

  const dir = join(__dirname, "reports");
  await mkdir(dir, { recursive: true });
  const out = join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}${values.apply ? "-applied" : "-dry-run"}.md`);
  await writeFile(out, renderReport(values.file, result, values.apply));
  console.log(`Report: ${out}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
