-- AlterTable
ALTER TABLE "InventoryItem" DROP COLUMN "priceCents";

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "materialMarkupBp" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "MaterialUsage" ALTER COLUMN "unitPriceCents" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Quote" ADD COLUMN     "materialMarkupBp" INTEGER NOT NULL DEFAULT 0;

