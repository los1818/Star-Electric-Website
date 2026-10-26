import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { parseArgs } from "node:util";
import { Prisma, PrismaClient } from "@prisma/client";
import { jobSequenceCode } from "../../src/lib/job-numbers";
import { formatDocumentNumber } from "../../src/lib/numbering";
import { reginaTime } from "../../src/lib/time";
import { seedLookups } from "../../prisma/seed/lookups";
import { mapCustomers, mapJobs, parseCsv, siteKey, type Issue, type IssueKind, type TCustomer, type TJob, type TSite } from "./parse";

// Import Trimble T&M Billing CSV exports (Customers, Jobs) into Sparks. See README.md.

const HELP = `
Usage: npx tsx scripts/import-trimble-csv/index.ts --customers <Customers.csv> --jobs <Jobs.csv> [options]

  --customers <path>  Trimble customer export (Record_Type C/S rows)
  --jobs <path>       Trimble job export (one row per File #)
  --apply             Write to the database (default is a dry run that only writes a report)
  --fresh             With --apply: first wipe ALL data (demo data included) and reload the
                      lookup tables. Demo job numbers would clash with Trimble's, so use this
                      the first time you import into a database that has demo data.
  --replace-demo      Like --fresh, but only if the database has demo data (safe to repeat).
  --help
`;

const ISSUE_LABELS: Record<IssueKind, string> = {
  BAD_ROW: "Rows skipped",
  TOTALS_MISMATCH: "Invoices whose tax doesn't add up",
  CUSTOMER_FROM_JOB: "Customers made from job billing addresses",
  SITE_FROM_JOB: "Job sites made from job site addresses",
  SITE_NO_STREET: "Job sites with no street address",
  SITE_NO_CITY: "Job sites with no city",
  OUTSIDE_SK: "Customers billed outside Saskatchewan",
};

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Regina noon on a YYYY-MM-DD date, so the date reads the same in every report. */
function day(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  return reginaTime(y, m - 1, d, 12);
}

function renderReport(files: string[], customers: TCustomer[], sites: TSite[], jobs: TJob[], issues: Issue[], applied: string | null): string {
  const invoiced = jobs.filter((j) => j.invoice);
  const byYear = new Map<string, { jobs: number; invoiced: number; cents: number }>();
  for (const j of jobs) {
    const y = byYear.get(j.fileNumber.slice(0, 4)) ?? { jobs: 0, invoiced: 0, cents: 0 };
    y.jobs++;
    if (j.invoice) {
      y.invoiced++;
      y.cents += j.invoice.totalCents;
    }
    byYear.set(j.fileNumber.slice(0, 4), y);
  }
  const lines = [
    `# Trimble import (${applied ? "applied" : "dry run"})`,
    "",
    `Files: ${files.map((f) => basename(f)).join(", ")} · ${new Date().toISOString()}`,
    "",
    `- Customers: **${customers.length}**`,
    `- Job sites: **${sites.length}**`,
    `- Jobs: **${jobs.length}** (${jobs.filter((j) => !j.invoice && !j.cancelled).length} still open, ${jobs.filter((j) => j.cancelled).length} cancelled)`,
    `- Invoices: **${invoiced.length}**, ${money(invoiced.reduce((s, j) => s + j.invoice!.totalCents, 0))} including tax (imported as Paid; cancelled jobs' invoices as Void)`,
    ...(applied ? ["", applied] : []),
    "",
    "## By year",
    "",
    "| Year | Jobs | Invoiced | Invoiced total | Next new job number |",
    "|---|---:|---:|---:|---|",
    ...[...byYear.entries()].sort().map(([y, v]) => {
      const last = Math.max(...jobs.filter((j) => j.fileNumber.startsWith(y)).map((j) => Number(j.fileNumber.slice(4))));
      return `| ${y} | ${v.jobs} | ${v.invoiced} | ${money(v.cents)} | ${y}${String(last + 1).padStart(3, "0")} |`;
    }),
    "",
    "## Things to check",
    "",
  ];
  const kinds = [...new Set(issues.map((i) => i.kind))];
  if (!kinds.length) lines.push("Nothing to check.");
  for (const kind of kinds) {
    const list = issues.filter((i) => i.kind === kind);
    lines.push(`### ${ISSUE_LABELS[kind]} (${list.length})`, "", ...list.slice(0, 200).map((i) => `- ${i.ref}: ${i.message}`));
    if (list.length > 200) lines.push(`- …and ${list.length - 200} more`);
    lines.push("");
  }
  return lines.join("\n");
}

