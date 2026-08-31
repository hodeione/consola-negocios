-- AlterTable
ALTER TABLE "businesses" ADD COLUMN     "digitalNeedSignals" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "digitalNeedScore" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "businesses_ownerId_digitalNeedScore_idx" ON "businesses"("ownerId", "digitalNeedScore");
