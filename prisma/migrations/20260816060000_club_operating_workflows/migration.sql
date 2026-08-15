ALTER TABLE "Club"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "proposedBy" TEXT,
  ADD COLUMN "decisionReason" TEXT,
  ADD COLUMN "approvedBy" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "ClubMembership_clubId_userId_key" ON "ClubMembership"("clubId", "userId");

CREATE TABLE "ClubAdvisor" (
  "id" TEXT NOT NULL,
  "clubId" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "addedBy" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClubAdvisor_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClubAdvisor_clubId_teacherId_key" ON "ClubAdvisor"("clubId", "teacherId");
ALTER TABLE "ClubAdvisor" ADD CONSTRAINT "ClubAdvisor_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FinanceEntry"
  ADD COLUMN "voidedBy" TEXT,
  ADD COLUMN "voidReason" TEXT,
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "ClubEvent" ADD COLUMN "roomRequestId" TEXT;
CREATE UNIQUE INDEX "ClubEvent_roomRequestId_key" ON "ClubEvent"("roomRequestId");
ALTER TABLE "ClubEvent" ADD CONSTRAINT "ClubEvent_roomRequestId_fkey" FOREIGN KEY ("roomRequestId") REFERENCES "RoomRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
