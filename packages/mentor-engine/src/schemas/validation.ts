/**
 * Shared validation primitives for the canonical domain model.
 *
 * Everything the mentor and request schemas agree on lives here: the closed
 * vocabularies (domains, skills, availability slots, teaching styles), the
 * numeric bounds, and the small set of helpers used to run validation and
 * report failures in a stable, inspectable shape.
 *
 * Design rules honoured by this module:
 * - Vocabularies are **closed**: an unknown enum value is a validation failure,
 *   never a silently dropped field. Free-text criteria live in dedicated
 *   string fields (e.g. `additionalPreferences`) and are resolved in Phase 2.
 * - Bounds are declared once in {@link SCHEMA_BOUNDS} so they can be reviewed
 *   and versioned instead of being scattered across call sites.
 */

import { z } from "zod";

/**
 * Version of the canonical data contract. Bump on any breaking change to the
 * mentor / request / response shapes so stored payloads stay interpretable.
 */
export const SCHEMA_VERSION = "mentor-engine-schema-v1.0.0";

/** Version of the matching engine itself, echoed in every {@link MatchResponse}. */
export const ENGINE_VERSION = "mentor-engine-v1.0.0";

/* -------------------------------------------------------------------------- */
/* Bounds                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Numeric bounds applied by the canonical schemas.
 *
 * These are deliberately constants rather than runtime-derived values (e.g.
 * `new Date().getFullYear()`) so validation results are reproducible: the same
 * record must validate identically today and a year from now.
 */
export const SCHEMA_BOUNDS = {
  ielts: { min: 0, max: 9, step: 0.5 },
  sat: {
    total: { min: 400, max: 1600 },
    section: { min: 200, max: 800 },
  },
  hsk: { minLevel: 1, maxLevel: 6 },
  rating: { min: 0, max: 5 },
  /** Plausible mentor birth years. Widen deliberately, never silently. */
  birthYear: { min: 1940, max: 2015 },
  /** Guards against absurd inputs; not a business pricing policy. */
  pricePerHour: { min: 0, max: 100_000_000 },
  teachingExperienceMonths: { min: 0, max: 900 },
  sessionsCompleted: { min: 0, max: 100_000 },
} as const;

/* -------------------------------------------------------------------------- */
/* Closed vocabularies                                                        */
/* -------------------------------------------------------------------------- */

/** Learning domains supported in V1. */
export const DOMAINS = ["IELTS", "SAT", "HSK"] as const;
export const DomainSchema = z.enum(DOMAINS);
/** A supported learning domain, e.g. `"IELTS"`. */
export type Domain = z.infer<typeof DomainSchema>;

/** Canonical skills, namespaced by their domain: `DOMAIN.SKILL`. */
export const SKILLS = [
  "IELTS.LISTENING",
  "IELTS.READING",
  "IELTS.WRITING",
  "IELTS.SPEAKING",
  "SAT.MATH",
  "SAT.READING_WRITING",
  "HSK.LISTENING",
  "HSK.READING",
  "HSK.WRITING",
] as const;
export const SkillSchema = z.enum(SKILLS);
/** A canonical skill identifier, e.g. `"IELTS.WRITING"`. */
export type Skill = z.infer<typeof SkillSchema>;

/**
 * Returns the domain a canonical skill belongs to.
 *
 * @param skill - Canonical skill identifier.
 * @returns The owning {@link Domain}.
 */
export function domainOfSkill(skill: Skill): Domain {
  return skill.split(".")[0] as Domain;
}

/** Teaching styles a mentor may declare and a student may prefer. */
export const TEACHING_STYLES = [
  "PATIENT",
  "STRUCTURED",
  "EXAM_FOCUSED",
  "CONVERSATIONAL",
  "INTENSIVE",
  "FLEXIBLE",
  "ANALYTICAL",
  "MOTIVATING",
] as const;
export const TeachingStyleSchema = z.enum(TEACHING_STYLES);
/** A canonical teaching style, e.g. `"PATIENT"`. */
export type TeachingStyle = z.infer<typeof TeachingStyleSchema>;

