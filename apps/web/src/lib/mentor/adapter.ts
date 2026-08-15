/**
 * The one place ED4U database rows become canonical mentor candidates for the
 * Mentor Intelligence Engine.
 *
 * Three rules this module exists to enforce:
 *
 * 1. **Nothing is invented.** Every value comes from a column. A mentor whose
 *    record cannot produce a required field is *rejected with a reason*, never
 *    patched with a plausible-looking default. The prototype fabricated
 *    `birthYear: 2000`, IELTS 8.0 across all sections and `rating: 4.6` inline
 *    in the page; that is what this replaces.
 * 2. **The three-valued credential contract survives the database.** UNKNOWN,
 *    KNOWN ABSENT and KNOWN PRESENT are distinguished by
 *    `MentorProfile.credentialsCheckedDomains`, not by column nullability alone
 *    — a `NULL` score in a domain nobody checked is UNKNOWN, and emitting it as
 *    `null` would assert an absence we never observed.
 * 3. **Only engine fields cross the boundary.** `headline`, `ratingCount`,
 *    `graduationYear`, `tenantId` and the user's identity stay behind. The
 *    canonical schema is strict, so a leak is a loud failure rather than a
 *    quiet one — but it should not get that far.
 *
 * Callers still run `validateMentors` on the output: this adapter maps, the
 * engine's own schema judges.
 */

import type { Credentials } from "@ed4u/mentor-engine";
import type { Gender, MentorProfile, User } from "@/generated/prisma/client";

/**
 * What the adapter produces: the canonical field set, but with the database's
 * plain `string`s where the engine uses closed vocabularies.
 *
 * It is deliberately *not* typed as `Mentor`. Claiming that type would need a
 * cast, and a cast is exactly how an unvalidated `"IELTS.WRTIING"` reaches the
 * ranker. `validateMentors` is the judge; this module only maps.
 */
export interface CanonicalMentorCandidate {
  id: string;
  name: string;
  birthYear: number;
  verified: boolean;
  credentials: Credentials;
  expertise: string[];
  availability: string[];
  pricePerHour: number;
  gender?: string;
  school?: string;
  bio?: string;
  teachingExperienceMonths?: number;
  sessionsCompleted?: number;
  rating?: number;
  teachingStyles?: string[];
  languages?: string[];
  achievements?: string[];
}

/** A profile joined to the user it belongs to — the only shape this adapter maps. */
export type MentorProfileRow = MentorProfile & {
  user: Pick<User, "id" | "fullName" | "dateOfBirth" | "gender">;
};

/** A mentor that could not be represented canonically, and why. */
export interface MentorAdaptationFailure {
  mentorId: string;
  /** Name when we have one; falls back to the id only for a truly broken row. */
  displayName: string;
  /** Operator-facing reasons, one per missing or malformed field. */
  reasons: string[];
}

export interface MentorAdaptationResult {
  /** Rows that mapped cleanly. Still unvalidated — pass to `validateMentors`. */
  mentors: CanonicalMentorCandidate[];
  /** Rows deliberately excluded. Surface these; do not silently drop them. */
  failures: MentorAdaptationFailure[];
}

/**
 * Derives the birth year the engine consumes from a real date of birth.
 *
 * `dateOfBirth` is stored as a DATE, so the calendar year is read in UTC to
 * match how Prisma materialises it — no timezone shift can move it.
 */
export function birthYearFromDateOfBirth(dateOfBirth: Date): number {
  return dateOfBirth.getUTCFullYear();
}

/** Maps the storage enum onto the engine's vocabulary. */
const GENDER_BY_COLUMN: Record<Gender, string> = {
  FEMALE: "female",
  MALE: "male",
  OTHER: "other",
  UNDISCLOSED: "undisclosed",
};

/**
 * Builds the credential set, preserving all three knowledge states.
 *
 * A domain absent from `credentialsCheckedDomains` yields an omitted key. A
 * checked domain with no score yields `null`. Anything else is a real
 * credential built from its columns.
 */
