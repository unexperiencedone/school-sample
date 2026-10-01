-- AlterEnum
ALTER TYPE "StudentStatus" ADD VALUE 'PROSPECTIVE';

-- AlterTable
ALTER TABLE "Application" ADD COLUMN     "decisionMessage" TEXT,
ADD COLUMN     "declarationAt" TIMESTAMP(3),
ADD COLUMN     "offerExpiresAt" TIMESTAMP(3),
ADD COLUMN     "scholarshipInterest" BOOLEAN NOT NULL DEFAULT false;
