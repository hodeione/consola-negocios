-- AlterTable
ALTER TABLE "businesses" ADD COLUMN "mapsUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "businesses" ADD COLUMN "flaggedIncorrect" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "businesses" ADD COLUMN "flaggedIncorrectNote" TEXT NOT NULL DEFAULT '';
