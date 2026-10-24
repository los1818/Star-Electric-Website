-- DropIndex
DROP INDEX "Attachment_entityType_entityId_idx";

-- AlterTable
ALTER TABLE "Attachment" ADD COLUMN     "caption" TEXT,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'DOCUMENT',
ADD COLUMN     "signerName" TEXT;

-- CreateIndex
CREATE INDEX "Attachment_entityType_entityId_kind_idx" ON "Attachment"("entityType", "entityId", "kind");

