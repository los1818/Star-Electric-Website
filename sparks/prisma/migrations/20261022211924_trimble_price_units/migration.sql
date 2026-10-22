-- CreateEnum
CREATE TYPE "PriceUnit" AS ENUM ('E', 'C', 'M');

-- AlterTable
ALTER TABLE "InventoryItem" ADD COLUMN     "discountBp" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "laborHours" DECIMAL(10,2),
ADD COLUMN     "laborUnit" "PriceUnit" NOT NULL DEFAULT 'E',
ADD COLUMN     "noLabor" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "priceDate" DATE,
ADD COLUMN     "priceUnit" "PriceUnit" NOT NULL DEFAULT 'E',
ADD COLUMN     "tradePriceCents" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "InvoiceLine" ADD COLUMN     "priceUnit" "PriceUnit" NOT NULL DEFAULT 'E';

-- AlterTable
ALTER TABLE "MaterialUsage" ADD COLUMN     "priceUnit" "PriceUnit" NOT NULL DEFAULT 'E';

-- AlterTable
ALTER TABLE "PurchaseOrderLine" ADD COLUMN     "priceUnit" "PriceUnit" NOT NULL DEFAULT 'E';

-- AlterTable
ALTER TABLE "QuoteLine" ADD COLUMN     "priceUnit" "PriceUnit" NOT NULL DEFAULT 'E';
