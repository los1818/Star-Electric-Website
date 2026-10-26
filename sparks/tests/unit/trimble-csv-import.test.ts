import { describe, expect, it } from "vitest";
import { mapCustomers, mapJobs, parseCents, parseCsv, parseTrimbleDate, postalCode, provinceCode, taxFor } from "../../scripts/import-trimble-csv/parse";

// Made-up rows in the shape of Trimble T&M Billing's Customers and Jobs CSV exports.
const CUSTOMERS = `﻿"Record_Type","Client Code","Client name","Site Name","Street","City","State","Country","Zip","Telephone","Contact","E-mail","Cell","National Exemption","State Exemption"
"C","Acme","Acme Plumbing Ltd.","Acme Plumbing Ltd.","100 Main St","Regina","Saskatchewan","Canada","s4p1a1","306-555-0100","Pat Lee","pat@acme.example","",,""
"S","Acme","Acme Plumbing Ltd.","Warehouse","200 Dewdney Ave","Regina","Saskatchewan","Canada","","","","","","",""
"C","School","Prairie School Division","Head office","1 School Rd","Regina","Saskatchewan","Canada","S4S 0A1","","","","","","0765297"
"C","Chain","Big Chain Inc.","Head office","5 Rue Ste-Catherine","Montreal","Quebec","Canada","H3B 1A1","","","","","",""
`;

const job = (o: Record<string, string>) => {
  const base: Record<string, string> = {
    "File #": "2026001", "Job date": "Jan 03, 2026", "Job type": "Invoice", "Customer reference #": "", "Reference #": "", "Reference #2": "NPR",
    "Invoice #": "26-100", "Invoice date": "Jan 27, 2026", "Description": "replace ballast", "Client code": "Acme", "Client name": "Acme Plumbing Ltd.",
    "Billing Name": "Acme Plumbing Ltd.", "Site Name": "Warehouse", "Site Address Street": "200 Dewdney Ave", "Site Address City": "Regina", "Site Address State": "Saskatchewan",
    "Total labor": "100.00", "Total materials": "50.50", "Total General expenses": "0.00", "Total subcontractors": "0.00",
    "Selling Price": "150.50", "Total national tax": "7.53", "Total state tax": "9.03", "Tax": "16.56", "Total": "167.06",
  };
  const merged = { ...base, ...o };
  return merged;
};
const toCsv = (rows: Record<string, string>[]) => {
  const cols = Object.keys(rows[0]);
  const q = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return [cols.map(q).join(","), ...rows.map((r) => cols.map((c) => q(r[c] ?? "")).join(","))].join("\r\n");
};

describe("CSV and values", () => {
  it("parses quoted fields, escaped quotes, commas and newlines", () => {
    expect(parseCsv('a,b\r\n"x, ""y""","line1\nline2"\r\n')).toEqual([{ a: 'x, "y"', b: "line1\nline2" }]);
  });

  it("reads amounts as exact cents, dates and addresses", () => {
    expect(parseCents("203.43")).toBe(20343);
    expect(parseCents("1,203.4")).toBe(120340);
    expect(parseCents("-5.05")).toBe(-505);
    expect(parseCents("")).toBe(0);
    expect(() => parseCents("abc")).toThrow();
    expect(parseTrimbleDate("Jan 03, 2022")).toBe("2022-01-03");
    expect(parseTrimbleDate("Sep 9, 2026")).toBe("2026-09-09");
    expect(parseTrimbleDate("2026-01-01")).toBeNull();
    expect(provinceCode("Saskatchewan")).toBe("SK");
    expect(postalCode("s4n4w5")).toBe("S4N 4W5");
  });

  it("maps exemption numbers to a tax level", () => {
    expect(taxFor({}).taxLevel).toBe("GST_PST");
    expect(taxFor({ "State Exemption": "0765297" })).toEqual({ taxLevel: "GST_ONLY", taxExemptNumber: "PST 0765297" });
    expect(taxFor({ "National Exemption": "123" }).taxLevel).toBe("PST_ONLY");
    expect(taxFor({ "National Exemption": "1", "State Exemption": "2" }).taxLevel).toBe("EXEMPT");
  });
});

