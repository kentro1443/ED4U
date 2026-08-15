/**
 * Canonical mentor model.
 *
 * A `Mentor` is what the engine matches against. It is deliberately free of any
 * storage concerns: adapters (Phase 9) translate ED4U database rows into this
 * shape, and the engine never sees anything else.
 *
 * Missing-data policy: optional fields are *genuinely optional*. An absent
 * `rating` means "we do not know this mentor's rating" and must stay absent —
 * later phases must never substitute a default and then reason about it as if
 * it were observed.
 *
 * Credentials carry a three-valued distinction that the rest of the engine
 * depends on: key omitted = UNKNOWN, `null` = KNOWN ABSENT, object = KNOWN
 * PRESENT. See {@link CredentialsSchema} and {@link credentialKnowledge}.
 */

import { z } from "zod";
import {
  AvailabilitySlotSchema,
  BirthYearSchema,
  GenderSchema,
  HskLevelSchema,
  IdSchema,
  IeltsBandSchema,
  LanguageSchema,
  NonEmptyStringSchema,
  PriceSchema,
  RatingSchema,
  SCHEMA_BOUNDS,
  SatSectionSchema,
  SatTotalSchema,
  SkillSchema,
  TeachingStyleSchema,
  uniqueArray,
} from "./validation.js";
import type { Domain } from "./validation.js";

/* -------------------------------------------------------------------------- */
/* Credentials                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Computes the IELTS overall band from the four section bands.
 *
 * IELTS rounds the mean of the four sections to the nearest half band, with
 * ties going **up**: a mean of 7.25 becomes 7.5 and 7.75 becomes 8.0, while
 * 7.125 stays 7.0.
 *
 * The arithmetic is done in half-band units (integers) so the rule is exact and
 * free of binary floating-point drift.
 *
 * @param sections - The four section bands, each a multiple of 0.5.
 * @returns The overall band implied by those sections.
 */
export function ieltsOverallFromSections(sections: {
  listening: number;
  reading: number;
  writing: number;
  speaking: number;
}): number {
  const halfBandUnits =
    (sections.listening + sections.reading + sections.writing + sections.speaking) * 2;
  // Math.round breaks ties upward, which is exactly the IELTS rule.
  return Math.round(halfBandUnits / 4) / 2;
}

/**
 * IELTS credential. `overall` is required; per-skill bands are optional because
 * many real profiles publish only the overall band.
 *
 * When **all four** sections are present the overall must equal the band they
 * imply (see {@link ieltsOverallFromSections}). An overall that contradicts its
 * own sections is corrupt data, and silently accepting it would let the ranker
 * reward a mentor for a band nobody actually achieved. Overall-only and
 * partially specified credentials stay valid: a missing section is unknown, and
 * an unknown section cannot be checked against anything.
 */
export const IeltsCredentialSchema = z
  .strictObject({
    overall: IeltsBandSchema,
    listening: IeltsBandSchema.optional(),
    reading: IeltsBandSchema.optional(),
    writing: IeltsBandSchema.optional(),
    speaking: IeltsBandSchema.optional(),
  })
  .superRefine((credential, ctx) => {
    const { listening, reading, writing, speaking, overall } = credential;
    if (
      listening === undefined ||
      reading === undefined ||
      writing === undefined ||
      speaking === undefined
    ) {
      return;
    }

    const expected = ieltsOverallFromSections({ listening, reading, writing, speaking });
    if (overall !== expected) {
      ctx.addIssue({
        code: "custom",
        path: ["overall"],
        message: `IELTS overall ${overall} does not match the ${expected} implied by its four section bands`,
        input: overall,
      });
    }
  });
/** A validated IELTS credential. */
export type IeltsCredential = z.infer<typeof IeltsCredentialSchema>;

/**
 * SAT credential. When `total`, `math` and `readingWriting` are all present the
 * total must equal the sum of the sections — an inconsistent record is a data
 * error, not something the ranker should silently average over.
 */
export const SatCredentialSchema = z
  .strictObject({
    total: SatTotalSchema,
    math: SatSectionSchema.optional(),
    readingWriting: SatSectionSchema.optional(),
  })
  .refine(
    (c) =>
      c.math === undefined ||
      c.readingWriting === undefined ||
      c.math + c.readingWriting === c.total,
    { error: "SAT total must equal math + readingWriting when both sections are present" },
  );
/** A validated SAT credential. */
export type SatCredential = z.infer<typeof SatCredentialSchema>;

/** HSK credential. V1 records the certified level only. */
export const HskCredentialSchema = z.strictObject({
  level: HskLevelSchema,
});
/** A validated HSK credential. */
export type HskCredential = z.infer<typeof HskCredentialSchema>;

/**
 * Credentials a mentor holds, one entry per supported domain.
 *
 * The three possible states are distinct and must stay distinct for the whole
 * life of a record — filtering (Phase 4) and explanation (Phase 6) reason about
 * them differently:
 *
 * | Input          | Meaning        | Downstream treatment                        |
 * | -------------- | -------------- | ------------------------------------------- |
 * | object         | KNOWN PRESENT  | Evaluate the credential normally.           |
 * | `null`         | KNOWN ABSENT   | Mentor asserted to hold nothing here; a min-credential constraint fails deterministically. |
 * | key omitted    | UNKNOWN        | We never asked / never learned. Not evidence of absence; must be reported as missing data, never scored as a zero. |
 *
 * Adapters that genuinely cannot tell "absent" from "unknown" must emit the key
 * omitted (UNKNOWN) — claiming absence we did not observe is inventing data.
 *
 * Use {@link credentialKnowledge} rather than truthiness checks so the
 * distinction is never accidentally collapsed.
 */
