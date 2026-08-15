/**
 * Canonical student request model.
 *
 * The request separates two kinds of criteria, and the separation is
 * load-bearing for the whole engine:
 *
 * - `hardConstraints` — eligibility rules. A mentor violating any of them is
 *   removed (Phase 4) and can never be recovered by a high score.
 * - `softPreferences` / `goal` — ranking signals. They influence order only.
 *
 * `additionalPreferences` holds free text the student wrote that has no
 * canonical representation yet. It is carried through untouched so Phase 2 can
 * report it as unresolved rather than dropping it.
 */

import { z } from "zod";
import {
  AvailabilitySlotSchema,
  DomainSchema,
  GenderSchema,
  HskLevelSchema,
  IdSchema,
  IeltsBandSchema,
  LanguageSchema,
  PriceSchema,
  SatTotalSchema,
  SkillSchema,
  TeachingStyleSchema,
  domainOfSkill,
  uniqueArray,
} from "./validation.js";
import type { Domain } from "./validation.js";

/**
 * Validates a score against the scale of a domain.
 *
 * @param domain - The domain whose scale applies.
 * @param score - The score to check.
 * @returns `true` when the score is valid on that domain's scale.
 */
function isScoreValidForDomain(domain: Domain, score: number): boolean {
  const schema =
    domain === "IELTS" ? IeltsBandSchema : domain === "SAT" ? SatTotalSchema : HskLevelSchema;
  return schema.safeParse(score).success;
}

/**
 * The student's learning goal.
 *
 * `currentScore` / `targetScore` are optional (a beginner may have neither) but
 * when present must be valid on the goal domain's own scale — an IELTS request
 * cannot carry a target of `1400`.
 */
export const GoalSchema = z
  .strictObject({
    domain: DomainSchema,
    currentScore: z.number().optional(),
    targetScore: z.number().optional(),
    /** Skills the student wants to focus on. Must belong to `domain`. */
    focusSkills: uniqueArray(SkillSchema, "focusSkills").default([]),
  })
  .superRefine((goal, ctx) => {
    for (const key of ["currentScore", "targetScore"] as const) {
      const value = goal[key];
      if (value !== undefined && !isScoreValidForDomain(goal.domain, value)) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `${value} is not a valid ${goal.domain} score`,
          input: value,
        });
      }
    }

    goal.focusSkills.forEach((skill, index) => {
      if (domainOfSkill(skill) !== goal.domain) {
        ctx.addIssue({
          code: "custom",
          path: ["focusSkills", index],
          message: `Focus skill ${skill} does not belong to domain ${goal.domain}`,
          input: skill,
        });
      }
    });
  });
/** A validated learning goal. */
export type Goal = z.infer<typeof GoalSchema>;

/**
 * Eligibility rules. Every field here removes mentors; none of them can be
 * traded off against a score.
 */
export const HardConstraintsSchema = z.strictObject({
  /** When true, unverified mentors are ineligible. */
  verifiedOnly: z.boolean().default(false),
  /** Inclusive upper bound on hourly price, in VND. */
  maxPricePerHour: PriceSchema.optional(),
  /**
   * Inclusive minimum credential the mentor must hold in the goal domain,
   * expressed on that domain's scale (IELTS band, SAT total, HSK level).
   */
  minCredentialScore: z.number().optional(),
  /** Skills the mentor must teach, all of them. */
  requiredExpertise: uniqueArray(SkillSchema, "requiredExpertise").default([]),
  /**
   * When true, the mentor must be free in every slot listed in the request's
   * `availability`; otherwise a single overlapping slot suffices.
   */
  requireAllAvailability: z.boolean().default(false),
});
/** Validated hard constraints. */
export type HardConstraints = z.infer<typeof HardConstraintsSchema>;

/** Ranking-only preferences. Never used to exclude a mentor. */
export const SoftPreferencesSchema = z.strictObject({
  teachingStyles: uniqueArray(TeachingStyleSchema, "teachingStyles").default([]),
  languages: uniqueArray(LanguageSchema, "languages").default([]),
  /** Preferred mentor gender, if the student expressed one. */
  gender: GenderSchema.optional(),
});
/** Validated soft preferences. */
export type SoftPreferences = z.infer<typeof SoftPreferencesSchema>;

/**
 * Canonical student request.
 *
 * Unknown keys are rejected for the same reason as on {@link MentorSchema}:
 * a criterion the engine does not understand must be surfaced, not absorbed.
 */
export const StudentRequestSchema = z
  .strictObject({
    /** Stable, non-empty request identifier. */
    requestId: IdSchema,
    goal: GoalSchema,
    hardConstraints: HardConstraintsSchema.default({
      verifiedOnly: false,
      requiredExpertise: [],
      requireAllAvailability: false,
    }),
    /** Slots the student can attend. May be empty. */
    availability: uniqueArray(AvailabilitySlotSchema, "availability").default([]),
    softPreferences: SoftPreferencesSchema.default({ teachingStyles: [], languages: [] }),
    /**
     * Raw, un-canonicalised criteria the student expressed. Preserved verbatim;
     * resolved (or explicitly reported as unresolved) in Phase 2.
     */
    additionalPreferences: z.array(z.string()).default([]),
  })
  .superRefine((request, ctx) => {
    if (
      request.hardConstraints.minCredentialScore !== undefined &&
      !isScoreValidForDomain(request.goal.domain, request.hardConstraints.minCredentialScore)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["hardConstraints", "minCredentialScore"],
        message: `${request.hardConstraints.minCredentialScore} is not a valid ${request.goal.domain} score`,
        input: request.hardConstraints.minCredentialScore,
      });
    }

    request.hardConstraints.requiredExpertise.forEach((skill, index) => {
      if (domainOfSkill(skill) !== request.goal.domain) {
        ctx.addIssue({
          code: "custom",
          path: ["hardConstraints", "requiredExpertise", index],
          message: `Required expertise ${skill} does not belong to domain ${request.goal.domain}`,
          input: skill,
        });
      }
    });
  });

/** A validated canonical student request. */
export type StudentRequest = z.infer<typeof StudentRequestSchema>;
