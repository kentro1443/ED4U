/**
 * Feature engineering: mentor + request in, transparent numbers out.
 *
 * Every feature function here is **pure**, takes only canonical data, and
 * returns either a value in `[0, 1]` or `null`. There is no scoring, no
 * weighting and no ordering in this module — combining features is the ranker's
 * job, and keeping them apart is what makes a score inspectable.
 *
 * ## `null` means "no data", and that is not a zero
 *
 * A mentor with no rating is not a mentor with a bad rating. Substituting `0`
 * would silently invent an observation and punish someone for a gap in *our*
 * records; substituting `0.5` would invent a different one. So a feature with
 * nothing behind it returns `null`, the ranker redistributes its weight, and
 * the loss of evidence is reported honestly as `dataCoverage`.
 *
 * ## Only the requested domain is ever read
 *
 * A perfect SAT score cannot raise the score of an IELTS request. Each feature
 * reads the goal domain's credential and nothing else — the guarantee PLAN.md
 * asks for under "irrelevant credentials do not improve score".
 */

import weightsJson from "../../config/weights.v1.json" with { type: "json" };
import { credentialKnowledge, getCredential, headlineCredentialScore } from "../schemas/mentor.js";
import type { IeltsCredential, Mentor, SatCredential } from "../schemas/mentor.js";
import type { StudentRequest } from "../schemas/request.js";
import { domainOfSkill } from "../schemas/validation.js";
import type { Domain, Skill } from "../schemas/validation.js";

/**
 * A floor/ceiling pair used to normalise a raw score onto `[0, 1]`.
 */
export interface ScoreScale {
  floor: number;
  ceiling: number;
}

/**
 * Shape of the ranking configuration.
 *
 * Declared explicitly rather than inferred from the JSON asset with
 * `typeof weightsJson`. That inference leaked into the emitted `.d.ts` as an
 * `import ... from "../../config/weights.v1.json"` with no import attribute,
 * which fails to compile (TS1543) in any external NodeNext consumer. A public
 * type must not require the consumer to resolve a private runtime asset just to
 * name it.
 *
 * The JSON file remains the runtime source of truth and may carry extra
 * documentation keys; only the fields declared here are read.
 */
export interface RankingConfig {
  /** Version of this configuration, reported in every `MatchResponse`. */
  version: string;
  /** Human-readable description carried by the JSON config. */
  description?: string;
  /** Missing-data policy is public because callers/tests may audit it. */
  missingDataPolicy: { policy: string; comment?: string };
  baseWeights: Record<FeatureName, number>;
  requestAware: {
    focusSkillBoost: number;
    teachingStyleBoost: number;
  };
  credentialScale: {
    IELTS: ScoreScale;
    SAT: ScoreScale;
    HSK: ScoreScale;
  };
  sectionScale: {
    IELTS: ScoreScale;
    SAT: ScoreScale;
  };
  focusSkill: {
    taughtWeight: number;
    bandWeight: number;
  };
  experience: {
    sessionsWeight: number;
    sessionsRate: number;
    monthsWeight: number;
    monthsRate: number;
  };
  rating: ScoreScale;
  budget: {
    floorAtMax: number;
  };
  explanation: {
    maxReasons: number;
    maxTradeoffs: number;
  };
}

/** The loaded, versioned ranking configuration. */
export const rankingConfig: RankingConfig = weightsJson;

/** Version of the default weight configuration, e.g. `"weights.v1"`. */
export const WEIGHTS_VERSION: string = weightsJson.version;

/** The features scored in V1. */
export const FEATURE_NAMES = [
  "subjectExpertise",
  "focusSkillStrength",
  "availabilityFit",
  "budgetFit",
  "experience",
  "rating",
  "teachingStyleFit",
] as const;

/** A single scored feature. */
export type FeatureName = (typeof FEATURE_NAMES)[number];

/** Feature values: a number in `[0, 1]`, or `null` when there is no data. */
export type FeatureValues = Record<FeatureName, number | null>;

/** Which features this *request* asks for, independent of any mentor. */
export type FeatureApplicability = Record<FeatureName, boolean>;