/** Languages of instruction, ISO 639-1 uppercased. */
export const LANGUAGES = ["VI", "EN", "ZH"] as const;
export const LanguageSchema = z.enum(LANGUAGES);
/** A canonical language of instruction, e.g. `"VI"`. */
export type Language = z.infer<typeof LanguageSchema>;

/** Self-declared gender. `undisclosed` is explicit, never inferred. */
export const GENDERS = ["female", "male", "other", "undisclosed"] as const;
export const GenderSchema = z.enum(GENDERS);
/** A canonical gender value. */
export type Gender = z.infer<typeof GenderSchema>;

/** Weekday prefixes used by canonical availability slots. */
export const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
/** A canonical weekday prefix, e.g. `"TUE"`. */
export type Weekday = (typeof WEEKDAYS)[number];

/**
 * Canonical weekly availability slot: `WEEKDAY_HH_MM`, on the hour or half
 * hour, 24-hour clock — e.g. `TUE_19_00`.
 *
 * Slots are recurring weekly buckets, not calendar dates; V1 matching only ever
 * needs "does the mentor teach at this weekly time".
 */
export const AVAILABILITY_SLOT_PATTERN =
  /^(?:MON|TUE|WED|THU|FRI|SAT|SUN)_(?:[01]\d|2[0-3])_(?:00|30)$/;

export const AvailabilitySlotSchema = z
  .string()
  .regex(
    AVAILABILITY_SLOT_PATTERN,
    "Invalid availability slot: expected WEEKDAY_HH_MM (e.g. TUE_19_00)",
  );

/**
 * A canonical availability slot string, e.g. `"TUE_19_00"`.
 *
 * Kept as a plain `string` alias rather than a branded type so adapters and
 * fixtures can build canonical objects without casts; the format is enforced at
 * runtime by {@link AvailabilitySlotSchema}.
 */
export type AvailabilitySlot = string;

/**
 * Narrows an arbitrary string to a canonical {@link AvailabilitySlot}.
 *
 * @param value - Candidate slot string.
 * @returns `true` when the value matches the canonical slot format.
 */
export function isAvailabilitySlot(value: string): value is AvailabilitySlot {
  return AVAILABILITY_SLOT_PATTERN.test(value);
}

/* -------------------------------------------------------------------------- */
/* Reusable scalar schemas                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Non-empty identifier. Whitespace-only values are rejected rather than
 * trimmed, so an adapter bug surfaces instead of producing a silent alias.
 */
export const IdSchema = z.string().refine((v) => v.trim().length > 0, {
  error: "Identifier must not be empty",
});

/** Non-empty human-readable name. */
export const NonEmptyStringSchema = z.string().refine((v) => v.trim().length > 0, {
  error: "Value must not be blank",
});

/**
 * IELTS band score: 0.0–9.0 in steps of 0.5.
 *
 * The step check multiplies by two rather than using `multipleOf(0.5)` to stay
 * clear of binary floating-point surprises.
 */
export const IeltsBandSchema = z
  .number()
  .min(SCHEMA_BOUNDS.ielts.min, `IELTS band must be >= ${SCHEMA_BOUNDS.ielts.min}`)
  .max(SCHEMA_BOUNDS.ielts.max, `IELTS band must be <= ${SCHEMA_BOUNDS.ielts.max}`)
  .refine((v) => Number.isInteger(v * 2), {
    error: "IELTS band must be a multiple of 0.5",
  });

/** SAT total score: integer 400–1600. */
export const SatTotalSchema = z
  .number()
  .int("SAT total must be an integer")
  .min(SCHEMA_BOUNDS.sat.total.min, `SAT total must be >= ${SCHEMA_BOUNDS.sat.total.min}`)
  .max(SCHEMA_BOUNDS.sat.total.max, `SAT total must be <= ${SCHEMA_BOUNDS.sat.total.max}`);