function toCredentials(row: MentorProfile): Credentials {
  const checked = new Set(row.credentialsCheckedDomains);
  const credentials: Credentials = {};

  if (checked.has("IELTS")) {
    credentials.ielts =
      row.ieltsOverall === null
        ? null
        : {
            overall: row.ieltsOverall,
            // Section bands are individually optional: a profile may publish
            // only the overall band.
            ...(row.ieltsListening !== null ? { listening: row.ieltsListening } : {}),
            ...(row.ieltsReading !== null ? { reading: row.ieltsReading } : {}),
            ...(row.ieltsWriting !== null ? { writing: row.ieltsWriting } : {}),
            ...(row.ieltsSpeaking !== null ? { speaking: row.ieltsSpeaking } : {}),
          };
  }

  if (checked.has("SAT")) {
    credentials.sat =
      row.satTotal === null
        ? null
        : {
            total: row.satTotal,
            ...(row.satMath !== null ? { math: row.satMath } : {}),
            ...(row.satReadingWriting !== null ? { readingWriting: row.satReadingWriting } : {}),
          };
  }

  if (checked.has("HSK")) {
    credentials.hsk = row.hskLevel === null ? null : { level: row.hskLevel };
  }

  return credentials;
}

/**
 * Maps one row into the canonical shape.
 *
 * @returns The mentor, or a failure naming every field that made the row
 *   unusable. Never a partially fabricated mentor.
 */
export function toCanonicalMentor(
  row: MentorProfileRow,
): CanonicalMentorCandidate | MentorAdaptationFailure {
  const reasons: string[] = [];

  const name = row.user.fullName.trim();
  if (name === "") {
    reasons.push("Hồ sơ người dùng không có họ tên.");
  }
  if (row.user.dateOfBirth === null) {
    // The engine requires a birth year. We do not have one, and guessing it
    // would make every age-related explanation a fiction.
    reasons.push("Người dùng chưa có ngày sinh, không thể suy ra năm sinh.");
  }
  if (row.expertise.length === 0) {
    reasons.push("Mentor chưa khai báo lĩnh vực chuyên môn.");
  }

  if (reasons.length > 0 || row.user.dateOfBirth === null) {
    return {
      mentorId: row.id,
      displayName: name === "" ? row.id : name,
      reasons,
    };
  }

  return {
    id: row.id,
    name,
    birthYear: birthYearFromDateOfBirth(row.user.dateOfBirth),
    verified: row.verified,
    credentials: toCredentials(row),
    expertise: row.expertise,
    availability: row.availability,
    pricePerHour: row.pricePerHour,

    // Optional fields. An absent column stays absent: omitting the key means
    // "unknown", which is what the engine's missing-data policy expects.
    ...(row.user.gender !== null ? { gender: GENDER_BY_COLUMN[row.user.gender] } : {}),
    ...(row.school !== null ? { school: row.school } : {}),
    ...(row.bio !== null ? { bio: row.bio } : {}),
    ...(row.teachingExperienceMonths !== null
      ? { teachingExperienceMonths: row.teachingExperienceMonths }
      : {}),
    ...(row.sessionsCompleted !== null ? { sessionsCompleted: row.sessionsCompleted } : {}),
    ...(row.rating !== null ? { rating: row.rating } : {}),
    // Empty arrays mean "nothing declared", which is not the same as a declared
    // empty set; the key is omitted so the engine treats it as unknown.
    ...(row.teachingStyles.length > 0 ? { teachingStyles: row.teachingStyles } : {}),
    ...(row.languages.length > 0 ? { languages: row.languages } : {}),
    ...(row.achievements.length > 0 ? { achievements: row.achievements } : {}),
  };
}

/** Maps a set of rows, keeping the usable and the unusable clearly apart. */
export function toCanonicalMentors(rows: readonly MentorProfileRow[]): MentorAdaptationResult {
  const mentors: CanonicalMentorCandidate[] = [];
  const failures: MentorAdaptationFailure[] = [];
  for (const row of rows) {
    const mapped = toCanonicalMentor(row);
    if ("reasons" in mapped) {
      failures.push(mapped);
    } else {
      mentors.push(mapped);
    }
  }
  return { mentors, failures };
}

/** The join every caller needs so identity is read from `User`, not guessed. */
export const MENTOR_PROFILE_INCLUDE = {
  user: { select: { id: true, fullName: true, dateOfBirth: true, gender: true } },
} as const;