async function wipeAndReloadLookups(db: PrismaClient) {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  // Keep everyone who can sign in: real users, plus the demo admin and office logins. Employee
  // records are wiped, so electricians are relinked when the users file is imported again.
  const users = await db.user.findMany({
    where: { active: true, OR: [{ email: { not: { endsWith: ".example" } } }, { role: { in: ["ADMIN", "OFFICE"] } }] },
    select: { email: true, name: true, role: true },
  });
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map((t) => `"public"."${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
  await seedLookups(db);
  for (const u of users) await db.user.create({ data: { ...u, active: true } });
}

async function apply(db: PrismaClient, customers: TCustomer[], sites: TSite[], jobs: TJob[]): Promise<string> {
  const byCode = <T extends { code: string; id: string }>(rows: T[]) => new Map(rows.map((r) => [r.code, r.id]));
  const [categories, taxLevels, types, priorities, woStatuses, invStatuses, taxComponents] = await Promise.all([
    db.customerCategory.findMany().then(byCode),
    db.taxLevel.findMany().then(byCode),
    db.workOrderType.findMany().then(byCode),
    db.priority.findMany().then(byCode),
    db.workOrderStatus.findMany().then(byCode),
    db.invoiceStatus.findMany().then(byCode),
    db.taxComponent.findMany(),
  ]);
  const need = (map: Map<string, string>, code: string, what: string) => {
    const id = map.get(code);
    if (!id) throw new Error(`The ${what} "${code}" is missing from Settings. Run the seed with --lookups-only.`);
    return id;
  };
  const gst = taxComponents.find((t) => t.code === "GST");
  const pst = taxComponents.find((t) => t.code === "PST");

  // Customers and their main contact.
  const customerIds = new Map<string, string>();
  for (const c of customers) {
    const legacyRef = `trimble:client:${c.code}`;
    const taken = await db.customer.findUnique({ where: { accountNumber: c.code }, select: { legacyRef: true } });
    const accountNumber = taken && taken.legacyRef !== legacyRef ? `T-${c.code}` : c.code;
    const data = {
      name: c.name,
      phone: c.phone,
      email: c.email,
      billingStreet: c.street,
      billingCity: c.city,
      billingProvince: c.province,
      billingPostal: c.postal,
      taxLevelId: need(taxLevels, c.taxLevel, "tax level"),
      taxExemptNumber: c.taxExemptNumber,
    };
    const row = await db.customer.upsert({
      where: { legacyRef },
      create: { legacyRef, accountNumber, categoryId: need(categories, "COMMERCIAL", "customer category"), ...data },
      update: data,
    });
    customerIds.set(c.code, row.id);
    if (c.contact) {
      const contactRef = `trimble:contact:${c.code}`;
      await db.contact.upsert({
        where: { legacyRef: contactRef },
        create: { legacyRef: contactRef, customerId: row.id, isPrimary: true, ...c.contact },
        update: c.contact,
      });
    }
  }

  // Job sites.
  const siteIds = new Map<string, string>();
  for (const s of sites) {
    const legacyRef = `trimble:site:${siteKey(s.customerCode, s.name).replace("\u0000", ":")}`;
    const data = { name: s.name, street: s.street, city: s.city, province: s.province, postal: s.postal };
    const row = await db.jobSite.upsert({
      where: { legacyRef },
      create: { legacyRef, customerId: customerIds.get(s.customerCode)!, ...data },
      update: data,
    });
    siteIds.set(siteKey(s.customerCode, s.name), row.id);
  }

  // Jobs → work orders, invoiced ones → invoices (history: Paid, or Void when cancelled).
  const woSequence = await db.sequence.findUniqueOrThrow({ where: { code: "WORK_ORDER" } });
  let created = 0;
  let updated = 0;
  for (const j of jobs) {
    const customerId = customerIds.get(j.customerCode)!;
    const jobSiteId = siteIds.get(siteKey(j.customerCode, j.siteName))!;
    const customer = customers.find((c) => c.code === j.customerCode)!;
    const statusCode = j.cancelled ? "CANCELLED" : j.invoice ? "INVOICED" : "NEW";
    const woData = {
      customerId,
      jobSiteId,
      jobNumber: j.fileNumber,
      typeId: need(types, "SERVICE", "work order type"),
      priorityId: need(priorities, "NORMAL", "priority"),
      statusId: need(woStatuses, statusCode, "work order status"),
      summary: j.summary,
      description: j.otherRefs.length ? `Trimble references: ${j.otherRefs.join(", ")}` : null,
      customerPoNumber: j.customerPoNumber,
      requestedAt: day(j.jobDate),
      completedAt: j.invoice ? day(j.invoice.date) : null,
    };
    await db.$transaction(async (tx) => {
      const legacyRef = `trimble:job:${j.fileNumber}`;
      const existing = await tx.workOrder.findUnique({ where: { legacyRef }, select: { id: true } });
      let workOrderId: string;
      if (existing) {
        await tx.workOrder.update({ where: { id: existing.id }, data: woData });
        workOrderId = existing.id;
        updated++;
      } else {
        const seq = await tx.sequence.update({ where: { code: "WORK_ORDER" }, data: { nextValue: { increment: 1 } } });
        const wo = await tx.workOrder.create({ data: { legacyRef, number: formatDocumentNumber(woSequence.prefix, seq.nextValue - 1, woSequence.padding), ...woData } });
        workOrderId = wo.id;
        created++;
      }
      if (!j.invoice) return;

      const inv = j.invoice;
      const invoiceRef = `trimble:invoice:${inv.number}`;
      const invoiceDate = day(inv.date);
      const invData = {
        number: inv.number,
        customerId,
        jobSiteId,
        kind: "STANDARD" as const,
        statusId: need(invStatuses, j.cancelled ? "VOID" : "PAID", "invoice status"),
        taxLevelId: need(taxLevels, customer.taxLevel, "tax level"),
        customerPoNumber: j.customerPoNumber,
        invoiceDate,
        postedAt: invoiceDate,
        voidedAt: j.cancelled ? invoiceDate : null,
        subtotalCents: inv.subtotalCents,
        taxCents: inv.taxCents,
        totalCents: inv.totalCents,
        paidCents: j.cancelled ? 0 : inv.totalCents,
        notes: `Imported from Trimble job ${j.fileNumber}. Payment history is in the accounting system.`,
      };
      const invoice = await tx.invoice.upsert({ where: { legacyRef: invoiceRef }, create: { legacyRef: invoiceRef, ...invData }, update: invData });
      await tx.invoiceLine.deleteMany({ where: { invoiceId: invoice.id } });
      await tx.invoiceTax.deleteMany({ where: { invoiceId: invoice.id } });
      const parts: [Prisma.InvoiceLineCreateManyInput["kind"], string, number][] = [
        ["LABOR", "Labour", inv.laborCents],
        ["MATERIAL", "Materials", inv.materialCents],
        ["OTHER", "General expenses", inv.generalCents],
        ["SUBCONTRACT", "Subcontractors", inv.subcontractCents],
        ["OTHER", "Adjustment (from Trimble)", inv.adjustmentCents],
      ];
      await tx.invoiceLine.createMany({
        data: parts
          .filter(([, , cents]) => cents !== 0)
          .map(([kind, description, cents], i) => ({ invoiceId: invoice.id, sortOrder: i, kind, description, quantity: 1, unitPriceCents: cents, amountCents: cents })),
      });
      await tx.invoiceTax.createMany({
        data: [
          ...(inv.gstCents ? [{ invoiceId: invoice.id, code: "GST", label: gst?.label ?? "GST", rateBp: gst?.rateBp ?? 500, taxableCents: inv.subtotalCents, taxCents: inv.gstCents }] : []),
          ...(inv.pstCents ? [{ invoiceId: invoice.id, code: "PST", label: pst?.label ?? "PST", rateBp: pst?.rateBp ?? 600, taxableCents: inv.subtotalCents, taxCents: inv.pstCents }] : []),
        ],
      });
      await tx.invoiceWorkOrder.upsert({
        where: { invoiceId_workOrderId: { invoiceId: invoice.id, workOrderId } },
        create: { invoiceId: invoice.id, workOrderId },
        update: {},
      });
    });
  }

  // New jobs carry on after the highest imported File # of each year.
  const lastByYear = new Map<number, number>();
  for (const j of jobs) {
    const year = Number(j.fileNumber.slice(0, 4));
    lastByYear.set(year, Math.max(lastByYear.get(year) ?? 0, Number(j.fileNumber.slice(4))));
  }
  for (const [year, last] of lastByYear) {
    const code = jobSequenceCode(year);
    await db.sequence.upsert({ where: { code }, create: { code, prefix: "", nextValue: last + 1, padding: 3 }, update: {} });
    await db.sequence.updateMany({ where: { code, nextValue: { lte: last } }, data: { nextValue: last + 1 } });
  }
  return `Applied: ${customers.length} customers and ${sites.length} job sites created or updated; ${created} work orders created, ${updated} updated.`;
}

async function main() {
  const { values } = parseArgs({
    options: {
      customers: { type: "string" },
      jobs: { type: "string" },
      apply: { type: "boolean", default: false },
      fresh: { type: "boolean", default: false },
      "replace-demo": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help || !values.customers || !values.jobs) {
    console.log(HELP);
    if (!values.help) process.exitCode = 1;
    return;
  }
  if (values.fresh && !values.apply) throw new Error("--fresh only makes sense with --apply");

  const customerExport = mapCustomers(parseCsv(await readFile(values.customers, "utf8")));
  if (!customerExport.customers.length) throw new Error(`${values.customers} doesn't look like a Trimble customer export (no "C" rows)`);
  const jobExport = mapJobs(parseCsv(await readFile(values.jobs, "utf8")), customerExport);
  if (!jobExport.jobs.length) throw new Error(`${values.jobs} doesn't look like a Trimble job export (no jobs found)`);
  const customers = [...customerExport.customers, ...jobExport.customers];
  const sites = [...customerExport.sites, ...jobExport.sites];
  const issues = [...customerExport.issues, ...jobExport.issues];

  let applied: string | null = null;
  if (values.apply) {
    const db = new PrismaClient();
    try {
      const hasDemo = (await db.customer.count({ where: { email: { endsWith: ".example" } } })) > 0 || (await db.workOrder.count({ where: { legacyRef: null, jobNumber: { not: null } } })) > 0;
      if (values.fresh || (values["replace-demo"] && hasDemo)) {
        console.log("Wiping all data and reloading lookup tables…");
        await wipeAndReloadLookups(db);
      } else if (hasDemo) {
        throw new Error("This database has demo data, whose job numbers would clash with Trimble's. Re-run with --replace-demo to replace it.");
      }
      console.log(`Importing ${customers.length} customers, ${sites.length} sites and ${jobExport.jobs.length} jobs…`);
      applied = await apply(db, customers, sites, jobExport.jobs);
    } finally {
      await db.$disconnect();
    }
  }

  const dir = join(import.meta.dirname, "reports");
  await mkdir(dir, { recursive: true });
  const reportPath = join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${applied ? "applied" : "dry-run"}.md`);
  await writeFile(reportPath, renderReport([values.customers, values.jobs], customers, sites, jobExport.jobs, issues, applied));
  console.log(applied ?? "Dry run: nothing was written. Add --apply to import.");
  console.log(`${customers.length} customers, ${sites.length} job sites, ${jobExport.jobs.length} jobs, ${issues.length} things to check`);
  console.log(`Report: ${reportPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