/** SAT section score (Math or Reading-Writing): integer 200–800. */
export const SatSectionSchema = z
  .number()
  .int("SAT section score must be an integer")
  .min(SCHEMA_BOUNDS.sat.section.min, `SAT section score must be >= ${SCHEMA_BOUNDS.sat.section.min}`)
  .max(SCHEMA_BOUNDS.sat.section.max, `SAT section score must be <= ${SCHEMA_BOUNDS.sat.section.max}`);

/** HSK level: integer 1–6. */
export const HskLevelSchema = z
  .number()
  .int("HSK level must be an integer")
  .min(SCHEMA_BOUNDS.hsk.minLevel, `HSK level must be >= ${SCHEMA_BOUNDS.hsk.minLevel}`)
  .max(SCHEMA_BOUNDS.hsk.maxLevel, `HSK level must be <= ${SCHEMA_BOUNDS.hsk.maxLevel}`);

/** Aggregate rating: 0–5. */
export const RatingSchema = z
  .number()
  .min(SCHEMA_BOUNDS.rating.min, `Rating must be >= ${SCHEMA_BOUNDS.rating.min}`)
  .max(SCHEMA_BOUNDS.rating.max, `Rating must be <= ${SCHEMA_BOUNDS.rating.max}`);

/** Hourly price in VND: non-negative integer. */
export const PriceSchema = z
  .number()
  .int("Price must be an integer number of VND")
  .min(SCHEMA_BOUNDS.pricePerHour.min, "Price must not be negative")
  .max(SCHEMA_BOUNDS.pricePerHour.max, "Price is implausibly large");

/** Mentor birth year within the configured plausible range. */
export const BirthYearSchema = z
  .number()
  .int("Birth year must be an integer")
  .min(SCHEMA_BOUNDS.birthYear.min, `Birth year must be >= ${SCHEMA_BOUNDS.birthYear.min}`)
  .max(SCHEMA_BOUNDS.birthYear.max, `Birth year must be <= ${SCHEMA_BOUNDS.birthYear.max}`);

/**
 * Builds an array schema whose entries must be unique.
 *
 * @param item - Schema for a single element.
 * @param label - Human-readable name used in the duplicate error message.
 */
export function uniqueArray<T extends z.ZodTypeAny>(item: T, label: string) {
  return z.array(item).refine((values) => new Set(values).size === values.length, {
    error: `${label} must not contain duplicates`,
  });
}

/* -------------------------------------------------------------------------- */
/* Validation results                                                         */
/* -------------------------------------------------------------------------- */

/** A single, machine-readable validation failure. */
export interface ValidationIssue {
  /** Dotted path to the offending field, e.g. `credentials.ielts.overall`. */
  path: string;
  /** Zod issue code, e.g. `too_big`, `invalid_type`, `custom`. */
  code: string;
  /** Human-readable explanation. */
  message: string;
}

/** Discriminated result of a canonical-schema validation. */
export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; issues: ValidationIssue[] };

/**
 * Converts a {@link z.ZodError} into stable, serializable issues.
 *
 * Issues are sorted by path then message so the same invalid input always
 * yields the same report — a prerequisite for golden-fixture tests.
 *
 * @param error - The Zod error to flatten.
 * @returns Deterministically ordered validation issues.
 */
export function toValidationIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues
    .map((issue) => ({
      path: issue.path.map(String).join("."),
      code: issue.code,
      message: issue.message,
    }))
    .sort((a, b) => a.path.localeCompare(b.path) || a.message.localeCompare(b.message));
}

/**
 * Runs a schema and returns a {@link ValidationResult} instead of throwing.
 *
 * @param schema - The canonical schema to apply.
 * @param input - Unknown, untrusted input.
 * @returns The parsed value, or the ordered list of issues.
 */
export function validateWith<S extends z.ZodType>(
  schema: S,
  input: unknown,
): ValidationResult<z.infer<S>> {
  const parsed = schema.safeParse(input);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, issues: toValidationIssues(parsed.error) };
}
