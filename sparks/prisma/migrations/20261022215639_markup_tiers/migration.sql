-- CreateTable
CREATE TABLE "MarkupTier" (
    "id" TEXT NOT NULL,
    "minMaterialCostCents" INTEGER NOT NULL,
    "markupBp" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarkupTier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarkupTier_minMaterialCostCents_key" ON "MarkupTier"("minMaterialCostCents");
