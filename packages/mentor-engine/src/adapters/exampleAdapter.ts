/**
 * A worked adapter example, using plain TypeScript stand-ins for a database.
 *
 * The mock row types below deliberately look like something an ORM would give
 * you — nullable columns, denormalised strings, a separate availability table —
 * without importing Prisma, Next.js or Supabase. Nothing web-framework-shaped
 * may enter the core package, so the example ships types it defines itself.
 *
 * Read this for the *decisions*, not the field names. Three of them matter:
 *
 * 1. **`NULL` in a column is usually UNKNOWN, not ABSENT.** A database that has
 *    never been told a mentor's IELTS band stores `NULL`, which means "we do not
 *    know" — the key is omitted. Only an explicit "this mentor holds no IELTS
 *    certificate" flag justifies emitting `null`. The example carries a
 *    `credentialsConfirmedAt` column precisely so it can tell those apart.
 * 2. **Vocabulary is translated, not passed through.** Host strings go through
 *    the same canonicalizer everything else uses, so a typo becomes a visible
 *    failure rather than a silently dropped skill.
 * 3. **Tenant, auth and analytics fields stay out.** They are the server's
 *    business; the engine never sees them, so it cannot accidentally rank on
 *    them.
 */

import { canonicalizeAvailabilitySlot, canonicalizeSkill } from "../normalization/canonicalizer.js";
import type { Mentor } from "../schemas/mentor.js";
import type { StudentRequest } from "../schemas/request.js";
import type { Domain, Skill } from "../schemas/validation.js";
import type { MentorDataAdapter, RequestDataAdapter } from "./types.js";

/* -------------------------------------------------------------------------- */
/* Mock host types                                                            */
/* -------------------------------------------------------------------------- */

/** A mentor row as a typical ORM would hand it over. */
export interface MockMentorRow {
  id: string;
  /** Tenant/organisation the row belongs to. Never reaches the engine. */
  tenantId: string;
  fullName: string;
  birthYear: number;
  identityVerifiedAt: string | null;
  /**
   * When the mentor's credentials were last confirmed.
   *
   * `null` means nobody has checked, which is what lets this adapter tell
   * UNKNOWN from ABSENT.
   */
  credentialsConfirmedAt: string | null;
  ieltsOverall: number | null;
  ieltsListening: number | null;
  ieltsReading: number | null;
  ieltsWriting: number | null;
  ieltsSpeaking: number | null;
  satTotal: number | null;
  satMath: number | null;
  satReadingWriting: number | null;
  hskLevel: number | null;
  /** Free-text skills as entered in the admin UI. */
  teachesSkills: string[];
  /** Weekly availability rows, joined in. */
  availability: { weekday: string; startTime: string }[];
  hourlyRateVnd: number;
  monthsTeaching: number | null;
  completedSessions: number | null;
  averageRating: number | null;
  teachingStyleTags: string[] | null;
  /** Internal analytics that must not influence matching. */
  lastLoginAt: string | null;
  profileViews: number;
}

