-- Preserve the recommendation provenance of a concrete mentor booking while
-- allowing historical runs to be removed without destroying the booking.
CREATE INDEX "MentorBooking_recommendationRunId_idx"
ON "MentorBooking"("recommendationRunId");

ALTER TABLE "MentorBooking"
ADD CONSTRAINT "MentorBooking_recommendationRunId_fkey"
FOREIGN KEY ("recommendationRunId") REFERENCES "MentorRecommendationRun"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
