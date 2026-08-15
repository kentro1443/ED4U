ALTER TABLE "RoomRequest"
  ADD COLUMN "purpose" TEXT,
  ADD COLUMN "decisionReason" TEXT,
  ADD COLUMN "resolvedBy" TEXT,
  ADD COLUMN "resolvedAt" TIMESTAMP(3);
