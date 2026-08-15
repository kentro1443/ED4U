CREATE TABLE "TeacherProfile" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "responsibilities" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "officeHours" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "bio" TEXT,
  CONSTRAINT "TeacherProfile_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "TeacherBlock" (
  "id" TEXT NOT NULL,
  "teacherProfileId" TEXT NOT NULL,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "reason" TEXT NOT NULL,
  CONSTRAINT "TeacherBlock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TeacherProfile_userId_key" ON "TeacherProfile"("userId");
CREATE INDEX "TeacherProfile_tenantId_idx" ON "TeacherProfile"("tenantId");
CREATE INDEX "TeacherBlock_teacherProfileId_startAt_idx" ON "TeacherBlock"("teacherProfileId", "startAt");
ALTER TABLE "TeacherProfile" ADD CONSTRAINT "TeacherProfile_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeacherProfile" ADD CONSTRAINT "TeacherProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeacherBlock" ADD CONSTRAINT "TeacherBlock_teacherProfileId_fkey" FOREIGN KEY ("teacherProfileId") REFERENCES "TeacherProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
