-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('LANDING', 'SEO', 'ECOMMERCE', 'SAAS', 'CUSTOM', 'OTHER');

-- AlterTable: pipeline de ventas
ALTER TABLE "businesses" ADD COLUMN "dealValue" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "businesses" ADD COLUMN "product" "ProductType";
ALTER TABLE "businesses" ADD COLUMN "closedAt" TIMESTAMP(3);

-- AlterTable: frescura de datos — se añade nullable, se rellena con
-- createdAt para las filas existentes, y luego se cierra a NOT NULL.
ALTER TABLE "businesses" ADD COLUMN "lastVerifiedAt" TIMESTAMP(3);
UPDATE "businesses" SET "lastVerifiedAt" = "createdAt" WHERE "lastVerifiedAt" IS NULL;
ALTER TABLE "businesses" ALTER COLUMN "lastVerifiedAt" SET NOT NULL;
ALTER TABLE "businesses" ALTER COLUMN "lastVerifiedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- CreateTable: auditoría de cambios de gestión
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_logs_businessId_createdAt_idx" ON "audit_logs"("businessId", "createdAt");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
