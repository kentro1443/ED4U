ALTER TABLE "Application"
  ADD COLUMN "transferReason" TEXT,
  ADD COLUMN "reviewNote" TEXT;

ALTER TABLE "Appointment"
  ADD COLUMN "proposedStartAt" TIMESTAMP(3),
  ADD COLUMN "proposedEndAt" TIMESTAMP(3),
  ADD COLUMN "responseNote" TEXT;
