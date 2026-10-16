-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "hasOnlineBooking" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasOnlineShop" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "legalOwnerName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "legalOwnerType" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "legalTaxId" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "socialLinks" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "webCopyrightYear" INTEGER,
ADD COLUMN     "webInsightsAt" TIMESTAMP(3),
ADD COLUMN     "webTech" TEXT NOT NULL DEFAULT '';

