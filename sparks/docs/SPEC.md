# Sparks — Specification

**Status: DRAFT v0.8, written by Claude because no SPEC.md was supplied.**
It is modelled on ServiceBox and adjusted for commercial electrical contracting. Anything marked
**[ASSUMPTION]** needs confirmation from Star Electric before the phase that depends on it.

---

## 1. Purpose
Sparks replaces ServiceBox (day-to-day service and work orders) and the older Trimble
Time & Material Billing (historical T&M jobs and billing data) with one in-house system for
Star Electric Corp., Regina, SK. Users are office staff, administrators, and field technicians
(electricians and apprentices), who will mostly use phones or tablets.

## 2. Users and roles
| Role | Summary |
|---|---|
| **Administrator** | Everything, including Settings, users/roles, deleting records, and financial reports. |
| **Office** | Customers, job sites, work orders, dispatch, quotes, invoices, POs, inventory, timesheet approval. No Settings or user management. Can't delete posted invoices. |
| **Technician** | Sees work orders assigned to them, including the job site and customer contact details. Enters their own time and materials, adds notes, photos and signatures. **Never sees prices, costs or rates** (`pricing:view`), invoices, quotes or settings. |

Sign-in is Microsoft Entra ID (SSO), limited to `@starelectric.ca` accounts (`AUTH_ALLOWED_EMAIL_DOMAINS`).
Anyone with a company account can sign in; first-time users get the **Awaiting access** (PENDING) role with no
permissions until an administrator assigns a role in Settings → Users and, for technicians, links their employee
record. Administrators can deactivate users and can't remove their own admin access. The first administrator is
created with `npm run user:create`. A dev-only email login exists outside production builds. Permissions are defined in code as a role → permission map (`customers:read`, `invoices:write`,
`settings:manage`, ...) and enforced on every server action. Three fixed roles (plus
PENDING) are enough for now; per-user permission overrides can come later.

## 3. Modules (left sidebar)
In order:
1. **Dashboard**: today's work, overdue WOs, unbilled work, open quotes
2. **Dispatch Board**: crew schedules: assign electricians to work orders and projects by day (calendar + map)
3. **Work Orders**
4. **Projects**: contract jobs: contract value, change orders, schedule of values, progress billing, holdback
5. **Customers**
6. **Job Sites**
7. **Quotes**
8. **Invoices**
9. **Purchase Orders**
10. **Inventory**: items, stock by location (warehouse, trucks)
11. **Equipment**: customer-owned equipment at sites (panels, transformers, generators, UPS, lighting controls), with service history
12. **Service Agreements**: recurring maintenance contracts that spawn WOs (e.g. annual IR scans, emergency lighting tests)
13. **Timesheets**
14. **Employees**
15. **Vendors**
16. **Reports**
17. **Settings**: lookup tables, tax levels, company info, users

Global elements: search box (customers, sites, WOs, quotes, invoices by number/name/address),
a **New** menu (work order, quote, invoice, customer, job site, PO), and **Recent items**
(the last 10 records the current user opened).

## 4. Data model (core entities)
All tables have `id` (cuid), `createdAt`, `updatedAt`. Money in integer cents, rates in basis points.

**Identity / org**
- `User`: Auth.js user; `role` (ADMIN | OFFICE | TECHNICIAN), optional link to `Employee`, `active`.
  Roles are a code-level enum (they drive security), unlike the user-editable lookup tables.
- Auth.js tables: `Account`, `Session`, `VerificationToken`
- `CompanySetting`: key/value (company name, GST number, address, invoice footer, numbering)
- `Sequence`: per document type next number (WO, QUOTE, INVOICE, PO)

