-- AlterEnum (must commit before 'PENDING' can be used as a default; see next migration)
ALTER TYPE "Role" ADD VALUE 'PENDING' BEFORE 'ADMIN';

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "taxExemptNumber" TEXT;
