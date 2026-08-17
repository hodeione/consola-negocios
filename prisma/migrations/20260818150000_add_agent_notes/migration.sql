-- CreateTable
CREATE TABLE "agent_notes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_notes_userId_createdAt_idx" ON "agent_notes"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "agent_notes" ADD CONSTRAINT "agent_notes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_notes" ADD CONSTRAINT "agent_notes_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