**Lookup tables** (all have `code`, `label`, `sortOrder`, `active`, optional `color`)
- `CustomerCategory`: Commercial, Industrial, Institutional, Property Management, General Contractor (confirmed)
- `WorkOrderType`: Service Call, Project, Maintenance, Emergency, Inspection, Warranty
- `WorkOrderStatus`: New, Scheduled, Dispatched, In Progress, On Hold, Completed, Invoiced, Closed, Cancelled (with `isClosed`, `isBillable` flags)
- `Priority`: Low, Normal, High, Emergency
- `QuoteStatus`: Draft, Sent, Accepted, Declined, Expired
- `InvoiceStatus`: Draft, Posted, Sent, Partially Paid, Paid, Void
- `PurchaseOrderStatus`: Draft, Ordered, Partially Received, Received, Closed
- `TimesheetItemType`: Regular, Overtime 1.5x, Double Time, Travel, Shop Time, Stat Holiday (with `payMultiplierBp`, `billable`)
- `TaxComponent`: one tax and its rate (GST 5%, SK PST 6%)
- `TaxLevel`: a named set of components: "GST + PST" (default), "GST only", "PST only", "Exempt" **[ASSUMPTION]**
- `PaymentTerm`: Due on Receipt, Net 15, Net 30, Net 45
- `UnitOfMeasure`: ea, ft, m, box, roll, hr
- `InventoryCategory`: Wire & Cable, Conduit & Fittings, Boxes, Devices, Breakers & Panels, Lighting, Fasteners, Misc
- `LaborRate`: Journeyperson, Apprentice, Foreman, After-hours (cost and sell, per hour). Seeded rates are placeholders.
- `PaymentMethod`: Cheque, EFT, Credit Card, Cash
- `Trade`: Journeyperson, Apprentice 1st–4th year, Foreman
- `EquipmentType`: Panelboard, Switchgear, Transformer, Generator, Transfer Switch, UPS, etc.
- `WorkOrderStatusTransition`: allowed from → to status changes (seeded, editable)

**Business records**
- `Customer`: name, category, billing address, phone, email, payment term, default tax level, tax exemption number, notes, active, credit hold
- `Contact`: belongs to customer and optionally job site; name, title, phone, email, isPrimary
- `JobSite`: belongs to customer; name, address, lat/lng, access notes, default tax level
- `Employee`: name, trade (Journeyperson/Apprentice level), phone, email, default labour rate, active
- `Vendor`: name, contact, phone, email, account number
- `WorkOrder`: number, customer, job site, type, status, priority, description, requested/scheduled dates, assigned employees (`WorkOrderAssignment`), PO number from customer, not-to-exceed amount, tax level
- `WorkOrderNote`: text, author, internal/customer-visible
- `TimeEntry` (timesheet line): employee, date, work order (optional for shop time), item type, hours (in hundredths), labour rate, approved by/at
- `MaterialUsage`: work order, inventory item (or free text), qty, unit cost, unit price, from location
- `Quote` + `QuoteLine`: number, customer, job site, status, valid until, material markup %, lines (labour/material/other) with cost and sell price, tax level, totals
- `Invoice` + `InvoiceLine`: number, customer, job site, work order(s), status, dates, terms, lines, totals, amount paid; credit notes point at the invoice they credit
- `InvoiceTax`: per-component tax breakdown, frozen when the invoice is posted
- `Payment`: invoice, date, amount, method, reference
- `InventoryItem`: SKU, description, category, UoM, reorder point, active, and **Trimble Accubid pricing**:
  price unit (E = each, C = per 100, M = per 1000), trade price, supplier discount, net cost,
  price date, estimating labour hours per labour unit, and a "no labour" flag. Quote, invoice, PO and
  material lines carry the price unit too, so `line amount = qty × price ÷ (1, 100 or 1000)`.
- `InventoryLocation`: warehouse or truck (linked to employee)
- `StockLevel`: item × location quantity
- `PurchaseOrder` + `PurchaseOrderLine`: vendor, status, work order (optional), lines, received qty
- `Equipment`: job site, type, make, model, serial, rating (voltage/amps/kVA), install date
- `ServiceAgreement`: customer, sites, frequency, next due, price, WO template
- `Attachment`: polymorphic (entity type + id), kind (PHOTO / SIGNATURE / DOCUMENT), caption, signer
  name, file key, uploaded by. Bytes live in file storage (local folder now, Azure Blob Storage when
  hosted), never in the database and never at a public URL: `/api/attachments/[id]` checks the viewer
  can see the parent record and returns 404 otherwise. Uploads are type-checked by their bytes
  (JPEG/PNG/WebP/HEIC, 15 MB, 10 per upload); phones shrink photos to 2000px before upload.
