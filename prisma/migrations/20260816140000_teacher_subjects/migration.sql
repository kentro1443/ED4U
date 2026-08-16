-- Subject codes a teacher actually teaches.
--
-- Routing previously had no subject signal at all, so "em cần giúp môn Hóa"
-- could only fall back to the broad ACADEMIC responsibility and returned
-- teachers of every subject. Additive and backfilled to the empty array, which
-- routing reads as "not recorded" rather than "teaches everything".
ALTER TABLE "TeacherProfile" ADD COLUMN "subjects" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