export const CredentialsSchema = z.strictObject({
  ielts: IeltsCredentialSchema.nullable().optional(),
  sat: SatCredentialSchema.nullable().optional(),
  hsk: HskCredentialSchema.nullable().optional(),
});
/** Validated credential set for a mentor. */
export type Credentials = z.infer<typeof CredentialsSchema>;

/** What we know about a mentor's credential in one domain. */
export type CredentialKnowledge =
  /** A credential object was supplied. */
  | "PRESENT"
  /** Explicit `null`: the mentor is asserted to hold no such credential. */
  | "ABSENT"
  /** The key was omitted: we have no information either way. */
  | "UNKNOWN";

/** Maps a domain onto its key in {@link CredentialsSchema}. */
const CREDENTIAL_KEY_BY_DOMAIN = {
  IELTS: "ielts",
  SAT: "sat",
  HSK: "hsk",
} as const satisfies Record<Domain, keyof Credentials>;

/**
 * Reports what is known about a mentor's credential in a domain, keeping
 * "explicitly absent" and "unknown" apart.
 *
 * @param credentials - The mentor's credential set.
 * @param domain - Domain to inspect.
 * @returns `PRESENT`, `ABSENT`, or `UNKNOWN`.
 */
export function credentialKnowledge(
  credentials: Credentials,
  domain: Domain,
): CredentialKnowledge {
  const key = CREDENTIAL_KEY_BY_DOMAIN[domain];
  if (!Object.hasOwn(credentials, key) || credentials[key] === undefined) return "UNKNOWN";
  return credentials[key] === null ? "ABSENT" : "PRESENT";
}

/**
 * Returns a mentor's credential for a domain when one is known to exist.
 *
 * Returns `undefined` for both ABSENT and UNKNOWN, so callers that need to tell
 * those apart must use {@link credentialKnowledge} — this function is only for
 * reading a credential that is present.
 *
 * @param credentials - The mentor's credential set.
 * @param domain - Domain to read.
 */
export function getCredential(
  credentials: Credentials,
  domain: Domain,
): IeltsCredential | SatCredential | HskCredential | undefined {
  return credentials[CREDENTIAL_KEY_BY_DOMAIN[domain]] ?? undefined;
}

/**
 * Returns the single headline score a domain is measured by, on its own scale:
 * IELTS overall band, SAT total, HSK level.
 *
 * This is the number a request's `minCredentialScore` is compared against, and
 * the same scale the Phase 1 schema validates that field on.
 *
 * @param credentials - The mentor's credential set.
 * @param domain - Domain to read.
 * @returns The headline score, or `undefined` when the credential is ABSENT or
 *   UNKNOWN — callers that must tell those apart use {@link credentialKnowledge}.
 */
export function headlineCredentialScore(
  credentials: Credentials,
  domain: Domain,
): number | undefined {
  const credential = getCredential(credentials, domain);
  if (credential === undefined) return undefined;
  if (domain === "IELTS") return (credential as IeltsCredential).overall;
  if (domain === "SAT") return (credential as SatCredential).total;
  return (credential as HskCredential).level;
}

/* -------------------------------------------------------------------------- */
/* Mentor                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Canonical mentor schema.
 *
 * Unknown keys are rejected: adapters must map explicitly into the contract, so
 * a typo or an un-migrated field surfaces immediately instead of being dropped.
 */
export const MentorSchema = z.strictObject({
  /** Stable, non-empty mentor identifier, unique within a candidate set. */
  id: IdSchema,
  /** Display name. */
  name: NonEmptyStringSchema,
  /** Birth year, used for age-gap style features later. */
  birthYear: BirthYearSchema,
  /** Whether ED4U has verified this mentor's identity and credentials. */
  verified: z.boolean(),
  /**
   * Credentials per domain. `null` = known absent, key omitted = unknown.
   * See {@link CredentialsSchema} — the two must never be conflated.
   */
  credentials: CredentialsSchema,
  /** Skills the mentor teaches. Non-empty and duplicate-free. */
  expertise: uniqueArray(SkillSchema, "expertise").min(
    1,
    "A mentor must declare at least one area of expertise",
  ),
  /**
   * Weekly recurring slots the mentor can teach. May be empty — a mentor with
   * no published availability is a filtering concern (Phase 4), not a schema
   * error.
   */
  availability: uniqueArray(AvailabilitySlotSchema, "availability"),
  /** Hourly price in VND. */
  pricePerHour: PriceSchema,

  /* Optional fields — absence means "unknown", never zero. */
  gender: GenderSchema.optional(),
  school: NonEmptyStringSchema.optional(),
  bio: z.string().optional(),
  teachingExperienceMonths: z
    .number()
    .int("Teaching experience must be an integer number of months")
    .min(SCHEMA_BOUNDS.teachingExperienceMonths.min, "Teaching experience must not be negative")
    .max(SCHEMA_BOUNDS.teachingExperienceMonths.max, "Teaching experience is implausibly large")
    .optional(),
  sessionsCompleted: z
    .number()
    .int("Sessions completed must be an integer")
    .min(SCHEMA_BOUNDS.sessionsCompleted.min, "Sessions completed must not be negative")
    .max(SCHEMA_BOUNDS.sessionsCompleted.max, "Sessions completed is implausibly large")
    .optional(),
  rating: RatingSchema.optional(),
  teachingStyles: uniqueArray(TeachingStyleSchema, "teachingStyles").optional(),
  languages: uniqueArray(LanguageSchema, "languages").optional(),
  achievements: z.array(NonEmptyStringSchema).optional(),
});

/** A validated canonical mentor. */
export type Mentor = z.infer<typeof MentorSchema>;

/** A list of canonical mentors. Duplicate IDs are checked separately. */
export const MentorListSchema = z.array(MentorSchema);