- `AuditLog`: user, action, entity, entity id, diff JSON
- `RecentItem`: user, entity type, entity id, label, viewedAt

**Projects**
- `Project`: number (P-0001), name, customer, job site, status, project manager, contract/PO numbers,
  original contract value, holdback % (default 10%), dates. Work orders, quotes, invoices, POs and
  schedule entries can belong to a project.
- `ChangeOrder`: per-project number (CO-001), title, amount (negative = credit), status (Pending, Approved,
  Rejected, Void: editable lookup). Approved COs add to the revised contract and can add SOV lines.
- `ScheduleOfValuesLine`: the contract broken into billable lines.
- `InvoiceProgressLine`: per SOV line on a progress invoice: % complete to date, previously billed, this period.
- `Invoice.kind`: STANDARD, PROGRESS, HOLDBACK_RELEASE; progress invoices store holdback % and amount retained.

**Scheduling and time**
- `ScheduleEntry`: an electrician's block of time on a work order/project (the crew calendar).
- `TimeEntry` also stores optional clock-in/out times and when the electrician submitted it.

**Migration staging**: `ImportBatch` plus one generic `StgTrimbleRow` table (source table, source key, raw row as JSON,
status, mapped entity/id). Generic because the Trimble table list isn't known yet.

## 5. Business rules
### Money and tax
- All amounts are integer cents. Line total = round(qty × unit price) using half-up rounding.
- Tax is computed **per invoice per tax component** on the sum of taxable lines, then rounded
  half-up to the cent. (Not per line.) **[ASSUMPTION]**
- Saskatchewan: GST 5% (federal), PST 6% (provincial), both charged on labour and materials (confirmed).
  Tax levels are configurable rows; rates are never in code.
- Some customers are tax exempt: their default tax level is "Exempt" and their exemption number is kept on
  the customer. New quotes/invoices take the job site's tax level, else the customer's, else the default.
- Each quote/invoice/PO line can override the document's tax level (e.g. labour "GST only", materials "GST + PST").
  Tax per component is computed on the sum of the lines that carry that component.
- A document discount reduces each component's taxable base in proportion to that base's share of the subtotal.
- Discounts: percentage or fixed, applied before tax.

### Projects, progress billing and holdback
- Revised contract = original contract + approved change orders. Pending COs are shown separately.
- A progress invoice bills each SOV line: `billed to date = scheduled value × % complete`, `this period =
  billed to date − previously billed` (negative allowed as a correction).
- Holdback is retained on the work billed this period at the project's holdback % (default 10%,
  Saskatchewan Builders' Lien Act). Amount due now = work − holdback + tax.
