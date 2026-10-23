import { Prisma, type InventoryItem, type PrismaClient, type Role } from "@prisma/client";
import { computeTotals, lineAmountCents, markupPriceCents, type TaxComponentRate } from "../../src/lib/money";
import { suggestMarkupBp } from "../../src/lib/markup";
import { progressInvoiceTotals, progressLine } from "../../src/lib/progress-billing";
import { reginaDate, reginaTime } from "../../src/lib/time";

// Fake demo data for development. Every business name is invented; addresses use real
// Regina street names with made-up numbers; phone numbers are in the fictional 555-01xx range.

const pick = <T>(arr: readonly T[], i: number): T => arr[i % arr.length];
const pad = (n: number, width: number) => String(n).padStart(width, "0");
const phone = (n: number) => `(306) 555-01${pad(n % 100, 2)}`;

/** `hour` o'clock Regina time, `days` from today (Regina calendar). */
function daysFromNow(days: number, hour = 8): Date {
  const { year, month, day } = reginaDate(new Date());
  return reginaTime(year, month, day + days, hour);
}

function dateOnly(days: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

const CUSTOMERS: { name: string; category: string; term: string }[] = [
  { name: "Qu'Appelle Office Suites Ltd.", category: "COMMERCIAL", term: "NET30" },
  { name: "Brightwater Retail Group", category: "COMMERCIAL", term: "NET30" },
  { name: "Prairie Lantern Hospitality Inc.", category: "COMMERCIAL", term: "NET15" },
  { name: "Kestrel Auto Centre", category: "COMMERCIAL", term: "DUE_ON_RECEIPT" },
  { name: "Flatland Fabrication Inc.", category: "INDUSTRIAL", term: "NET30" },
  { name: "Coldspring Grain Handling Ltd.", category: "INDUSTRIAL", term: "NET45" },
  { name: "Ironbark Pipe & Supply", category: "INDUSTRIAL", term: "NET30" },
  { name: "Northwind Packaging Ltd.", category: "INDUSTRIAL", term: "NET30" },
  { name: "Harbour Lane Seniors Residence", category: "INSTITUTIONAL", term: "NET30" },
  { name: "Mapleview Community Clinic", category: "INSTITUTIONAL", term: "NET30" },
  { name: "Eastlake Learning Centre", category: "INSTITUTIONAL", term: "NET45" },
  { name: "St. Brendan's Parish Hall", category: "INSTITUTIONAL", term: "NET15" },
  { name: "Tallgrass Property Management", category: "PROPERTY_MGMT", term: "NET30" },
  { name: "Crestline Realty Services", category: "PROPERTY_MGMT", term: "NET30" },
  { name: "Meadowlark Condominium Corp. No. 1042", category: "PROPERTY_MGMT", term: "NET30" },
  { name: "Saskwest Apartment Rentals", category: "PROPERTY_MGMT", term: "NET15" },
  { name: "Bluestem Construction Ltd.", category: "GENERAL_CONTRACTOR", term: "NET45" },
  { name: "Keystone Builders Group", category: "GENERAL_CONTRACTOR", term: "NET45" },
  { name: "Granite Line Contracting", category: "GENERAL_CONTRACTOR", term: "NET30" },
  { name: "Dominion Prairie Builders", category: "GENERAL_CONTRACTOR", term: "NET45" },
];

const STREETS = [
  "Albert St", "Broad St", "Victoria Ave", "Dewdney Ave", "Saskatchewan Dr", "Ross Ave",
  "McCarthy Blvd", "Rochdale Blvd", "Quance St", "Arcola Ave", "Pasqua St", "Lewvan Dr",
  "Park St", "Winnipeg St", "Hamilton St", "Lorne St", "Elphinstone St", "Fleet St",
  "McDonald St", "13th Ave", "College Ave", "Gordon Rd", "Wascana Pkwy", "E Primrose Green Dr",
  "Fairways West Dr", "Sherwood Dr", "Kramer Blvd", "Prince of Wales Dr", "Ring Rd", "Pinkie Rd",
] as const;

const POSTAL_PREFIXES = ["S4N", "S4P", "S4R", "S4S", "S4T", "S4V", "S4W", "S4X", "S4Y", "S4Z"] as const;
const LETTERS = "ABCEGHJKLMNPRSTVWXYZ";
const postal = (i: number) => `${pick(POSTAL_PREFIXES, i)} ${(i * 3) % 10}${LETTERS[(i * 7) % LETTERS.length]}${(i * 5 + 1) % 10}`;

const SITE_SUFFIXES = ["Main Building", "Warehouse", "North Campus", "Unit B", "Shop", "Tower"] as const;

const EMPLOYEES: { first: string; last: string; trade: string; rate: string }[] = [
  { first: "Dana", last: "Kowalchuk", trade: "FOREMAN", rate: "FOREMAN" },
  { first: "Marcus", last: "Lindqvist", trade: "JOURNEYPERSON", rate: "JOURNEYPERSON" },
  { first: "Priya", last: "Natarajan", trade: "JOURNEYPERSON", rate: "JOURNEYPERSON" },
  { first: "Tom", last: "Bérubé", trade: "JOURNEYPERSON", rate: "JOURNEYPERSON" },
  { first: "Kelsey", last: "Redcloud", trade: "JOURNEYPERSON", rate: "JOURNEYPERSON" },
  { first: "Owen", last: "Fehr", trade: "JOURNEYPERSON", rate: "JOURNEYPERSON" },
  { first: "Jasmine", last: "Okafor", trade: "APPRENTICE_4", rate: "APPRENTICE" },
  { first: "Riley", last: "Thiessen", trade: "APPRENTICE_3", rate: "APPRENTICE" },
  { first: "Ethan", last: "Paquette", trade: "APPRENTICE_2", rate: "APPRENTICE" },
  { first: "Lena", last: "Schultz", trade: "APPRENTICE_1", rate: "APPRENTICE" },
];

/** Users for the dev login. Two technicians are linked to employees. */
const USERS: { email: string; name: string; role: Role; employeeIndex?: number }[] = [
  { email: "admin@star-electric.example", name: "Alex Admin", role: "ADMIN" },
  { email: "office@star-electric.example", name: "Olivia Office", role: "OFFICE" },
  { email: "tech@star-electric.example", name: "Marcus Lindqvist", role: "TECHNICIAN", employeeIndex: 1 },
  { email: "tech2@star-electric.example", name: "Jasmine Okafor", role: "TECHNICIAN", employeeIndex: 6 },
  // Signed in with SSO for the first time; waiting for an administrator to assign a role.
  { email: "new.hire@star-electric.example", name: "Nolan Newhire", role: "PENDING" },
];

// [sku, description, category, unit, cost cents]. No sell price: materials are marked up per quote/invoice.
const INVENTORY: [string, string, string, string, number][] = [
  ["W-12-2-NMD", "12/2 NMD90 copper cable", "WIRE", "FT", 62],
  ["W-14-2-NMD", "14/2 NMD90 copper cable", "WIRE", "FT", 45],
  ["W-10-3-AC90", "10/3 AC90 armoured cable", "WIRE", "FT", 185],
  ["W-12-2-AC90", "12/2 AC90 armoured cable", "WIRE", "FT", 98],
  ["W-6-RW90-BK", "#6 RW90 copper, black", "WIRE", "FT", 165],
  ["W-12-T90-BK", "#12 T90 stranded, black", "WIRE", "FT", 21],
  ["W-12-T90-WH", "#12 T90 stranded, white", "WIRE", "FT", 21],
  ["W-12-T90-GN", "#12 T90 stranded, green", "WIRE", "FT", 21],
  ["W-TECK-3C10", "3C #10 TECK90 cable", "WIRE", "M", 720],
  ["C-EMT-075", "3/4\" EMT conduit, 10 ft", "CONDUIT", "EA", 1150],
  ["C-EMT-050", "1/2\" EMT conduit, 10 ft", "CONDUIT", "EA", 780],
  ["C-EMT-100", "1\" EMT conduit, 10 ft", "CONDUIT", "EA", 1890],
  ["C-PVC-100", "1\" rigid PVC conduit, 10 ft", "CONDUIT", "EA", 1240],
  ["C-EMTC-075", "3/4\" EMT set-screw connector", "CONDUIT", "EA", 95],
  ["C-EMTK-075", "3/4\" EMT set-screw coupling", "CONDUIT", "EA", 88],
  ["C-LT-050", "1/2\" liquid-tight flex, per ft", "CONDUIT", "FT", 145],
  ["B-4SQ-D", "4\" square box, 2-1/8\" deep", "BOXES", "EA", 310],
  ["B-1110", "1110 device box", "BOXES", "EA", 245],
  ["B-PLR-1G", "1-gang plaster ring", "BOXES", "EA", 135],
  ["B-JB-6x6", "6x6x4 NEMA 1 junction box", "BOXES", "EA", 1450],
  ["B-WP-1G", "1-gang weatherproof in-use cover", "BOXES", "EA", 1120],
  ["D-REC-15", "15A 5-15R decorator receptacle, white", "DEVICES", "EA", 165],
  ["D-REC-20T", "20A 5-20R T-slot receptacle, commercial", "DEVICES", "EA", 495],
  ["D-GFCI-15", "15A GFCI receptacle, tamper-resistant", "DEVICES", "EA", 1950],
  ["D-SW-1P", "15A single-pole switch, decorator", "DEVICES", "EA", 210],
  ["D-SW-3W", "15A 3-way switch, decorator", "DEVICES", "EA", 395],
  ["D-OCC-WALL", "Wall occupancy sensor switch", "DEVICES", "EA", 3850],
  ["D-PLT-1G", "1-gang decorator wall plate", "DEVICES", "EA", 65],
  ["BR-QO-115", "15A 1-pole plug-on breaker", "BREAKERS", "EA", 1150],
  ["BR-QO-120", "20A 1-pole plug-on breaker", "BREAKERS", "EA", 1150],
  ["BR-QO-230", "30A 2-pole plug-on breaker", "BREAKERS", "EA", 2890],
  ["BR-AFCI-115", "15A combination AFCI breaker", "BREAKERS", "EA", 5450],
  ["BR-PNL-42", "225A 42-circuit 120/208V panelboard", "BREAKERS", "EA", 89500],
  ["BR-DISC-60", "60A 600V fused disconnect, NEMA 3R", "BREAKERS", "EA", 21500],
  ["L-TRF-2x4", "2x4 LED troffer, 4000K", "LIGHTING", "EA", 6450],
  ["L-HB-150", "150W LED high bay, 5000K", "LIGHTING", "EA", 15800],
  ["L-WP-40", "40W LED wall pack, photocell", "LIGHTING", "EA", 8900],
  ["L-EXIT-RM", "Running-man LED exit sign, battery", "LIGHTING", "EA", 7450],
  ["L-EMG-2H", "Emergency battery unit, 2 heads", "LIGHTING", "EA", 9850],
  ["L-PNL-1x4", "1x4 LED panel, 4000K", "LIGHTING", "EA", 4250],
  ["F-STRUT-10", "1-5/8\" strut channel, 10 ft", "FASTENERS", "EA", 2450],
  ["F-ATR-38", "3/8\" all-thread rod, 10 ft", "FASTENERS", "EA", 795],
  ["F-1HS-075", "3/4\" EMT one-hole strap", "FASTENERS", "EA", 22],
  ["F-TIE-8", "8\" cable ties, black, 100 pk", "FASTENERS", "PKG", 595],
  ["F-ANC-14", "1/4\" concrete wedge anchor", "FASTENERS", "EA", 38],
  ["M-WN-YEL", "Yellow wire nuts, box of 100", "MISC", "BOX", 1190],
  ["M-TAPE-BK", "Vinyl electrical tape, black", "MISC", "ROLL", 165],
  ["M-PULL-1L", "Wire pulling lubricant, 1 L", "MISC", "EA", 1450],
  ["M-LBL-ARC", "Arc flash warning labels, 10 pk", "MISC", "PKG", 1850],
  ["M-FIRE-CAUL", "Firestop sealant, 300 mL", "MISC", "EA", 1995],
];

const VENDORS = [
  "Prairie Electrical Wholesale",
  "Wascana Lighting Supply",
  "Ironside Industrial Distributors",
  "Kingsway Breaker & Panel",
  "Flatland Fastener Co.",
];

const WORK_ORDERS: { type: string; status: string; priority: string; summary: string }[] = [
  { type: "SERVICE", status: "NEW", priority: "NORMAL", summary: "Tripping breaker in break room" },
  { type: "EMERGENCY", status: "DISPATCHED", priority: "EMERGENCY", summary: "Loss of power to east wing panel" },
  { type: "PROJECT", status: "IN_PROGRESS", priority: "NORMAL", summary: "Tenant improvement: 2nd floor lighting and receptacles" },
  { type: "MAINTENANCE", status: "SCHEDULED", priority: "LOW", summary: "Annual emergency lighting test" },
  { type: "INSPECTION", status: "COMPLETED", priority: "NORMAL", summary: "Infrared scan of main switchgear" },
  { type: "WARRANTY", status: "ON_HOLD", priority: "LOW", summary: "LED high bay flickering (warranty claim)" },
  { type: "SERVICE", status: "INVOICED", priority: "NORMAL", summary: "Add 20A dedicated circuit for walk-in cooler" },
  { type: "PROJECT", status: "CLOSED", priority: "NORMAL", summary: "Parking lot pole light retrofit" },
  { type: "SERVICE", status: "CANCELLED", priority: "LOW", summary: "Replace exterior wall pack" },
  { type: "SERVICE", status: "COMPLETED", priority: "HIGH", summary: "Install EV charger in staff parking" },
  { type: "MAINTENANCE", status: "INVOICED", priority: "NORMAL", summary: "Quarterly generator transfer test" },
  { type: "EMERGENCY", status: "CLOSED", priority: "EMERGENCY", summary: "Water ingress at exterior disconnect" },
  { type: "INSPECTION", status: "SCHEDULED", priority: "NORMAL", summary: "Arc flash label survey" },
  { type: "PROJECT", status: "IN_PROGRESS", priority: "HIGH", summary: "New 600V feed to production line 3" },
  { type: "SERVICE", status: "NEW", priority: "HIGH", summary: "GFCI receptacles failing in washrooms" },
];

type Ids = Map<string, string>;



async function idsByCode(rows: Promise<{ id: string; code: string }[]>): Promise<Ids> {
  return new Map((await rows).map((r) => [r.code, r.id]));
}

export async function seedDemo(db: PrismaClient): Promise<void> {
  const categories = await idsByCode(db.customerCategory.findMany());
  const terms = await idsByCode(db.paymentTerm.findMany());
  const taxLevels = await idsByCode(db.taxLevel.findMany());
  const woTypes = await idsByCode(db.workOrderType.findMany());
  const woStatuses = await idsByCode(db.workOrderStatus.findMany());
  const priorities = await idsByCode(db.priority.findMany());
  const quoteStatuses = await idsByCode(db.quoteStatus.findMany());
  const invoiceStatuses = await idsByCode(db.invoiceStatus.findMany());
  const poStatuses = await idsByCode(db.purchaseOrderStatus.findMany());
  const trades = await idsByCode(db.trade.findMany());
  const rates = new Map((await db.laborRate.findMany()).map((r) => [r.code, r]));
  const itemTypes = await idsByCode(db.timesheetItemType.findMany());
  const invCats = await idsByCode(db.inventoryCategory.findMany());
  const units = await idsByCode(db.unitOfMeasure.findMany());
  const eqTypes = await idsByCode(db.equipmentType.findMany());
  const methods = await idsByCode(db.paymentMethod.findMany());
  // Demo documents use the suggested markup for their size, as a user accepting the suggestion would.
  const markupTiers = await db.markupTier.findMany();
  const demoMarkupBp = (materialCost: number) => suggestMarkupBp(materialCost, markupTiers) ?? 0;

  const gstPst: TaxComponentRate[] = (
    await db.taxComponent.findMany({ where: { code: { in: ["GST", "PST"] } }, orderBy: { sortOrder: "asc" } })
  ).map((c) => ({ code: c.code, label: c.label, rateBp: c.rateBp }));

  // Customers, contacts and job sites (30 sites: every customer gets one, ten get a second).
  const customers = [];
  const sites: { id: string; customerId: string; name: string }[] = [];
  let siteNo = 0;
  for (const [i, c] of CUSTOMERS.entries()) {
    const customer = await db.customer.create({
      data: {
        accountNumber: `C${pad(1001 + i, 5)}`,
        name: c.name,
        categoryId: categories.get(c.category)!,
        phone: phone(i),
        email: `ap@customer${i + 1}.example`,
        billingStreet: `${100 + i * 37} ${pick(STREETS, i)}`,
        billingCity: "Regina",
        billingProvince: "SK",
        billingPostal: postal(i),
        paymentTermId: terms.get(c.term),
        // One tax-exempt customer, with its exemption number on file.
        taxLevelId: taxLevels.get(i === 10 ? "EXEMPT" : "GST_PST"),
        taxExemptNumber: i === 10 ? "EXEMPT-DEMO-0001" : null,
        creditHold: i === 3,
        contacts: {
          create: [
            { firstName: pick(["Sam", "Jordan", "Taylor", "Morgan", "Casey"], i), lastName: pick(["Hill", "Martel", "Gauthier", "Nguyen", "Bird", "Olson"], i), title: "Facilities Manager", phone: phone(i + 40), email: `facilities@customer${i + 1}.example`, isPrimary: true },
            { firstName: pick(["Jamie", "Avery", "Robin", "Drew"], i), lastName: pick(["Kerr", "Dubois", "Singh", "Wiebe", "Lafond"], i), title: "Accounts Payable", phone: phone(i + 70), email: `ap@customer${i + 1}.example` },
          ],
        },
      },
    });
    customers.push(customer);
    const siteCount = i < 10 ? 2 : 1;
    for (let s = 0; s < siteCount; s++) {
      const site = await db.jobSite.create({
        data: {
          customerId: customer.id,
          name: `${c.name.replace(/( Ltd\.| Inc\.| Corp\..*)$/, "")}: ${pick(SITE_SUFFIXES, siteNo)}`,
          street: `${200 + siteNo * 53} ${pick(STREETS, siteNo + 7)}`,
          city: "Regina",
          province: "SK",
          postal: postal(siteNo + 20),
          accessNotes: siteNo % 3 === 0 ? "Check in at security desk. Electrical room key in lockbox, code from office." : null,
        },
      });
      sites.push({ id: site.id, customerId: customer.id, name: site.name });
      siteNo++;
    }
  }

  // Employees, users, trucks.
  const employees = [];
  for (const [i, e] of EMPLOYEES.entries()) {
    employees.push(
      await db.employee.create({
        data: {
          employeeNumber: `E${pad(101 + i, 4)}`,
          firstName: e.first,
          lastName: e.last,
          tradeId: trades.get(e.trade),
          laborRateId: rates.get(e.rate)!.id,
          phone: phone(i + 10),
          email: `${e.first.toLowerCase()}.${e.last.toLowerCase().replace(/[^a-z]/g, "")}@star-electric.example`,
          hireDate: dateOnly(-365 * (1 + (i % 8))),
        },
      }),
    );
  }
  for (const u of USERS) {
    await db.user.create({
      data: { email: u.email, name: u.name, role: u.role, employeeId: u.employeeIndex === undefined ? null : employees[u.employeeIndex].id },
    });
  }

  const warehouse = await db.inventoryLocation.create({ data: { code: "WH", name: "Main Warehouse", kind: "WAREHOUSE" } });
  const trucks = [];
  for (const [i, e] of employees.slice(0, 6).entries()) {
    trucks.push(await db.inventoryLocation.create({ data: { code: `TRK${i + 1}`, name: `Truck ${i + 1} (${e.firstName})`, kind: "TRUCK", employeeId: e.id } }));
  }

  // Inventory: 50 items with warehouse stock and some on trucks.
  const items: InventoryItem[] = [];
  for (const [i, [sku, description, cat, unit, cost]] of INVENTORY.entries()) {
    const item = await db.inventoryItem.create({
      data: { sku, description, categoryId: invCats.get(cat), unitId: units.get(unit), costCents: cost, reorderPoint: new Prisma.Decimal(unit === "FT" ? 250 : 10) },
    });
    items.push(item);
    await db.stockLevel.create({ data: { itemId: item.id, locationId: warehouse.id, quantity: new Prisma.Decimal(unit === "FT" ? 1000 + i * 50 : 20 + i) } });
    if (i % 3 === 0) {
      await db.stockLevel.create({ data: { itemId: item.id, locationId: pick(trucks, i / 3).id, quantity: new Prisma.Decimal(unit === "FT" ? 150 : 4) } });
    }
  }

  const vendors = [];
  for (const [i, name] of VENDORS.entries()) {
    vendors.push(await db.vendor.create({ data: { name, accountNumber: `STAR-${pad(i + 1, 3)}`, phone: phone(i + 90), email: `orders@vendor${i + 1}.example`, city: "Regina", province: "SK" } }));
  }

  // Equipment at a few sites.
  const equipment = [];
  for (let i = 0; i < 8; i++) {
    const type = pick(["PANEL", "SWITCHGEAR", "TRANSFORMER", "GENERATOR", "ATS", "EMERGENCY_LIGHTING", "EV_CHARGER", "UPS"], i);
    equipment.push(
      await db.equipment.create({
        data: {
          jobSiteId: sites[i * 3].id,
          typeId: eqTypes.get(type)!,
          name: `${type === "PANEL" ? "Panel" : type.charAt(0) + type.slice(1).toLowerCase().replace("_", " ")} ${String.fromCharCode(65 + i)}`,
          manufacturer: pick(["Eaton", "Schneider Electric", "Siemens", "Generac", "ABB"], i),
          model: `M-${1000 + i * 17}`,
          serialNumber: `SN${pad(48211 + i * 911, 7)}`,
          voltage: pick(["120/208V", "347/600V", "600V"], i),
          amperage: pick(["225A", "400A", "800A", "100A"], i),
          location: pick(["Main electrical room", "Basement", "Mechanical penthouse", "Exterior pad"], i),
          installedAt: dateOnly(-365 * (3 + i)),
        },
      }),
    );
  }

  const agreement = await db.serviceAgreement.create({
    data: {
      number: "SA-0001",
      customerId: customers[12].id,
      name: "Annual emergency lighting and IR scan",
      startDate: dateOnly(-200),
      frequencyMonths: 12,
      nextDueDate: dateOnly(14),
      priceCents: 285000,
      workSummary: "Annual emergency lighting test (CSA C22.1 / NBC), IR scan of main distribution.",
      sites: { create: [{ jobSiteId: sites[22].id }] },
    },
  });
  await db.serviceAgreement.create({
    data: {
      number: "SA-0002",
      customerId: customers[5].id,
      name: "Quarterly generator transfer test",
      startDate: dateOnly(-400),
      frequencyMonths: 3,
      nextDueDate: dateOnly(30),
      priceCents: 65000,
      sites: { create: [{ jobSiteId: sites[10].id }] },
    },
  });

  // Work orders: all 6 types and all 9 statuses are represented.
  const workOrders = [];
  for (const [i, w] of WORK_ORDERS.entries()) {
    const site = sites[(i * 2) % sites.length];
    const scheduled = ["NEW", "CANCELLED"].includes(w.status) ? null : daysFromNow(i - 7, 8 + (i % 3));
    const lead = employees[i % 6];
    const helper = employees[6 + (i % 4)];
    const wo = await db.workOrder.create({
      data: {
        number: `WO-${pad(i + 1, 6)}`,
        customerId: site.customerId,
        jobSiteId: site.id,
        typeId: woTypes.get(w.type)!,
        statusId: woStatuses.get(w.status)!,
        priorityId: priorities.get(w.priority)!,
        summary: w.summary,
        description: `${w.summary}. Customer reports issue via phone; see notes.`,
        customerPoNumber: i % 4 === 0 ? `PO${48000 + i * 13}` : null,
        notToExceedCents: w.type === "SERVICE" ? 150000 : null,
        requestedAt: daysFromNow(i - 12),
        scheduledStart: scheduled,
        scheduledEnd: scheduled ? new Date(scheduled.getTime() + 4 * 3600_000) : null,
        completedAt: ["COMPLETED", "INVOICED", "CLOSED"].includes(w.status) ? daysFromNow(i - 6, 15) : null,
        serviceAgreementId: w.type === "MAINTENANCE" && i === 3 ? agreement.id : null,
        assignments: {
          create: w.status === "NEW" ? [] : [{ employeeId: lead.id, isLead: true }, ...(w.type === "PROJECT" ? [{ employeeId: helper.id }] : [])],
        },
        equipment: i < 8 && w.type !== "SERVICE" ? { create: [{ equipmentId: equipment[i % equipment.length].id }] } : undefined,
      },
    });
    workOrders.push({ ...wo, lead, helper, def: w });
  }
  // Make sure each dev technician has assigned work today.
  for (const [n, empIndex] of [1, 6].entries()) {
    await db.workOrderAssignment.upsert({
      where: { workOrderId_employeeId: { workOrderId: workOrders[2 + n].id, employeeId: employees[empIndex].id } },
      create: { workOrderId: workOrders[2 + n].id, employeeId: employees[empIndex].id },
      update: {},
    });
  }
  await db.workOrder.update({ where: { id: workOrders[2].id }, data: { scheduledStart: daysFromNow(0, 8), scheduledEnd: daysFromNow(0, 16) } });

  const admin = await db.user.findUniqueOrThrow({ where: { email: "admin@star-electric.example" } });
  const office = await db.user.findUniqueOrThrow({ where: { email: "office@star-electric.example" } });
  await db.workOrderNote.create({ data: { workOrderId: workOrders[1].id, authorId: office.id, body: "Customer called at 6:40 am; main breaker tripped twice overnight." } });
  await db.workOrderNote.create({ data: { workOrderId: workOrders[2].id, authorId: admin.id, body: "Ceiling grid open on east side. Coordinate with drywall crew.", customerVisible: false } });

  // Time and materials on work orders that have started.
  const worked = workOrders.filter((w) => ["IN_PROGRESS", "COMPLETED", "INVOICED", "CLOSED"].includes(w.def.status));
  for (const [i, wo] of worked.entries()) {
    for (let d = 0; d < 2; d++) {
      await db.timeEntry.create({
        data: {
          employeeId: wo.lead.id,
          workOrderId: wo.id,
          date: dateOnly(-8 + i + d),
          itemTypeId: itemTypes.get(d === 1 && wo.def.type === "EMERGENCY" ? "OT_15" : "REGULAR")!,
          laborRateId: wo.lead.laborRateId,
          hoursHundredths: [400, 750, 325, 800][(i + d) % 4],
          description: d === 0 ? "Troubleshoot and diagnose" : "Repairs and testing",
          approvedById: wo.def.status === "IN_PROGRESS" ? null : office.id,
          approvedAt: wo.def.status === "IN_PROGRESS" ? null : daysFromNow(-1),
        },
      });
    }
    for (let m = 0; m < 3; m++) {
      const item = items[(i * 7 + m * 11) % items.length];
      await db.materialUsage.create({
        data: {
          workOrderId: wo.id,
          itemId: item.id,
          locationId: warehouse.id,
          description: item.description,
          quantity: new Prisma.Decimal(m === 0 ? 2 : m === 1 ? 1 : 25),
          unitCostCents: item.costCents,
        },
      });
    }
  }
  // Shop time (no work order) for one apprentice.
  await db.timeEntry.create({ data: { employeeId: employees[9].id, date: dateOnly(-1), itemTypeId: itemTypes.get("SHOP")!, hoursHundredths: 300, description: "Truck restock" } });

  // Quotes: 5, one per status.
  const quoteDefs = [
    { status: "DRAFT", title: "Warehouse LED high bay upgrade" },
    { status: "SENT", title: "Service upgrade to 400A" },
    { status: "ACCEPTED", title: "Tenant improvement: 2nd floor" },
    { status: "DECLINED", title: "Exterior lighting controls" },
    { status: "EXPIRED", title: "Generator and ATS installation" },
  ];
  for (const [i, q] of quoteDefs.entries()) {
    const site = sites[(i * 5 + 1) % sites.length];
    const jp = rates.get("JOURNEYPERSON")!;
    const quoteMaterials = [0, 1].map((m) => ({ item: items[(i * 9 + m * 4 + 30) % items.length], quantity: String((4 + m * 6) * (i + 1) * (i + 1) * 3) }));
    const markup = demoMarkupBp(quoteMaterials.reduce((sum, { item, quantity }) => sum + lineAmountCents(quantity, item.costCents), 0));
    const lines = [
      { kind: "LABOR" as const, laborRateId: jp.id, description: "Journeyperson labour", quantity: String(16 + i * 8), unitCostCents: jp.costCents, unitPriceCents: jp.sellCents },
      ...quoteMaterials.map(({ item, quantity }) => ({
        kind: "MATERIAL" as const,
        itemId: item.id,
        description: item.description,
        quantity,
        unitCostCents: item.costCents,
        unitPriceCents: markupPriceCents(item.costCents, markup),
      })),
    ];
    const priced = lines.map((l, n) => ({ ...l, sortOrder: n, quantity: new Prisma.Decimal(l.quantity), amountCents: lineAmountCents(l.quantity, l.unitPriceCents) }));
    const totals = computeTotals(priced.map((l) => ({ amountCents: l.amountCents, taxComponents: gstPst })));
    await db.quote.create({
      data: {
        number: `Q-${pad(i + 1, 6)}`,
        customerId: site.customerId,
        jobSiteId: site.id,
        statusId: quoteStatuses.get(q.status)!,
        taxLevelId: taxLevels.get("GST_PST"),
        materialMarkupBp: markup,
        title: q.title,
        scope: "Supply and install as per drawings E1–E3. Includes SaskPower electrical permit and inspection.",
        exclusions: "Patching and painting by others. Work during regular hours only.",
        issuedAt: q.status === "DRAFT" ? null : daysFromNow(-20 + i),
        validUntil: dateOnly(q.status === "EXPIRED" ? -5 : 25),
        subtotalCents: totals.subtotalCents,
        discountCents: totals.discountCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        lines: { create: priced },
      },
    });
  }

  // Invoices: 5, built from completed/invoiced/closed work orders' time and materials.
  const billable = workOrders.filter((w) => ["COMPLETED", "INVOICED", "CLOSED"].includes(w.def.status)).slice(0, 5);
  const invoiceStatusesInOrder = ["DRAFT", "SENT", "PARTIALLY_PAID", "PAID", "PAID"];
  for (const [i, wo] of billable.entries()) {
    const time = await db.timeEntry.findMany({ where: { workOrderId: wo.id }, include: { laborRate: true, itemType: true } });
    const mats = await db.materialUsage.findMany({ where: { workOrderId: wo.id } });
    const markup = demoMarkupBp(mats.reduce((sum, m) => sum + lineAmountCents(m.quantity.toString(), m.unitCostCents), 0));
    const lines = [
      ...time.map((t) => {
        const hours = (t.hoursHundredths / 100).toFixed(2);
        const unit = Math.round(((t.laborRate?.sellCents ?? 0) * t.itemType.multiplierBp) / 10000);
        return { kind: "LABOR" as const, laborRateId: t.laborRateId, description: `${t.itemType.label}: ${t.description ?? ""}`.trim(), quantity: hours, unitCostCents: t.laborRate?.costCents ?? 0, unitPriceCents: unit };
      }),
      ...mats.map((m) => ({ kind: "MATERIAL" as const, itemId: m.itemId, description: m.description, quantity: m.quantity.toString(), unitCostCents: m.unitCostCents, unitPriceCents: markupPriceCents(m.unitCostCents, markup) })),
    ];
    const priced = lines.map((l, n) => ({ ...l, sortOrder: n, quantity: new Prisma.Decimal(l.quantity), amountCents: lineAmountCents(l.quantity, l.unitPriceCents) }));
    const totals = computeTotals(priced.map((l) => ({ amountCents: l.amountCents, taxComponents: gstPst })));
    const status = invoiceStatusesInOrder[i];
    const paid = status === "PAID" ? totals.totalCents : status === "PARTIALLY_PAID" ? Math.round(totals.totalCents / 2) : 0;
    const invoice = await db.invoice.create({
      data: {
        number: `INV-${pad(i + 1, 6)}`,
        customerId: wo.customerId,
        jobSiteId: wo.jobSiteId,
        statusId: invoiceStatuses.get(status)!,
        paymentTermId: terms.get("NET30"),
        taxLevelId: taxLevels.get("GST_PST"),
        materialMarkupBp: markup,
        customerPoNumber: wo.customerPoNumber,
        invoiceDate: dateOnly(-30 + i * 5),
        dueDate: dateOnly(i * 5),
        postedAt: status === "DRAFT" ? null : daysFromNow(-30 + i * 5),
        subtotalCents: totals.subtotalCents,
        discountCents: totals.discountCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        paidCents: paid,
        lines: { create: priced },
        taxes: { create: totals.taxes.map(({ code, label, rateBp, taxableCents, taxCents }) => ({ code, label, rateBp, taxableCents, taxCents })) },
        workOrders: { create: [{ workOrderId: wo.id }] },
      },
    });
    // Billed materials get the price they were invoiced at.
    for (const m of mats) {
      await db.materialUsage.update({ where: { id: m.id }, data: { unitPriceCents: markupPriceCents(m.unitCostCents, markup) } });
    }
    if (paid > 0) {
      await db.payment.create({ data: { invoiceId: invoice.id, paidAt: dateOnly(-3), amountCents: paid, methodId: methods.get(i % 2 ? "EFT" : "CHEQUE"), reference: `${i % 2 ? "EFT" : "CHQ"}${70120 + i}` } });
    }
  }

  // Purchase orders: two.
  for (const [i, status] of ["ORDERED", "RECEIVED"].entries()) {
    const lineItems = [items[i * 10 + 32], items[i * 10 + 34]];
    const poLines = lineItems.map((item, n) => ({ sortOrder: n, itemId: item.id, description: item.description, quantity: new Prisma.Decimal(10), receivedQty: new Prisma.Decimal(status === "RECEIVED" ? 10 : 0), unitCostCents: item.costCents, amountCents: lineAmountCents("10", item.costCents) }));
    const totals = computeTotals(poLines.map((l) => ({ amountCents: l.amountCents, taxComponents: gstPst })));
    await db.purchaseOrder.create({
      data: {
        number: `PO-${pad(i + 1, 6)}`,
        vendorId: vendors[i].id,
        statusId: poStatuses.get(status)!,
        workOrderId: workOrders[13].id,
        shipToLocationId: warehouse.id,
        taxLevelId: taxLevels.get("GST_PST"),
        orderedAt: daysFromNow(-6 + i),
        expectedAt: dateOnly(3),
        subtotalCents: totals.subtotalCents,
        taxCents: totals.taxCents,
        totalCents: totals.totalCents,
        lines: { create: poLines },
      },
    });
  }

  // Projects: contract, schedule of values, change orders, and a progress invoice with holdback.
  const projectStatuses = await idsByCode(db.projectStatus.findMany());
  const coStatuses = await idsByCode(db.changeOrderStatus.findMany());
  const projectDefs = [
    {
      wo: workOrders[2],
      name: "Tenant improvement: 2nd floor medical offices",
      status: "IN_PROGRESS",
      sov: [
        ["Mobilization, permits and SaskPower inspection", 850_000],
        ["Rough-in: conduit, boxes and branch wiring", 9_600_000],
        ["Lighting supply and install", 7_200_000],
        ["Devices and trim-out", 3_800_000],
        ["Fire alarm devices and wiring", 2_200_000],
        ["Testing, commissioning and closeout", 1_200_000],
      ] as [string, number][],
      changeOrders: [
        { number: "CO-001", title: "Add six dedicated exam-room circuits", amountCents: 785_000, status: "APPROVED" },
        { number: "CO-002", title: "Upgrade lighting controls to networked system", amountCents: 1_240_000, status: "PENDING" },
      ],
      // Progress claim #1 (percent complete to date per SOV line).
      claim: [10_000, 6000, 2000, 0, 2500, 0],
    },
    {
      wo: workOrders[13],
      name: "Production line 3: new 600V feed and equipment connections",
      status: "AWARDED",
      sov: [
        ["Engineering review and submittals", 620_000],
        ["Feeder and distribution", 4_800_000],
        ["Equipment connections", 2_600_000],
        ["Testing and commissioning", 600_000],
      ] as [string, number][],
      changeOrders: [{ number: "CO-001", title: "Credit: owner-supplied fused disconnect", amountCents: -150_000, status: "APPROVED" }],
      claim: null,
    },
  ];
  let progressInvoices = 0;
  for (const [n, def] of projectDefs.entries()) {
    const project = await db.project.create({
      data: {
        number: `P-${pad(n + 1, 4)}`,
        name: def.name,
        customerId: def.wo.customerId,
        jobSiteId: def.wo.jobSiteId,
        statusId: projectStatuses.get(def.status)!,
        managerId: office.id,
        taxLevelId: taxLevels.get("GST_PST"),
        contractNumber: `SUB-${2026}-${pad(41 + n, 3)}`,
        originalContractCents: def.sov.reduce((sum, [, v]) => sum + v, 0),
        holdbackBp: 1000,
        startDate: dateOnly(-45 + n * 30),
        sovLines: { create: def.sov.map(([description, scheduledValueCents], i) => ({ description, scheduledValueCents, sortOrder: i })) },
      },
      include: { sovLines: { orderBy: { sortOrder: "asc" } } },
    });
    await db.workOrder.update({ where: { id: def.wo.id }, data: { projectId: project.id } });
    def.wo.projectId = project.id;
    for (const co of def.changeOrders) {
      const approved = co.status === "APPROVED";
      const created = await db.changeOrder.create({
        data: { projectId: project.id, number: co.number, title: co.title, amountCents: co.amountCents, statusId: coStatuses.get(co.status)!, requestedAt: dateOnly(-20), approvedAt: approved ? dateOnly(-14) : null },
      });
      if (approved && co.amountCents > 0) {
        await db.scheduleOfValuesLine.create({ data: { projectId: project.id, description: `${co.number}: ${co.title}`, scheduledValueCents: co.amountCents, sortOrder: 100, changeOrderId: created.id } });
      }
    }
    if (def.claim) {
      const lines = project.sovLines.map((l, i) => ({ sovLineId: l.id, scheduledValueCents: l.scheduledValueCents, percentCompleteBp: def.claim![i], previouslyBilledCents: 0 }));
      const t = progressInvoiceTotals(lines, project.holdbackBp, gstPst);
      progressInvoices++;
      await db.invoice.create({
        data: {
          number: `INV-${pad(billable.length + progressInvoices, 6)}`,
          kind: "PROGRESS",
          projectId: project.id,
          customerId: project.customerId,
          jobSiteId: project.jobSiteId,
          statusId: invoiceStatuses.get("SENT")!,
          paymentTermId: terms.get("NET30"),
          taxLevelId: taxLevels.get("GST_PST"),
          invoiceDate: dateOnly(-10),
          dueDate: dateOnly(20),
          postedAt: daysFromNow(-10),
          notes: "Progress claim #1",
          subtotalCents: t.workThisPeriodCents,
          holdbackBp: project.holdbackBp,
          holdbackCents: t.holdbackCents,
          taxCents: t.totals.taxCents,
          totalCents: t.amountDueCents,
          taxes: { create: t.totals.taxes.map(({ code, label, rateBp, taxableCents, taxCents }) => ({ code, label, rateBp, taxableCents, taxCents })) },
          progressLines: {
            create: lines.map((l) => ({ ...l, thisPeriodCents: progressLine(l).thisPeriodCents })),
          },
        },
      });
    }
  }

  // This week's crew schedule (weekdays, 7:00–15:30) for the field staff on open work.
  const openWork = workOrders.filter((w) => ["SCHEDULED", "DISPATCHED", "IN_PROGRESS"].includes(w.def.status));
  for (let d = -3; d <= 4; d++) {
    const day = daysFromNow(d, 7);
    const weekday = new Date(day.getTime() - 6 * 3_600_000).getUTCDay(); // Regina weekday
    if (weekday === 0 || weekday === 6) continue;
    for (const [e, employee] of employees.entries()) {
      const wo = openWork[(e + d + 10) % openWork.length];
      await db.scheduleEntry.create({
        data: { employeeId: employee.id, workOrderId: wo.id, projectId: wo.projectId, startsAt: day, endsAt: new Date(day.getTime() + 8.5 * 3600_000) },
      });
    }
  }

  // Continue numbering after the seeded documents.
  const next: Record<string, number> = { WORK_ORDER: WORK_ORDERS.length + 1, QUOTE: quoteDefs.length + 1, INVOICE: billable.length + progressInvoices + 1, PURCHASE_ORDER: 3, SERVICE_AGREEMENT: 3, PROJECT: projectDefs.length + 1, CUSTOMER: 1001 + CUSTOMERS.length, EMPLOYEE: 101 + EMPLOYEES.length };
  for (const [code, nextValue] of Object.entries(next)) {
    await db.sequence.update({ where: { code }, data: { nextValue } });
  }

  // A few recent items so the sidebar list isn't empty on first login.
  for (const user of [admin, office]) {
    for (const [n, wo] of workOrders.slice(0, 3).entries()) {
      await db.recentItem.create({
        data: { userId: user.id, entityType: "Work order", entityId: wo.id, label: `${wo.number} ${wo.summary}`, href: `/work-orders/${wo.id}`, viewedAt: daysFromNow(0, 7 - n) },
      });
    }
  }
}

export const DEMO_COUNTS = {
  customers: CUSTOMERS.length,
  jobSites: 30,
  employees: EMPLOYEES.length,
  workOrders: WORK_ORDERS.length,
  quotes: 5,
  invoices: 5,
  inventoryItems: INVENTORY.length,
};
