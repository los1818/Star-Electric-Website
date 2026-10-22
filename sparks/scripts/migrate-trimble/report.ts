import type { SourceRow } from "./source";

// Per-table profile collected while reading, used for the dry-run report.

export interface ColumnProfile {
  nonNull: number;
  sample: string[];
}

export interface TableReport {
  table: string;
  primaryKey: string[];
  rows: number;
  missingKey: number;
  duplicateKeys: number;
  columns: Record<string, ColumnProfile>;
  staged: number;
}

const SAMPLE_SIZE = 3;

export function rowKey(row: SourceRow, primaryKey: string[]): string | null {
  if (primaryKey.length === 0) return null;
  const parts = primaryKey.map((c) => row[c]);
  if (parts.some((p) => p === null || p === undefined || p === "")) return null;
  return parts.map((p) => (p instanceof Date ? p.toISOString() : String(p))).join("|");
}

export class TableProfiler {
  private readonly seen = new Set<string>();
  readonly report: TableReport;

  constructor(table: string, primaryKey: string[]) {
    this.report = { table, primaryKey, rows: 0, missingKey: 0, duplicateKeys: 0, columns: {}, staged: 0 };
  }

  /** Returns the row's key, or null if it has no usable key. */
  add(row: SourceRow): string | null {
    const r = this.report;
    r.rows++;
    for (const [column, value] of Object.entries(row)) {
      const profile = (r.columns[column] ??= { nonNull: 0, sample: [] });
      if (value === null || value === undefined || value === "") continue;
      profile.nonNull++;
      const text = value instanceof Date ? value.toISOString() : String(value);
      if (profile.sample.length < SAMPLE_SIZE && !profile.sample.includes(text)) profile.sample.push(text.slice(0, 60));
    }
    const key = rowKey(row, r.primaryKey);
    if (key === null) {
      r.missingKey++;
      return null;
    }
    if (this.seen.has(key)) {
      r.duplicateKeys++;
      return null;
    }
    this.seen.add(key);
    return key;
  }
}

export function renderMarkdown(reports: TableReport[], opts: { dryRun: boolean; startedAt: Date }): string {
  const lines = [
    `# Trimble import ${opts.dryRun ? "dry run" : "staging run"}`,
    "",
    `Started ${opts.startedAt.toISOString()}. ${opts.dryRun ? "Nothing was written to the database." : "Rows were written to StgTrimbleRow."}`,
    "",
    "| Table | Primary key | Rows | Missing key | Duplicate key | Staged |",
    "|---|---|---:|---:|---:|---:|",
    ...reports.map((r) => `| ${r.table} | ${r.primaryKey.join(", ") || "**none**"} | ${r.rows} | ${r.missingKey} | ${r.duplicateKeys} | ${r.staged} |`),
  ];
  for (const r of reports) {
    lines.push("", `## ${r.table}`, "", "| Column | Filled | Sample values |", "|---|---:|---|");
    for (const [column, p] of Object.entries(r.columns)) {
      const pct = r.rows === 0 ? 0 : Math.round((p.nonNull / r.rows) * 100);
      lines.push(`| ${column} | ${pct}% | ${p.sample.map((s) => `\`${s.replace(/\|/g, "\\|")}\``).join(", ")} |`);
    }
  }
  return `${lines.join("\n")}\n`;
}
