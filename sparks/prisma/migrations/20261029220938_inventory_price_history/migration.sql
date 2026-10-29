-- CreateTable
CREATE TABLE "InventoryPriceChange" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "note" TEXT,
    "oldTradePriceCents" INTEGER NOT NULL,
    "newTradePriceCents" INTEGER NOT NULL,
    "oldDiscountBp" INTEGER NOT NULL,
    "newDiscountBp" INTEGER NOT NULL,
    "oldCostCents" INTEGER NOT NULL,
    "newCostCents" INTEGER NOT NULL,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryPriceChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryPriceChange_itemId_createdAt_idx" ON "InventoryPriceChange"("itemId", "createdAt");

-- AddForeignKey
ALTER TABLE "InventoryPriceChange" ADD CONSTRAINT "InventoryPriceChange_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryPriceChange" ADD CONSTRAINT "InventoryPriceChange_changedById_fkey" FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

