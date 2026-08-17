-- CreateEnum
CREATE TYPE "TimeEntryType" AS ENUM ('WORK', 'VACATION', 'ABSENCE');

-- AlterTable
ALTER TABLE "time_entries" ADD COLUMN "type" "TimeEntryType" NOT NULL DEFAULT 'WORK';
ALTER TABLE "time_entries" ADD COLUMN "note" TEXT NOT NULL DEFAULT '';
