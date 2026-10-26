# Trimble CSV import

Loads Trimble T&M Billing's **Customers** and **Jobs** CSV exports into Sparks. Re-runnable: every
record carries a `legacyRef` (`trimble:client:<code>`, `trimble:site:<code>:<site>`,
`trimble:job:<File #>`, `trimble:invoice:<Invoice #>`), so running it again with a newer export
updates what's there and adds what's new. Never duplicates.

> **Never commit the exports or the reports.** They hold real customer data. `*.csv` and
> `scripts/*/reports/` are git-ignored.

On Windows, put the files in `C:\Sparks\import` and double-click **Import Trimble Data (Windows).cmd**
(it also runs the inventory and user imports). By hand:

```bash
npx tsx scripts/import-trimble-csv/index.ts --customers Customers.csv --jobs Jobs.csv            # dry run + report
npx tsx scripts/import-trimble-csv/index.ts --customers Customers.csv --jobs Jobs.csv --apply --replace-demo
```

## Mapping

| Trimble | Sparks |
|---|---|
| Customers "C" row | Customer: account number = Trimble client code, billing address, phone, email, primary contact. Category defaults to Commercial. |
| National / State Exemption | Tax level (PST exempt → GST only, GST exempt → PST only, both → exempt) and the exemption numbers |
| Customers "S" row (and the C row's own site) | Job site |
| Jobs row | Work order: job number = File #, summary = Description, PO = first reference (NPR/CANC ignored), requested = Job date |
| Job type "Invoice" | Work order Invoiced + an invoice (Trimble's number, date, labour/materials/other lines, GST and PST), marked **Paid**: payment history lives in the accounting system |
| Reference "CANC" | Work order Cancelled, invoice Void |
| Job type "Work Order - Draft" | Open work order (New) |
| Highest File # per year | Next job number for that year (e.g. 2026211) |

Customers and sites a job uses that the Customers export lacks are made from the job's billing and site
addresses; a job site at the same street as an existing site of that customer reuses it. Trimble's
overall adjustments (e.g. a 10% holdback) become an "Adjustment" line so invoices match Trimble to the cent.

Re-running overwrites the Trimble fields on imported records (fine before go-live; after go-live,
edit in Sparks instead of re-importing). `--replace-demo` wipes the demo data the first time (demo job
numbers would clash), keeping real users and the demo admin and office logins.
