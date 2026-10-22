# Trimble T&M Billing migration

Moves historical data from Trimble Time & Material Billing (SQL Server) into Sparks.
**Status: stub.** Reading, profiling and staging work; mapping staging rows to Sparks
records waits for the Trimble table list.

## How it works

1. **Extract** (`source.ts`): read-only `SELECT *` from each SQL Server table, streamed row by row.
2. **Profile** (`report.ts`): count rows, rows missing a primary key, duplicate keys, and how
   full each column is, with a few sample values.
3. **Stage** (`index.ts --stage`): write each row verbatim as JSON to `StgTrimbleRow`, grouped
   by an `ImportBatch`. Re-running the same batch skips duplicates.
4. **Map** (`mapping.ts`, *not built yet*): turn staged rows into Customers, Job Sites,
   Work Orders, Time Entries, Invoices, etc., marking each row `MAPPED` or `ERROR`.

A Markdown report is written to `scripts/migrate-trimble/reports/` (git-ignored) on every run.

## Setup

Fill in the Trimble variables in `.env`:

```
TRIMBLE_SQL_SERVER="trimble-sql.local"   # host or host\instance
TRIMBLE_SQL_DATABASE="TMBilling"
TRIMBLE_SQL_USER="readonly_user"
TRIMBLE_SQL_PASSWORD="..."
```

Use a **read-only** SQL login. The script only ever runs `SELECT`.

## Commands (from `sparks/`)

```bash
# 1. List every table, its row count and primary key (send this list to the dev team)
npx tsx scripts/migrate-trimble/index.ts --discover

# 2. Dry run: read and profile, write nothing
npm run trimble:dry-run -- --tables dbo.Customer,dbo.Job

# 3. Stage rows into StgTrimbleRow
npx tsx scripts/migrate-trimble/index.ts --stage --tables dbo.Customer,dbo.Job

# Try it without SQL Server using the example fixture
npm run trimble:dry-run -- --fixture scripts/migrate-trimble/fixture.example.json --tables dbo.Customer,dbo.Job
```

## Still to do (needs input from Star Electric)

- The Trimble table list and which tables matter (output of `--discover` is perfect).
- Which years of history to bring over (all, or e.g. the last 7 for CRA record keeping).
- How Trimble customers/jobs line up with ServiceBox customers, so we don't create duplicates.
- Whether historical invoices come over as read-only records or only as summary totals.
