import { readFile } from "node:fs/promises";
import sql from "mssql";

// Where Trimble rows come from: the live SQL Server, or a JSON fixture for testing.

export type SourceRow = Record<string, unknown>;

export interface TableInfo {
  table: string;
  rowCount: number;
  primaryKey: string[];
}

export interface TrimbleSource {
  discover(): Promise<TableInfo[]>;
  primaryKey(table: string): Promise<string[]>;
  readRows(table: string, onRow: (row: SourceRow) => Promise<void> | void): Promise<void>;
  close(): Promise<void>;
}

const QUALIFIED = /^[A-Za-z_][\w]*\.[A-Za-z_][\w]*$/;

function quoteTable(table: string): string {
  if (!QUALIFIED.test(table)) throw new Error(`Table must be schema-qualified, e.g. dbo.Customers: ${table}`);
  return table
    .split(".")
    .map((part) => `[${part}]`)
    .join(".");
}

export async function connectSqlServer(): Promise<TrimbleSource> {
  const { TRIMBLE_SQL_SERVER, TRIMBLE_SQL_DATABASE, TRIMBLE_SQL_USER, TRIMBLE_SQL_PASSWORD } = process.env;
  if (!TRIMBLE_SQL_SERVER || !TRIMBLE_SQL_DATABASE) {
    throw new Error("Set TRIMBLE_SQL_SERVER and TRIMBLE_SQL_DATABASE (and user/password) in .env");
  }
  const pool = await sql.connect({
    server: TRIMBLE_SQL_SERVER,
    database: TRIMBLE_SQL_DATABASE,
    user: TRIMBLE_SQL_USER,
    password: TRIMBLE_SQL_PASSWORD,
    options: { encrypt: true, trustServerCertificate: true, readOnlyIntent: true },
  });

  async function primaryKey(table: string): Promise<string[]> {
    const [schema, name] = table.split(".");
    const result = await pool
      .request()
      .input("schema", sql.NVarChar, schema)
      .input("name", sql.NVarChar, name).query<{ column_name: string }>(`
        SELECT kcu.COLUMN_NAME AS column_name
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
          ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
        WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND tc.TABLE_SCHEMA = @schema AND tc.TABLE_NAME = @name
        ORDER BY kcu.ORDINAL_POSITION`);
    return result.recordset.map((r) => r.column_name);
  }

  return {
    async discover() {
      const result = await pool.request().query<{ table_name: string; row_count: number }>(`
        SELECT s.name + '.' + t.name AS table_name, SUM(p.rows) AS row_count
        FROM sys.tables t
        JOIN sys.schemas s ON s.schema_id = t.schema_id
        JOIN sys.partitions p ON p.object_id = t.object_id AND p.index_id IN (0, 1)
        GROUP BY s.name, t.name
        ORDER BY s.name, t.name`);
      const tables: TableInfo[] = [];
      for (const r of result.recordset) {
        tables.push({ table: r.table_name, rowCount: Number(r.row_count), primaryKey: await primaryKey(r.table_name) });
      }
      return tables;
    },
    primaryKey,
    async readRows(table, onRow) {
      // Streams so large tables don't load into memory. Read-only: SELECT only.
      const request = pool.request();
      request.stream = true;
      request.query(`SELECT * FROM ${quoteTable(table)}`);
      await new Promise<void>((resolve, reject) => {
        const pending: Promise<void>[] = [];
        request.on("row", (row: SourceRow) => {
          request.pause();
          pending.push(
            Promise.resolve(onRow(row))
              .then(() => {
                request.resume();
              })
              .catch(reject),
          );
        });
        request.on("error", reject);
        request.on("done", () => Promise.all(pending).then(() => resolve(), reject));
      });
    },
    close: () => pool.close(),
  };
}

/** Fixture format: { "dbo.Customers": { "primaryKey": ["CustID"], "rows": [ {...}, ... ] } } */
export async function loadFixture(path: string): Promise<TrimbleSource> {
  const data = JSON.parse(await readFile(path, "utf8")) as Record<string, { primaryKey: string[]; rows: SourceRow[] }>;
  return {
    async discover() {
      return Object.entries(data).map(([table, t]) => ({ table, rowCount: t.rows.length, primaryKey: t.primaryKey }));
    },
    async primaryKey(table) {
      return data[table]?.primaryKey ?? [];
    },
    async readRows(table, onRow) {
      for (const row of data[table]?.rows ?? []) await onRow(row);
    },
    async close() {},
  };
}
