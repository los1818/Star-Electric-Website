// Turns Trimble T&M Billing CSV exports (Customers, Jobs) into plain records for Sparks.
// Pure: no database, no files, so it's unit-tested with made-up rows. See README.md.

export type Row = Record<string, string>;

export type IssueKind =
  | "SITE_NO_STREET"
  | "SITE_NO_CITY"
  | "CUSTOMER_FROM_JOB"
  | "SITE_FROM_JOB"
  | "OUTSIDE_SK"
  | "BAD_ROW"
  | "TOTALS_MISMATCH";

export interface Issue {
  kind: IssueKind;
  ref: string;
  message: string;
}

export interface TCustomer {
  code: string;
  name: string;
  street: string | null;
  city: string | null;
  province: string | null;
  postal: string | null;
  phone: string | null;
  email: string | null;
  /** GST_PST, GST_ONLY, PST_ONLY or EXEMPT (TaxLevel codes). */
  taxLevel: string;
  taxExemptNumber: string | null;
  contact: { firstName: string; lastName: string; phone: string | null; mobile: string | null; email: string | null } | null;
}

export interface TSite {
  customerCode: string;
  name: string;
  street: string;
  city: string;
  province: string;
  postal: string | null;
}

export interface TJob {
  /** Trimble File #, e.g. "2026014": becomes the Sparks job number. */
  fileNumber: string;
  customerCode: string;
  siteName: string;
  /** YYYY-MM-DD */
  jobDate: string;
  summary: string;
  customerPoNumber: string | null;
  otherRefs: string[];
  cancelled: boolean;
  /** Present when Trimble invoiced the job. */
  invoice: TInvoice | null;
}

export interface TInvoice {
  number: string;
  /** YYYY-MM-DD */
  date: string;
  laborCents: number;
  materialCents: number;
  generalCents: number;
  subcontractCents: number;
  /** Trimble's overall adjustment (e.g. a 10% holdback or discount): selling price minus the parts. */
  adjustmentCents: number;
  subtotalCents: number;
  gstCents: number;
  pstCents: number;
  taxCents: number;
  totalCents: number;
}

// --- CSV -----------------------------------------------------------------------------

/** RFC 4180 CSV: quoted fields, "" escapes, commas and newlines inside quotes. */
export function parseCsv(text: string): Row[] {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      record.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || record.length) {
    record.push(field);
    records.push(record);
  }
  const [header, ...rows] = records.filter((r) => r.some((f) => f.trim() !== ""));
  if (!header) return [];
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

// --- Values --------------------------------------------------------------------------

const blank = (v: string | undefined) => (v && v.trim() !== "" ? v.trim().replace(/\s+/g, " ") : null);