/**
 * How much of a feature's evidence was actually observed, in `[0, 1]`.
 *
 * Most features are all-or-nothing: either the data exists (1) or the feature
 * is `null` (0). `focusSkillStrength` can be partially evidenced — we may know
 * a mentor teaches Writing without knowing their Writing band — and this is
 * where that partiality is recorded rather than being silently rounded up.
 */
export type FeatureEvidence = Record<FeatureName, number>;

/** A feature's value together with the share of its evidence that was observed. */
export interface FeatureOutcome {
  value: number | null;
  evidence: number;
}

/** The complete feature picture for one mentor against one request. */
export interface FeatureSet {
  values: FeatureValues;
  /**
   * A feature is *applicable* when the request asks for it (a budget was
   * stated, styles were named). Inapplicable features are never held against a
   * mentor — they are excluded from `dataCoverage` entirely, unlike applicable
   * features the mentor simply has no data for.
   */
  applicable: FeatureApplicability;
  /** Observed evidence share per feature; drives `dataCoverage`. */
  evidence: FeatureEvidence;
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Clamps a value into `[0, 1]`; the single place bounding is enforced. */
function bounded(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Maps a raw score onto `[0, 1]` between a floor and a ceiling.
 *
 * @param value - Raw score on the domain's own scale.
 * @param scale - Floor (maps to 0) and ceiling (maps to 1).
 */
function normalize(value: number, scale: { floor: number; ceiling: number }): number {
  const span = scale.ceiling - scale.floor;
  if (span <= 0) return 0;
  return bounded((value - scale.floor) / span);
}

/** Saturating curve: fast early gains, flattening out. Always in `[0, 1)`. */
function saturate(value: number, rate: number): number {
  return bounded(1 - Math.exp(-rate * Math.max(0, value)));
}

/**
 * Reads a mentor's per-skill score for a canonical skill, when one exists.
 *
 * @returns The raw section score, or `undefined` when unknown or not modelled
 *   (HSK has no per-skill scores in V1).
 */
export function sectionScoreForSkill(mentor: Mentor, skill: Skill): number | undefined {
  const domain = domainOfSkill(skill);
  const credential = getCredential(mentor.credentials, domain);
  if (credential === undefined) return undefined;

  if (domain === "IELTS") {
    const ielts = credential as IeltsCredential;
    switch (skill) {
      case "IELTS.LISTENING":
        return ielts.listening;
      case "IELTS.READING":
        return ielts.reading;
      case "IELTS.WRITING":
        return ielts.writing;
      case "IELTS.SPEAKING":
        return ielts.speaking;
      default:
        return undefined;
    }
  }

  if (domain === "SAT") {
    const sat = credential as SatCredential;
    if (skill === "SAT.MATH") return sat.math;
    if (skill === "SAT.READING_WRITING") return sat.readingWriting;
    return undefined;
  }

  // HSK certifies a single level, not per-skill scores.
  return undefined;
}

/* -------------------------------------------------------------------------- */
/* Features                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * How strong the mentor's credential is in the requested domain.
 *
 * @returns `null` when the credential is ABSENT or UNKNOWN — we will not score
 *   a mentor on a certificate we have never seen, in either direction.
 */
export function subjectExpertiseFeature(
  mentor: Mentor,
  domain: Domain,
  config: RankingConfig = rankingConfig,
): number | null {
  if (credentialKnowledge(mentor.credentials, domain) !== "PRESENT") return null;

  const score = headlineCredentialScore(mentor.credentials, domain);
  if (score === undefined) return null;

  return normalize(score, config.credentialScale[domain]);
}

/**
 * How well the mentor covers the skills the student singled out.
 *
 * Each requested skill has two pieces of evidence: whether the mentor *teaches*
 * it (always observable, from `expertise`) and how well they *scored* in it
 * (observable only when a per-skill band is published).
 *
 * The distinction that matters, and the reason this returns an evidence share
 * alongside the value:
 *
 * - **Not modelled.** HSK certifies a single level and has no per-skill scores
 *   at all, for anybody. Nothing is missing, so the teaching signal carries the
 *   feature on its own and evidence is full.
 * - **Modelled but not published.** An IELTS profile listing only an overall
 *   band, or a SAT credential without sections. Here a real piece of evidence
 *   *is* missing, and the mentor is credited only for what was actually
 *   observed — teaching the skill earns the `taughtWeight` share, not a perfect
 *   score. Renormalising to 1.0 would assert "teaches it ⇒ teaches it
 *   perfectly", letting an unmeasured mentor outrank a measured one. Evidence
 *   drops accordingly, and that drop surfaces in `dataCoverage`.
 *
 * A mentor whose published band sits at or below the scale floor scores the
 * same as one with no published band: both mean "no evidence of strength here".
 *
 * @returns `value` is `null` only when no focus skills were requested; evidence
 *   is the share of this feature's evidence that was actually observed.
 */
export function focusSkillStrengthOutcome(
  mentor: Mentor,
  focusSkills: readonly Skill[],
  config: RankingConfig = rankingConfig,
): FeatureOutcome {
  if (focusSkills.length === 0) return { value: null, evidence: 0 };

  const { taughtWeight, bandWeight } = config.focusSkill;
  const totalWeight = taughtWeight + bandWeight;
  let valueTotal = 0;
  let evidenceTotal = 0;

  for (const skill of focusSkills) {
    const taught = mentor.expertise.includes(skill) ? 1 : 0;
    const domain = domainOfSkill(skill);
    // Looked up by literal rather than a generic index, so a domain without a
    // per-skill scale (HSK) is a compile-time-visible `undefined`.
    const scale =
      domain === "IELTS"
        ? config.sectionScale.IELTS
        : domain === "SAT"
          ? config.sectionScale.SAT
          : undefined;

    if (scale === undefined) {
      // Per-skill scores are not part of this domain's model: nothing is
      // missing, so teaching evidence is the whole story.
      valueTotal += taught;
      evidenceTotal += 1;
      continue;
    }

    const rawSection = sectionScoreForSkill(mentor, skill);
    if (rawSection === undefined) {
      // Modelled but unpublished: credit only the evidence we actually have.
      valueTotal += (taughtWeight * taught) / totalWeight;
      evidenceTotal += taughtWeight / totalWeight;
      continue;
    }

    const band = normalize(rawSection, scale);
    valueTotal += (taughtWeight * taught + bandWeight * band) / totalWeight;
    evidenceTotal += 1;
  }

  return {
    value: bounded(valueTotal / focusSkills.length),
    evidence: bounded(evidenceTotal / focusSkills.length),
  };
}

/**
 * Value-only view of {@link focusSkillStrengthOutcome}.
 *
 * @returns `null` only when no focus skills were requested.
 */
export function focusSkillStrengthFeature(
  mentor: Mentor,
  focusSkills: readonly Skill[],
  config: RankingConfig = rankingConfig,
): number | null {
  return focusSkillStrengthOutcome(mentor, focusSkills, config).value;
}

/**
 * The share of the student's requested slots the mentor can actually cover.
 *
 * @returns `null` when the student stated no availability.
 */
export function availabilityFitFeature(
  mentor: Mentor,
  requestedSlots: readonly string[],
): number | null {
  if (requestedSlots.length === 0) return null;

  const mentorSlots = new Set(mentor.availability);
  const covered = requestedSlots.filter((slot) => mentorSlots.has(slot)).length;
  return bounded(covered / requestedSlots.length);
}

/**
 * How much headroom the mentor leaves under the stated budget.
 *
 * Mentors above the budget were already removed by the hard filter, so this
 * only ever grades the survivors. A mentor priced exactly at the maximum is
 * affordable but has no headroom, and scores the configured floor rather than
 * zero.
 *
 * @returns `null` when the student stated no budget.
 */
export function budgetFitFeature(
  mentor: Mentor,
  maxPricePerHour: number | undefined,
  config: RankingConfig = rankingConfig,
): number | null {
  if (maxPricePerHour === undefined) return null;

  const floor = config.budget.floorAtMax;
  if (maxPricePerHour <= 0) return bounded(mentor.pricePerHour <= 0 ? 1 : floor);

  const headroom = 1 - mentor.pricePerHour / maxPricePerHour;
  return bounded(floor + (1 - floor) * headroom);
}

/**
 * Teaching track record, saturating so seniority cannot dominate everything.
 *
 * Combines completed sessions and months taught, using whichever are known.
 *
 * @returns `null` when neither is recorded.
 */
export function experienceFeature(
  mentor: Mentor,
  config: RankingConfig = rankingConfig,
): number | null {
  const { sessionsWeight, sessionsRate, monthsWeight, monthsRate } = config.experience;

  const parts: { weight: number; value: number }[] = [];
  if (mentor.sessionsCompleted !== undefined) {
    parts.push({ weight: sessionsWeight, value: saturate(mentor.sessionsCompleted, sessionsRate) });
  }
  if (mentor.teachingExperienceMonths !== undefined) {
    parts.push({ weight: monthsWeight, value: saturate(mentor.teachingExperienceMonths, monthsRate) });
  }
  if (parts.length === 0) return null;

  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
  if (totalWeight <= 0) return null;

  return bounded(parts.reduce((sum, part) => sum + part.weight * part.value, 0) / totalWeight);
}

/**
 * Aggregate rating, normalised over its usable range.
 *
 * @returns `null` when the mentor has no rating — absence of praise, never
 *   evidence of a bad one.
 */
export function ratingFeature(
  mentor: Mentor,
  config: RankingConfig = rankingConfig,
): number | null {
  if (mentor.rating === undefined) return null;
  return normalize(mentor.rating, config.rating);
}

/**
 * The share of the student's preferred teaching styles the mentor declares.
 *
 * @returns `null` when no styles were requested, or when the mentor has
 *   declared no styles at all — an undeclared style list is unknown, not a
 *   mismatch. A mentor who *does* list styles and matches none scores 0, which
 *   is a real observation.
 */
export function teachingStyleFitFeature(
  mentor: Mentor,
  requestedStyles: readonly string[],
): number | null {
  if (requestedStyles.length === 0) return null;
  if (mentor.teachingStyles === undefined) return null;

  const declared = new Set<string>(mentor.teachingStyles);
  const matched = requestedStyles.filter((style) => declared.has(style)).length;
  return bounded(matched / requestedStyles.length);
}

/* -------------------------------------------------------------------------- */
/* Assembly                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Determines which features the request asks for, before any mentor is seen.
 *
 * Computed once per request: it depends only on what the student stated, so it
 * is the same for every candidate.
 *
 * @param request - Canonical student request.
 */
export function featureApplicability(request: StudentRequest): FeatureApplicability {
  return {
    // There is always a goal domain, and always a mentor to have a record.
    subjectExpertise: true,
    experience: true,
    rating: true,
    focusSkillStrength: request.goal.focusSkills.length > 0,
    availabilityFit: request.availability.length > 0,
    budgetFit: request.hardConstraints.maxPricePerHour !== undefined,
    teachingStyleFit: request.softPreferences.teachingStyles.length > 0,
  };
}

/**
 * Builds the full feature vector for one mentor against one request.
 *
 * @param request - Canonical, validated student request.
 * @param mentor - Canonical, validated mentor (already past the hard filter).
 * @param config - Ranking configuration; defaults to `config/weights.v1.json`.
 * @returns Values in `[0, 1]` or `null`, plus per-request applicability.
 */
export function buildFeatures(
  request: StudentRequest,
  mentor: Mentor,
  config: RankingConfig = rankingConfig,
): FeatureSet {
  const domain = request.goal.domain;
  const focus = focusSkillStrengthOutcome(mentor, request.goal.focusSkills, config);

  const values: FeatureValues = {
    subjectExpertise: subjectExpertiseFeature(mentor, domain, config),
    focusSkillStrength: focus.value,
    availabilityFit: availabilityFitFeature(mentor, request.availability),
    budgetFit: budgetFitFeature(mentor, request.hardConstraints.maxPricePerHour, config),
    experience: experienceFeature(mentor, config),
    rating: ratingFeature(mentor, config),
    teachingStyleFit: teachingStyleFitFeature(mentor, request.softPreferences.teachingStyles),
  };

  // Every other feature is all-or-nothing: a value means it was observed.
  const evidence = Object.fromEntries(
    FEATURE_NAMES.map((feature) => [
      feature,
      feature === "focusSkillStrength" ? focus.evidence : values[feature] === null ? 0 : 1,
    ]),
  ) as FeatureEvidence;

  return { values, applicable: featureApplicability(request), evidence };
}
