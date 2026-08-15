CREATE TABLE "AuthThrottle" (
  "key" TEXT NOT NULL,
  "failures" INTEGER NOT NULL DEFAULT 0,
  "windowStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lockedUntil" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthThrottle_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "AuthThrottle_updatedAt_idx" ON "AuthThrottle"("updatedAt");