/** A student request as the web layer would hand it over. */
export interface MockRequestRow {
  id: string;
  tenantId: string;
  /** Student identity — deliberately never forwarded to the engine. */
  studentEmail: string;
  examType: string;
  currentScore: number | null;
  targetScore: number | null;
  focusSkills: string[];
  requireVerified: boolean;
  budgetPerHourVnd: number | null;
  minimumCredential: number | null;
  availability: { weekday: string; startTime: string }[];
  preferredStyles: string[];
  freeTextNotes: string | null;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Maps host domain strings onto the canonical vocabulary. */
function toDomain(examType: string): Domain {
  const upper = examType.trim().toUpperCase();
  if (upper === "IELTS" || upper === "SAT" || upper === "HSK") return upper;
  // Deliberately not defaulted: an unknown exam must fail validation loudly
  // rather than quietly becoming IELTS.
  return upper as Domain;
}

/**
 * Canonicalises host skill strings, dropping nothing silently.
 *
 * An unmappable skill is passed through unchanged so `validateMentor` rejects
 * the record and names the field, instead of the mentor quietly losing a skill.
 */
function toSkills(raw: readonly string[], domain?: Domain): Skill[] {
  return raw.map((entry) => {
    const outcome = canonicalizeSkill(entry, domain);
    return (outcome.kind === "MATCH" ? outcome.canonical : entry) as Skill;
  });
}

/** Converts joined availability rows into canonical weekly slots. */
function toSlots(rows: readonly { weekday: string; startTime: string }[]): string[] {
  return rows.map((row) => {
    const outcome = canonicalizeAvailabilitySlot(`${row.weekday} ${row.startTime}`);
    return outcome.kind === "MATCH" ? outcome.canonical : `${row.weekday} ${row.startTime}`;
  });
}

/**
 * Builds the IELTS credential, preserving the three-valued distinction.
 *
 * @param row - The host row.
 * @param confirmed - Whether credentials have ever been checked for this mentor.
 * @returns The credential, `null` for known-absent, or `undefined` for unknown.
 */
function toIelts(
  row: MockMentorRow,
  confirmed: boolean,
): { overall: number; listening?: number; reading?: number; writing?: number; speaking?: number } | null | undefined {
  if (row.ieltsOverall === null) {
    // Confirmed profile with no IELTS row = they hold none. Unconfirmed = we
    // simply have not been told, which is a different fact.
    return confirmed ? null : undefined;
  }

  return {
    overall: row.ieltsOverall,
    ...(row.ieltsListening === null ? {} : { listening: row.ieltsListening }),
    ...(row.ieltsReading === null ? {} : { reading: row.ieltsReading }),
    ...(row.ieltsWriting === null ? {} : { writing: row.ieltsWriting }),
    ...(row.ieltsSpeaking === null ? {} : { speaking: row.ieltsSpeaking }),
  };
}

/** Builds the SAT credential with the same three-valued rule. */
function toSat(
  row: MockMentorRow,
  confirmed: boolean,
): { total: number; math?: number; readingWriting?: number } | null | undefined {
  if (row.satTotal === null) return confirmed ? null : undefined;
  return {
    total: row.satTotal,
    ...(row.satMath === null ? {} : { math: row.satMath }),
    ...(row.satReadingWriting === null ? {} : { readingWriting: row.satReadingWriting }),
  };
}

/** Builds the HSK credential with the same three-valued rule. */
function toHsk(row: MockMentorRow, confirmed: boolean): { level: number } | null | undefined {
  if (row.hskLevel === null) return confirmed ? null : undefined;
  return { level: row.hskLevel };
}

/* -------------------------------------------------------------------------- */
/* Adapters                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Turns mock database rows into canonical mentors.
 *
 * A real ED4U adapter would look almost exactly like this, with Prisma types
 * in place of {@link MockMentorRow} — and would still live in the server, not in
 * this package.
 */
export const exampleMentorAdapter: MentorDataAdapter<MockMentorRow> = {
  toCanonicalMentor(row: MockMentorRow): Mentor {
    const confirmed = row.credentialsConfirmedAt !== null;

    const credentials: Record<string, unknown> = {};
    const ielts = toIelts(row, confirmed);
    const sat = toSat(row, confirmed);
    const hsk = toHsk(row, confirmed);
    // `undefined` means UNKNOWN and the key must be omitted entirely — writing
    // `key: undefined` would be equivalent here, but omitting makes the intent
    // unmistakable to anyone reading the emitted JSON.
    if (ielts !== undefined) credentials.ielts = ielts;
    if (sat !== undefined) credentials.sat = sat;
    if (hsk !== undefined) credentials.hsk = hsk;

    return {
      id: row.id,
      name: row.fullName,
      birthYear: row.birthYear,
      verified: row.identityVerifiedAt !== null,
      credentials,
      expertise: toSkills(row.teachesSkills),
      availability: toSlots(row.availability),
      pricePerHour: row.hourlyRateVnd,
      // Optional fields stay absent when the column is NULL: a mentor with no
      // recorded rating is not a mentor with a rating of zero.
      ...(row.monthsTeaching === null ? {} : { teachingExperienceMonths: row.monthsTeaching }),
      ...(row.completedSessions === null ? {} : { sessionsCompleted: row.completedSessions }),
      ...(row.averageRating === null ? {} : { rating: row.averageRating }),
      ...(row.teachingStyleTags === null ? {} : { teachingStyles: row.teachingStyleTags }),
      // tenantId, lastLoginAt and profileViews are intentionally not mapped.
    } as Mentor;
  },
};

/** Turns a mock request row into a canonical student request. */
export const exampleRequestAdapter: RequestDataAdapter<MockRequestRow> = {
  toCanonicalRequest(row: MockRequestRow): StudentRequest {
    const domain = toDomain(row.examType);

    return {
      requestId: row.id,
      goal: {
        domain,
        ...(row.currentScore === null ? {} : { currentScore: row.currentScore }),
        ...(row.targetScore === null ? {} : { targetScore: row.targetScore }),
        focusSkills: toSkills(row.focusSkills, domain),
      },
      hardConstraints: {
        verifiedOnly: row.requireVerified,
        ...(row.budgetPerHourVnd === null ? {} : { maxPricePerHour: row.budgetPerHourVnd }),
        ...(row.minimumCredential === null ? {} : { minCredentialScore: row.minimumCredential }),
        requiredExpertise: [],
        requireAllAvailability: false,
      },
      availability: toSlots(row.availability),
      softPreferences: {
        teachingStyles: row.preferredStyles,
        languages: [],
      },
      // Free text is carried, not interpreted: the resolver reports it as
      // unresolved rather than the adapter guessing at a meaning.
      additionalPreferences: row.freeTextNotes === null ? [] : [row.freeTextNotes],
      // studentEmail is deliberately never forwarded: matching needs no identity.
    } as StudentRequest;
  },
};
