-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'AGENT');

-- CreateEnum
CREATE TYPE "BatchJobStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE');

-- CreateEnum
CREATE TYPE "ScrapeTaskStatus" AS ENUM ('PENDING', 'COLLECTING', 'DETAILING', 'ENRICHING', 'DONE', 'ERROR', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CallStatus" AS ENUM ('PENDING', 'NO_ANSWER', 'CALLBACK_LATER', 'INTERESTED', 'NOT_INTERESTED', 'CUSTOMER', 'INVALID_NUMBER');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'AGENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_jobs" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "keywords" TEXT[],
    "zones" TEXT[],
    "maxResultsPerCombo" INTEGER NOT NULL DEFAULT 60,
    "language" TEXT NOT NULL DEFAULT 'es',
    "status" "BatchJobStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "batch_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scrape_tasks" (
    "id" TEXT NOT NULL,
    "batchJobId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "maxResults" INTEGER NOT NULL DEFAULT 60,
    "language" TEXT NOT NULL DEFAULT 'es',
    "status" "ScrapeTaskStatus" NOT NULL DEFAULT 'PENDING',
    "cursor" JSONB NOT NULL DEFAULT '{}',
    "foundCount" INTEGER NOT NULL DEFAULT 0,
    "totalCount" INTEGER NOT NULL DEFAULT 0,
    "message" TEXT NOT NULL DEFAULT '',
    "error" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scrape_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "businesses" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "assignedToUserId" TEXT,
    "sourceTaskId" TEXT,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL DEFAULT '',
    "mapsPhone" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "emails" TEXT[],
    "webPhones" TEXT[],
    "rating" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "category" TEXT NOT NULL DEFAULT '',
    "zone" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "status" "CallStatus" NOT NULL DEFAULT 'PENDING',
    "priority" "Priority" NOT NULL DEFAULT 'MEDIUM',
    "contactName" TEXT NOT NULL DEFAULT '',
    "contactRole" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[],
    "nextFollowUpAt" TIMESTAMP(3),
    "lastCalledAt" TIMESTAMP(3),
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "businesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_activities" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "outcome" "CallStatus" NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_activities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "batch_jobs_ownerId_idx" ON "batch_jobs"("ownerId");

-- CreateIndex
CREATE INDEX "scrape_tasks_ownerId_status_idx" ON "scrape_tasks"("ownerId", "status");

-- CreateIndex
CREATE INDEX "scrape_tasks_batchJobId_idx" ON "scrape_tasks"("batchJobId");

-- CreateIndex
CREATE INDEX "businesses_ownerId_status_idx" ON "businesses"("ownerId", "status");

-- CreateIndex
CREATE INDEX "businesses_assignedToUserId_status_idx" ON "businesses"("assignedToUserId", "status");

-- CreateIndex
CREATE INDEX "businesses_ownerId_nextFollowUpAt_idx" ON "businesses"("ownerId", "nextFollowUpAt");

-- CreateIndex
CREATE INDEX "businesses_zone_idx" ON "businesses"("zone");

-- CreateIndex
CREATE UNIQUE INDEX "businesses_ownerId_dedupeKey_key" ON "businesses"("ownerId", "dedupeKey");

-- CreateIndex
CREATE INDEX "call_activities_businessId_idx" ON "call_activities"("businessId");

-- AddForeignKey
ALTER TABLE "batch_jobs" ADD CONSTRAINT "batch_jobs_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrape_tasks" ADD CONSTRAINT "scrape_tasks_batchJobId_fkey" FOREIGN KEY ("batchJobId") REFERENCES "batch_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scrape_tasks" ADD CONSTRAINT "scrape_tasks_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_assignedToUserId_fkey" FOREIGN KEY ("assignedToUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "businesses" ADD CONSTRAINT "businesses_sourceTaskId_fkey" FOREIGN KEY ("sourceTaskId") REFERENCES "scrape_tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_activities" ADD CONSTRAINT "call_activities_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "businesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_activities" ADD CONSTRAINT "call_activities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