/** "1,203.43" or "-5.5" → cents, without floating point. */
export function parseCents(v: string | undefined): number {
  const s = (v ?? "").replace(/[$,\s]/g, "");
  if (s === "") return 0;
  const m = /^(-)?(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m) throw new Error(`Not an amount: "${v}"`);
  const cents = Number(m[2] || "0") * 100 + Number((m[3] ?? "").padEnd(2, "0").slice(0, 2));
  return m[1] ? -cents : cents;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** "Jan 03, 2022" → "2022-01-03". */
export function parseTrimbleDate(v: string | undefined): string | null {
  const m = /^([A-Za-z]{3})[a-z]* (\d{1,2}), (\d{4})$/.exec((v ?? "").trim());
  if (!m || !MONTHS[m[1].toLowerCase()]) return null;
  return `${m[3]}-${String(MONTHS[m[1].toLowerCase()]).padStart(2, "0")}-${m[2].padStart(2, "0")}`;
}

const PROVINCES: Record<string, string> = {
  saskatchewan: "SK", alberta: "AB", manitoba: "MB", "british columbia": "BC", ontario: "ON", quebec: "QC",
  "new brunswick": "NB", "nova scotia": "NS", "prince edward island": "PE", "newfoundland and labrador": "NL",
  yukon: "YT", "northwest territories": "NT", nunavut: "NU",
};

/** "Saskatchewan" → "SK"; anything else (e.g. a US state) is kept as written. */
export function provinceCode(v: string | undefined): string | null {
  const s = blank(v);
  if (!s) return null;
  return PROVINCES[s.toLowerCase()] ?? s;
}

/** "S4N4W5" / "s4n 4w5" → "S4N 4W5". Non-Canadian codes are kept as written. */
export function postalCode(v: string | undefined): string | null {
  const s = blank(v)?.toUpperCase() ?? null;
  if (!s) return null;
  const m = /^([A-Z]\d[A-Z])\s*(\d[A-Z]\d)$/.exec(s);
  return m ? `${m[1]} ${m[2]}` : s;
}

/** "Jane Q. Smith" → Jane / Q. Smith; one word → first name only. */
export function splitName(v: string): { firstName: string; lastName: string } {
  const parts = v.trim().split(/\s+/);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

/**
 * Trimble keeps federal (GST) and provincial (PST) exemption numbers. Map to a Sparks tax level:
 * PST exempt → GST only; GST exempt → PST only; both → exempt.
 */
export function taxFor(row: Row): { taxLevel: string; taxExemptNumber: string | null } {
  const gst = blank(row["National Exemption"]);
  const pst = blank(row["State Exemption"]);
  const taxLevel = gst && pst ? "EXEMPT" : pst ? "GST_ONLY" : gst ? "PST_ONLY" : "GST_PST";
  return { taxLevel, taxExemptNumber: [pst && `PST ${pst}`, gst && `GST ${gst}`].filter(Boolean).join(", ") || null };
}

/** Key for matching sites by customer + street, ignoring case and punctuation ("123 Main St." = "123 main st"). */
export const streetKey = (customerCode: string, street: string) => `${customerCode}\u0000${street.toLowerCase().replace(/[^a-z0-9]/g, "")}`;

/** Lower-case key for matching sites by customer + name. */
export const siteKey = (customerCode: string, siteName: string) => `${customerCode}\u0000${siteName.trim().toLowerCase()}`;

// --- Customers export ------------------------------------------------------------------

/** Customers_*.csv: "C" rows are clients (with their main address), "S" rows are their other sites. */
export function mapCustomers(rows: Row[]): { customers: TCustomer[]; sites: TSite[]; issues: Issue[] } {
  const customers: TCustomer[] = [];
  const sites = new Map<string, TSite>();
  const issues: Issue[] = [];
  const seen = new Set<string>();

  const addSite = (code: string, row: Row, ref: string) => {
    const name = blank(row["Site Name"]) ?? blank(row["Client name"]) ?? code;
    const key = siteKey(code, name);
    if (sites.has(key)) return;
    const site = siteFrom(code, name, row["Street"], row["City"], row["State"], row["Zip"], ref, issues);
    sites.set(key, site);
  };

  for (const [i, row] of rows.entries()) {
    const code = blank(row["Client Code"]);
    const type = (row["Record_Type"] ?? "").toUpperCase();
    const ref = `row ${i + 2}`;
    if (!code || (type !== "C" && type !== "S")) {
      issues.push({ kind: "BAD_ROW", ref, message: "No client code or unknown record type; skipped" });
      continue;
    }
    if (type === "C") {
      if (seen.has(code)) continue;
      seen.add(code);
      const contactName = blank(row["Contact"]);
      const phone = blank(row["Telephone"]);
      const email = blank(row["E-mail"]);
      const province = provinceCode(row["State"]);
      if (province && province !== "SK") issues.push({ kind: "OUTSIDE_SK", ref: code, message: `${blank(row["Client name"])}: billing address in ${row["State"]} (for information; tax follows the job site)` });
      customers.push({
        code,
        name: blank(row["Client name"]) ?? code,
        street: blank(row["Street"]),
        city: blank(row["City"]),
        province,
        postal: postalCode(row["Zip"]),
        phone,
        email,
        ...taxFor(row),
        contact: contactName ? { ...splitName(contactName), phone, mobile: blank(row["Cell"]), email } : null,
      });
    }
    addSite(code, row, `${code} / ${blank(row["Site Name"]) ?? "(main)"}`);
  }
  return { customers, sites: [...sites.values()], issues };
}

function siteFrom(code: string, name: string, street: string | undefined, city: string | undefined, province: string | undefined, postal: string | undefined, ref: string, issues: Issue[]): TSite {
  const s = blank(street);
  const c = blank(city);
  if (!s) issues.push({ kind: "SITE_NO_STREET", ref, message: "Site has no street address" });
  if (!c) issues.push({ kind: "SITE_NO_CITY", ref, message: "Site has no city" });
  return { customerCode: code, name, street: s ?? "", city: c ?? "", province: provinceCode(province) ?? "SK", postal: postalCode(postal) };
}

// --- Jobs export ---------------------------------------------------------------------------

const IGNORED_REFS = new Set(["NPR", "CANC"]); // NPR = no PO required; CANC = cancelled

/**
 * Jobs.csv: one row per Trimble job (File #). "Invoice" rows were invoiced; "Work Order - Draft"
 * rows are still open. Customers and sites the Customers export doesn't have are made from the
 * job's billing and site addresses.
 */
export function mapJobs(rows: Row[], known: { customers: TCustomer[]; sites: TSite[] }): { jobs: TJob[]; customers: TCustomer[]; sites: TSite[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const customerCodes = new Set(known.customers.map((c) => c.code));
  const siteKeys = new Set(known.sites.map((s) => siteKey(s.customerCode, s.name)));
  // Same customer + same street = same place, even if the job names it differently.
  const siteByStreet = new Map(known.sites.filter((s) => s.street).map((s) => [streetKey(s.customerCode, s.street), s.name]));
  const customers: TCustomer[] = [];
  const sites: TSite[] = [];
  const jobs: TJob[] = [];
  const fileNumbers = new Set<string>();

  for (const [i, row] of rows.entries()) {
    const ref = `row ${i + 2}`;
    try {
      const fileNumber = blank(row["File #"]);
      const code = blank(row["Client code"]);
      const jobDate = parseTrimbleDate(row["Job date"]);
      if (!fileNumber || !/^\d{7,8}$/.test(fileNumber)) throw new Error(`File # "${row["File #"]}" isn't a job number`);
      if (!code) throw new Error("No client code");
      if (!jobDate) throw new Error(`Job date "${row["Job date"]}" isn't a date`);
      if (fileNumbers.has(fileNumber)) throw new Error(`File # ${fileNumber} appears twice`);
      fileNumbers.add(fileNumber);

      if (!customerCodes.has(code)) {
        customerCodes.add(code);
        const phone = blank(row["Billing Address Tel"]);
        const email = blank(row["Billing Address email"]);
        const contactName = blank(row["Billing Address Contact"]);
        customers.push({
          code,
          name: blank(row["Billing Name"]) ?? blank(row["Client name"]) ?? code,
          street: blank(row["Billing Address Street"]),
          city: blank(row["Billing Address City"]),
          province: provinceCode(row["Billing Address State"]),
          postal: postalCode(row["Billing Address Zip"]),
          phone,
          email,
          taxLevel: "GST_PST",
          taxExemptNumber: null,
          contact: contactName ? { ...splitName(contactName), phone, mobile: null, email } : null,
        });
        issues.push({ kind: "CUSTOMER_FROM_JOB", ref: code, message: `Not in the Customers export; made from job ${fileNumber}'s billing address` });
      }

      let siteName = blank(row["Site Name"]) ?? blank(row["Client name"]) ?? code;
      const street = blank(row["Site Address Street"]);
      if (!siteKeys.has(siteKey(code, siteName))) {
        const sameStreet = street ? siteByStreet.get(streetKey(code, street)) : undefined;
        if (sameStreet) {
          siteName = sameStreet;
        } else {
          siteKeys.add(siteKey(code, siteName));
          const site = siteFrom(code, siteName, row["Site Address Street"], row["Site Address City"], row["Site Address State"], row["Site Address Zip"], `${code} / ${siteName}`, issues);
          sites.push(site);
          if (site.street) siteByStreet.set(streetKey(code, site.street), siteName);
          issues.push({ kind: "SITE_FROM_JOB", ref: `${code} / ${siteName}`, message: `Not in the Customers export; made from job ${fileNumber}'s site address` });
        }
      }

      const refs = [row["Customer reference #"], row["Reference #2"], row["Reference #"], row["Reference #3"], row["Reference #4"], row["Reference #5"]]
        .map((r) => blank(r))
        .filter((r): r is string => !!r && !IGNORED_REFS.has(r.toUpperCase()));
      const cancelled = [row["Reference #2"], row["Reference #"], row["Customer reference #"]].some((r) => blank(r)?.toUpperCase() === "CANC");

      let invoice: TInvoice | null = null;
      const invoiceNumber = blank(row["Invoice #"]);
      if (row["Job type"] === "Invoice" && invoiceNumber) {
        const inv: TInvoice = {
          number: invoiceNumber,
          date: parseTrimbleDate(row["Invoice date"]) ?? jobDate,
          laborCents: parseCents(row["Total labor"]),
          materialCents: parseCents(row["Total materials"]),
          generalCents: parseCents(row["Total General expenses"]),
          subcontractCents: parseCents(row["Total subcontractors"]),
          adjustmentCents: 0,
          subtotalCents: parseCents(row["Selling Price"]),
          gstCents: parseCents(row["Total national tax"]),
          pstCents: parseCents(row["Total state tax"]),
          taxCents: parseCents(row["Tax"]),
          totalCents: parseCents(row["Total"]),
        };
        inv.adjustmentCents = inv.subtotalCents - (inv.laborCents + inv.materialCents + inv.generalCents + inv.subcontractCents);
        if (inv.subtotalCents + inv.taxCents !== inv.totalCents || inv.gstCents + inv.pstCents !== inv.taxCents) {
          issues.push({ kind: "TOTALS_MISMATCH", ref: fileNumber, message: `Invoice ${inv.number}: selling price ${inv.subtotalCents / 100} + tax ${inv.taxCents / 100} (GST ${inv.gstCents / 100}, PST ${inv.pstCents / 100}) ≠ total ${inv.totalCents / 100}` });
        }
        invoice = inv;
      }

      jobs.push({
        fileNumber,
        customerCode: code,
        siteName,
        jobDate,
        summary: blank(row["Description"]) ?? `Trimble job ${fileNumber}`,
        customerPoNumber: refs[0] ?? null,
        otherRefs: refs.slice(1),
        cancelled,
        invoice,
      });
    } catch (error) {
      issues.push({ kind: "BAD_ROW", ref, message: `${(error as Error).message}; skipped` });
    }
  }
  return { jobs, customers, sites, issues };
}
