-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "legacyRef" TEXT;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "legacyRef" TEXT;

-- AlterTable
ALTER TABLE "Employee" ADD COLUMN     "legacyRef" TEXT;

-- AlterTable
ALTER TABLE "Equipment" ADD COLUMN     "legacyRef" TEXT;

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "legacyRef" TEXT;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "legacyRef" TEXT;

-- AlterTable
ALTER TABLE "JobSite" ADD COLUMN     "legacyRef" TEXT;

-- AlterTable
ALTER TABLE "MaterialUsage" ADD COLUMN     "legacyRef" TEXT;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "legacyRef" TEXT;

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "legacyRef" TEXT;

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "legacyRef" TEXT;

-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN     "legacyRef" TEXT;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "legacyRef" TEXT;

-- AlterTable
ALTER TABLE "WorkOrder" ADD COLUMN     "legacyRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Contact_legacyRef_key" ON "Contact"("legacyRef");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_legacyRef_key" ON "Customer"("legacyRef");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_legacyRef_key" ON "Employee"("legacyRef");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_legacyRef_key" ON "Equipment"("legacyRef");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryItem_legacyRef_key" ON "InventoryItem"("legacyRef");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_legacyRef_key" ON "Invoice"("legacyRef");

-- CreateIndex
CREATE UNIQUE INDEX "JobSite_legacyRef_key" ON "JobSite"("legacyRef");

-- CreateIndex
CREATE UNIQUE INDEX "MaterialUsage_legacyRef_key" ON "MaterialUsage"("legacyRef");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_legacyRef_key" ON "Payment"("legacyRef");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_legacyRef_key" ON "PurchaseOrder"("legacyRef");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_legacyRef_key" ON "Quote"("legacyRef");

-- CreateIndex
CREATE UNIQUE INDEX "TimeEntry_legacyRef_key" ON "TimeEntry"("legacyRef");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_legacyRef_key" ON "Vendor"("legacyRef");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_legacyRef_key" ON "WorkOrder"("legacyRef");

