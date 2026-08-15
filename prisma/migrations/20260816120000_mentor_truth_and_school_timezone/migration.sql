-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED');

-- AlterTable
ALTER TABLE "MentorProfile" DROP COLUMN "skills",
ADD COLUMN     "achievements" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "bio" TEXT,
ADD COLUMN     "credentialsCheckedDomains" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "hskLevel" INTEGER,
ADD COLUMN     "ieltsListening" DOUBLE PRECISION,
ADD COLUMN     "ieltsOverall" DOUBLE PRECISION,
ADD COLUMN     "ieltsReading" DOUBLE PRECISION,
ADD COLUMN     "ieltsSpeaking" DOUBLE PRECISION,
ADD COLUMN     "ieltsWriting" DOUBLE PRECISION,
ADD COLUMN     "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "rating" DOUBLE PRECISION,
ADD COLUMN     "ratingCount" INTEGER,
ADD COLUMN     "satMath" INTEGER,
ADD COLUMN     "satReadingWriting" INTEGER,
ADD COLUMN     "satTotal" INTEGER,
ADD COLUMN     "school" TEXT,
ADD COLUMN     "sessionsCompleted" INTEGER,
ADD COLUMN     "teachingExperienceMonths" INTEGER,
ADD COLUMN     "teachingStyles" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "dateOfBirth" DATE,
ADD COLUMN     "gender" "Gender";

-- CreateIndex
CREATE UNIQUE INDEX "MentorProfile_userId_key" ON "MentorProfile"("userId");

-- CreateIndex
CREATE INDEX "MentorProfile_tenantId_idx" ON "MentorProfile"("tenantId");

-- AddForeignKey
ALTER TABLE "MentorProfile" ADD CONSTRAINT "MentorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