describe("customers export", () => {
  const result = mapCustomers(parseCsv(CUSTOMERS));

  it("makes customers from C rows (with their contact and tax) and sites from C and S rows", () => {
    expect(result.customers.map((c) => c.code)).toEqual(["Acme", "School", "Chain"]);
    const acme = result.customers[0];
    expect(acme).toMatchObject({ name: "Acme Plumbing Ltd.", province: "SK", postal: "S4P 1A1", taxLevel: "GST_PST", contact: { firstName: "Pat", lastName: "Lee", email: "pat@acme.example" } });
    expect(result.customers[1]).toMatchObject({ taxLevel: "GST_ONLY", taxExemptNumber: "PST 0765297", contact: null });
    expect(result.sites.filter((s) => s.customerCode === "Acme").map((s) => s.name)).toEqual(["Acme Plumbing Ltd.", "Warehouse"]);
  });

  it("notes customers billed outside Saskatchewan", () => {
    expect(result.issues.filter((i) => i.kind === "OUTSIDE_SK").map((i) => i.ref)).toEqual(["Chain"]);
  });
});

describe("jobs export", () => {
  const known = mapCustomers(parseCsv(CUSTOMERS));

  it("turns an invoiced job into a job with an invoice whose parts and taxes add up", () => {
    const { jobs, issues } = mapJobs(parseCsv(toCsv([job({})])), known);
    expect(issues).toEqual([]);
    expect(jobs[0]).toMatchObject({ fileNumber: "2026001", jobDate: "2026-01-03", siteName: "Warehouse", summary: "replace ballast", customerPoNumber: null, cancelled: false });
    expect(jobs[0].invoice).toMatchObject({ number: "26-100", date: "2026-01-27", laborCents: 10000, materialCents: 5050, adjustmentCents: 0, subtotalCents: 15050, gstCents: 753, pstCents: 903, totalCents: 16706 });
  });

  it("keeps a holdback/discount as an adjustment, ignores NPR, and marks CANC jobs cancelled", () => {
    const { jobs } = mapJobs(
      parseCsv(toCsv([
        job({ "File #": "2026002", "Invoice #": "26-101", "Selling Price": "135.45", "Tax": "14.90", "Total national tax": "6.77", "Total state tax": "8.13", "Total": "150.35", "Customer reference #": "PO-778" }),
        job({ "File #": "2026003", "Invoice #": "26-102", "Reference #2": "CANC" }),
      ])),
      known,
    );
    expect(jobs[0].invoice!.adjustmentCents).toBe(-1505);
    expect(jobs[0].customerPoNumber).toBe("PO-778");
    expect(jobs[1].cancelled).toBe(true);
    expect(jobs[1].otherRefs).toEqual([]);
  });

  it("an open job (draft work order) has no invoice", () => {
    const { jobs } = mapJobs(parseCsv(toCsv([job({ "Job type": "Work Order - Draft", "Invoice #": "" })])), known);
    expect(jobs[0].invoice).toBeNull();
  });

  it("makes missing customers and sites from the job, and reuses a site at the same street", () => {
    const { jobs, customers, sites, issues } = mapJobs(
      parseCsv(toCsv([
        job({ "File #": "2026004", "Site Name": "Back shop", "Site Address Street": "200 DEWDNEY AVE." }),
        job({ "File #": "2026005", "Client code": "NewCo", "Billing Name": "New Co", "Site Name": "Yard", "Site Address Street": "9 Ring Rd" }),
      ])),
      known,
    );
    expect(jobs[0].siteName).toBe("Warehouse");
    expect(customers.map((c) => c.code)).toEqual(["NewCo"]);
    expect(sites.map((s) => `${s.customerCode}/${s.name}`)).toEqual(["NewCo/Yard"]);
    expect(issues.map((i) => i.kind).sort()).toEqual(["CUSTOMER_FROM_JOB", "SITE_FROM_JOB"]);
  });

  it("skips bad rows and duplicate job numbers, saying why", () => {
    const { jobs, issues } = mapJobs(parseCsv(toCsv([job({}), job({}), job({ "File #": "abc" }), job({ "File #": "2026009", "Job date": "soon" })])), known);
    expect(jobs).toHaveLength(1);
    expect(issues.filter((i) => i.kind === "BAD_ROW")).toHaveLength(3);
  });
});
