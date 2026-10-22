# Star FieldOps — Specification

**Status: DRAFT v0.2, written by Claude because no SPEC.md was supplied.**
It is modelled on ServiceBox and adjusted for commercial electrical contracting. Anything marked
**[ASSUMPTION]** needs confirmation from Star Electric before the phase that depends on it.

---

## 1. Purpose
Star FieldOps replaces ServiceBox (day-to-day service and work orders) and the older Trimble
Time & Material Billing (historical T&M jobs and billing data) with one in-house system for
Star Electric Corp., Regina, SK. Users are office staff, administrators, and field technicians
(electricians and apprentices), who will mostly use phones or tablets.

## 2. Users and roles
| Role | Summary |
|---|---|
| **Administrator** | Everything, including Settings, users/roles, deleting records, and financial reports. |
| **Office** | Customers, job sites, work orders, dispatch, quotes, invoices, POs, inventory, timesheet approval. No Settings or user management. Can't delete posted invoices. |
| **Technician** | Sees work orders assigned to them (and their job sites/customer contact info), enters their own time and materials, adds notes, photos and signatures. No pricing beyond what's on their WO, no invoices, quotes, or settings. |

Microsoft Entra ID sign-in is limited to users an administrator has already created (matched by email). A dev-only
email login exists outside production builds. Permissions are defined in code as a role → permission map (`customers:read`, `invoices:write`,
`settings:manage`, ...) and enforced on every server action. **[ASSUMPTION]** Three fixed roles
are enough for now; per-user permission overrides can come later.

## 3. Modules (left sidebar)
In order:
1. **Dashboard**: today's work, overdue WOs, unbilled work, open quotes
2. **Dispatch Board**: schedule/assign WOs to technicians (calendar + map)
3. **Work Orders**
4. **Customers**
5. **Job Sites**
6. **Quotes**
7. **Invoices**
8. **Purchase Orders**
9. **Inventory**: items, stock by location (warehouse, trucks)
10. **Equipment**: customer-owned equipment at sites (panels, transformers, generators, UPS, lighting controls), with service history
11. **Service Agreements**: recurring maintenance contracts that spawn WOs (e.g. annual IR scans, emergency lighting tests)
12. **Timesheets**
13. **Employees**
14. **Vendors**
15. **Reports**
16. **Settings**: lookup tables, tax levels, company info, users

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
- `CustomerCategory`: seeded: Commercial, Industrial, Institutional, Property Management, General Contractor **[ASSUMPTION: these are the 5 categories]**
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
- `Customer`: name, category, billing address, phone, email, payment term, default tax level, notes, active, credit hold
- `Contact`: belongs to customer and optionally job site; name, title, phone, email, isPrimary
- `JobSite`: belongs to customer; name, address, lat/lng, access notes, default tax level
- `Employee`: name, trade (Journeyperson/Apprentice level), phone, email, default labour rate, active
- `Vendor`: name, contact, phone, email, account number
- `WorkOrder`: number, customer, job site, type, status, priority, description, requested/scheduled dates, assigned employees (`WorkOrderAssignment`), PO number from customer, not-to-exceed amount, tax level
- `WorkOrderNote`: text, author, internal/customer-visible
- `TimeEntry` (timesheet line): employee, date, work order (optional for shop time), item type, hours (in hundredths), labour rate, approved by/at
- `MaterialUsage`: work order, inventory item (or free text), qty, unit cost, unit price, from location
- `Quote` + `QuoteLine`: number, customer, job site, status, valid until, lines (labour/material/other), tax level, totals
- `Invoice` + `InvoiceLine`: number, customer, job site, work order(s), status, dates, terms, lines, totals, amount paid; credit notes point at the invoice they credit
- `InvoiceTax`: per-component tax breakdown, frozen when the invoice is posted
- `Payment`: invoice, date, amount, method, reference
- `InventoryItem`: SKU, description, category, UoM, cost, sell price, reorder point, active
- `InventoryLocation`: warehouse or truck (linked to employee)
- `StockLevel`: item × location quantity
- `PurchaseOrder` + `PurchaseOrderLine`: vendor, status, work order (optional), lines, received qty
- `Equipment`: job site, type, make, model, serial, rating (voltage/amps/kVA), install date
- `ServiceAgreement`: customer, sites, frequency, next due, price, WO template
- `Attachment`: polymorphic (entity type + id), file key, uploaded by
- `AuditLog`: user, action, entity, entity id, diff JSON
- `RecentItem`: user, entity type, entity id, label, viewedAt

**Migration staging**: `ImportBatch` plus one generic `StgTrimbleRow` table (source table, source key, raw row as JSON,
status, mapped entity/id). Generic because the Trimble table list isn't known yet.

## 5. Business rules
### Money and tax
- All amounts are integer cents. Line total = round(qty × unit price) using half-up rounding.
- Tax is computed **per invoice per tax component** on the sum of taxable lines, then rounded
  half-up to the cent. (Not per line.) **[ASSUMPTION]**
- Saskatchewan: GST 5% (federal), PST 6% (provincial). Tax levels are configurable rows; rates
  are never in code. **[ASSUMPTION: whether PST applies to labour on Star's service work,
  and how contracts for real property (contractor pays PST on materials) are handled, must be
  confirmed with Star's accountant.]**
- Each quote/invoice/PO line can override the document's tax level (e.g. labour "GST only", materials "GST + PST").
  Tax per component is computed on the sum of the lines that carry that component.
- A document discount reduces each component's taxable base in proportion to that base's share of the subtotal.
- Discounts: percentage or fixed, applied before tax.

### Numbering
- WO-000001, Q-000001, INV-000001, PO-000001, from the `Sequence` table, assigned inside a
  transaction. Starting numbers are configurable so they can continue on from ServiceBox.

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

## 6. Integrations (later phases)
- Microsoft Entra ID SSO (Phase 0)
- Accounting export (QuickBooks/Sage?) **[ASSUMPTION: TBD]**
- Trimble T&M Billing data migration from SQL Server (stub in Phase 0, real mapping later)
- ServiceBox data import (CSV export)

## 7. Phased plan
- **Phase 0: Foundation.** Scaffold, full schema, auth + roles, app shell, seed data, lookup
  tables, Trimble ETL stub, tests.
- **Phase 1: Core records.** Customers, contacts, job sites, employees, vendors; Settings UI for lookups; global search; recent items.
- **Phase 2: Work orders and dispatch.** WO CRUD, lifecycle, dispatch board, technician mobile view, notes/photos/signature.
- **Phase 3: Time and materials.** Timesheets, approvals, material usage, inventory and stock, POs.
- **Phase 4: Quoting and invoicing.** Quotes → WO, invoices from WOs, payments, PDFs, email.
- **Phase 5: Equipment and service agreements.** Recurring WO generation.
- **Phase 6: Reports, accounting export, data migration** (Trimble + ServiceBox), go-live.

## 8. Decision log
| Date | Decision |
|---|---|
| 2026-10-22 | App lives in `fieldops/` in the `star-electric-website` repo (couldn't create a separate repo from this session). |
| 2026-10-22 | SPEC drafted by Claude from ServiceBox conventions; all [ASSUMPTION] items open. |
| 2026-10-22 | Per-line tax level override instead of per-component non-taxable flags (§5). |
| 2026-10-22 | Quantities are Decimal(12,3); hours are integer hundredths; money integer cents (§4). |
| 2026-10-22 | SSO users must be pre-created by an admin; no self-sign-up (§2). |
| 2026-10-22 | Global search in Phase 0 is simple substring matching; full-text search comes in Phase 1. |
