/*
  Warnings:

  - You are about to drop the column `slot` on the `MentorBooking` table. All the data in the column will be lost.
  - Added the required column `endAt` to the `MentorBooking` table without a default value. This is not possible if the table is not empty.
  - Added the required column `slotPattern` to the `MentorBooking` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startAt` to the `MentorBooking` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "MentorBooking" DROP COLUMN "slot",
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "endAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "recommendationRunId" TEXT,
ADD COLUMN     "slotPattern" TEXT NOT NULL,
ADD COLUMN     "startAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "MentorBooking_tenantId_mentorId_startAt_idx" ON "MentorBooking"("tenantId", "mentorId", "startAt");

-- CreateIndex
CREATE INDEX "MentorBooking_studentId_idx" ON "MentorBooking"("studentId");