- Tax is charged on the amount due now; tax on holdback is charged when it is released on a
  HOLDBACK_RELEASE invoice. **[ASSUMPTION: confirm GST/PST timing on holdback with Star's accountant]**
- **[OPEN: holdback release rules: after substantial completion + lien period (40 days in SK)?]**

### Timesheets and schedules (no more paper)
- Electricians enter their own time on their phone against work orders (or shop time), optionally with
  start/end times, and submit it; office reviews and approves. Approved billable time flows to invoices.
- Office builds crew schedules on the dispatch board; electricians see their schedule on their phone.
- Existing time and schedules come over from ServiceBox (CSV export).

### Inventory (modelled on Trimble Accubid)
- Prices are per E/C/M exactly as in Trimble (e.g. conduit per 100 ft, screws per 1000).
- The warehouse inventory is loaded from the Accubid export with `npm run inventory:import`
  (see `scripts/import-accubid-inventory/README.md`). Real inventory files are never committed.
- **Items store cost only, no sell price.** Costs move up and down, and the markup depends on the size of the job.
- Each quote and invoice has its own **material markup %** (markup on cost, not margin: $100 at 25% = $125).
  Material lines default to current cost + that markup and can be overridden line by line; each line keeps its
  cost so the job's real margin can be reported.
- **Suggested markup by job size.** `MarkupTier` rows ("material cost from $X → Y%") are edited by admins in
  Settings → Markup tiers. A document's total material cost picks the highest tier it reaches, and that markup
  is the starting point on new quotes/invoices (Phase 4); it's shown beside the markup actually used.
  The first tier must start at $0. Seeded with typical trade starting points until Star Electric sets its own:
  $0 → 40%, $1,000 → 30%, $5,000 → 20%, $25,000 → 15%. **[OPEN: Star Electric's real tiers]**
- Materials logged on a work order record their cost at the time they're used; their sell price is set when
  they're billed on an invoice. Labour is still priced from the labour rate table.

### Numbering
- WO-000001, Q-000001, INV-000001, PO-000001, from the `Sequence` table, assigned inside a
  transaction. Live numbering starts at 1 (nothing has been used live yet); the demo seed uses its own numbers.

### Work order lifecycle
New → Scheduled → Dispatched → In Progress → Completed → Invoiced → Closed; On Hold and
Cancelled from any open state. Allowed transitions are stored with the status table (Phase 1).

### Timesheets
- Hours stored in hundredths (7.5 h = 750).
- Billable time flows to the invoice at the labour rate's sell price × item-type multiplier.
- Technicians edit their own entries until approved; Office approves.

### Invoicing
- Invoices can be built from one or more completed WOs (time + materials) or entered manually.
- Posted invoices are immutable; corrections are made by voiding or with a credit note.

## 6. Data migration from Trimble (confirmed scope)

**Bring over all Trimble history**: customers, jobs (closed and open), current projects, and inventory.
No cut-off date.

- **Inventory**: from the Accubid export (`npm run inventory:import`), already working.
- **Customers, jobs, current projects, history**: from the Trimble T&M Billing SQL Server via
  `scripts/migrate-trimble` (extract → stage → map). Mapping is written once the table list is known.
- Every migrated record keeps a `legacyRef` (e.g. `trimble:dbo.Customer:1042`), unique per table, so:
  the import can be re-run to pick up changes without duplicates; any record can be traced to its source.
- Historical invoices keep their Trimble numbers and come over as **posted** (read-only). Sparks numbering
  (INV-000001…) is separate and starts at 1.
- Closed jobs come over as Closed work orders with their time, materials and invoices for history and
  reporting. Open jobs and current projects come over as live work orders.
- A dry run and a reconciliation report (counts and dollar totals per table vs Trimble) are required
  before go-live; the final import runs at cut-over.
- **ServiceBox**: electricians' time entries and schedules come from the ServiceBox export (confirmed);
  matched to employees and Trimble jobs during import.
- **Current projects** use contract value, change orders, progress billing and holdback (confirmed), so they
  come over as `Project` records with their SOV, change orders, progress invoices and holdback held.

## 7. Integrations (later phases)
- Microsoft Entra ID SSO (Phase 0)
- Accounting export (QuickBooks/Sage?) **[OPEN: which accounting package?]**
- Trimble T&M Billing data migration from SQL Server (stub in Phase 0, real mapping later)
- ServiceBox data import (CSV export)

## 8. Phased plan
- **Phase 0: Foundation.** Scaffold, full schema, auth + roles, app shell, seed data, lookup
  tables, Trimble ETL stub, tests.
- **Phase 1: Core records.** *(Done 2026-10-23 except the ServiceBox import, which waits on the export.)* Customers, contacts, job sites, employees, vendors; Settings UI for lookups; global search; recent items;
  ServiceBox CSV import of customers, job sites and contacts.
- **Phase 2: Work orders, projects, schedules and time.** *(Done 2026-10-24 except the ServiceBox time/schedule import, which waits on the export.)* WO CRUD and lifecycle; projects and change orders;
  dispatch board / crew schedules; technician mobile view with schedule, **time entry and submission**
  (replaces paper timesheets), notes/photos/signature; office timesheet approval; ServiceBox time/schedule import.
- **Phase 3: Materials and purchasing.** Material usage on WOs, inventory and stock, POs.
- **Phase 4: Quoting and invoicing.** Quotes → WO/project, invoices from WOs, **progress invoices with holdback**,
  holdback release, payments, PDFs, email.
- **Phase 5: Equipment and service agreements.** Recurring WO generation.
- **Phase 6: Reports, accounting export, data migration** (Trimble + ServiceBox), go-live.

## 9. Decision log
| Date | Decision |
|---|---|
| 2026-10-22 | App lives in `sparks/` in the `star-electric-website` repo (couldn't create a separate repo from this session). |
| 2026-10-22 | SPEC drafted by Claude from ServiceBox conventions; all [ASSUMPTION] items open. |
| 2026-10-22 | Per-line tax level override instead of per-component non-taxable flags (§5). |
| 2026-10-22 | Quantities are Decimal(12,3); hours are integer hundredths; money integer cents (§4). |
| 2026-10-22 | Global search in Phase 0 is simple substring matching; full-text search comes in Phase 1. |
| 2026-10-22 | Confirmed: 5 customer categories; GST + PST on labour and materials; some customers exempt. |
| 2026-10-22 | Seeded labour rates are the working rates for now (Journeyperson $115, Apprentice $85, Foreman $125, After-hours $172.50). |
| 2026-10-22 | Numbering starts at 1. |
| 2026-10-22 | SSO for any @starelectric.ca account; new users wait as PENDING until an admin assigns a role (replaces "pre-created users only"). |
| 2026-10-22 | Technicians see customer contact info on assigned WOs but never prices (`pricing:view`). |
| 2026-10-22 | ServiceBox CSV import moves into Phase 1. |
| 2026-10-22 | Inventory and material pricing modelled on Trimble Accubid (E/C/M price units, trade price, discount, labour units). |
| 2026-10-22 | No stored sell price on materials: markup is set per quote/invoice (varies with job size and cost changes). |
| 2026-10-22 | Sparks suggests a starting markup from editable tiers by job material cost; users can always override. |
| 2026-10-22 | Migrate all Trimble history (customers, jobs, current projects, inventory); records keep a `legacyRef`. |
| 2026-10-23 | Projects added above work orders: contract, change orders, SOV, progress billing, 10% holdback default. |
| 2026-10-23 | Electricians' time entry and crew schedules move to Phase 2; ServiceBox import covers time and schedules. |
| 2026-10-23 | Default markup tiers set to typical trade values (40/30/20/15% at $0/$1k/$5k/$25k) pending Star's own. |
| 2026-10-23 | Adding/editing employees is admin-only (office can view). Employees and vendors are deactivated, never deleted. |
| 2026-10-23 | All times are Regina time (UTC−6 year-round, no DST). |
| 2026-10-22 | App renamed from "Star FieldOps" to **Sparks**; folder `fieldops/` → `sparks/`. |
| 2026-10-24 | Work order photos and customer signatures: techs add them to assigned, open WOs and may remove only their own photos; only the office removes signatures. |
| 2026-10-26 | **Job numbers** continue Trimble's File # format (year + 3-digit count: 2026211, restarting each January) and are shared by projects and stand-alone work orders; work orders under a project show the project's job number. WO-/P- numbers stay as internal record numbers. The Trimble import moves the year's count past the highest imported job. |
| 2026-10-26 | Trimble data comes from its CSV exports (Customers, Jobs) instead of direct SQL access: re-runnable import (`scripts/import-trimble-csv`). Past invoices import as history marked **Paid** (payments live in accounting); NPR = no PO required (ignored), CANC = cancelled (job Cancelled, invoice Void); Trimble client codes become customer account numbers. The Accubid `.adb` backup can't be read; the inventory comes from the `.xlsx` export. |
| 2026-10-26 | Users and electricians load from a users CSV kept on the PC (`scripts/import-people`): Administrator → ADMIN, Office → OFFICE, Basic User → TECHNICIAN with an employee record. Email defaults to username@starelectric.ca. |
| 2026-10-29 | **Inventory screens pulled forward from Phase 3**: list with Accubid pricing, Import from Accubid in the app (upload → preview of new items and price changes → import; re-runnable, matched by description), a price grid for quick edits, % adjustments by category/search, and a price history per item (`InventoryPriceChange`). Prices over a year old are flagged. Technicians see items and stock, never prices. Stock and purchasing stay in Phase 3. |
