/**
 * `rankerV1` — combines features into an ordered list.
 *
 * The ranker's contract is narrow on purpose:
 *
 * - **It never removes anyone.** Eligibility was decided by the hard filter;
 *   the ranker orders exactly the mentors it is handed. If it could drop a
 *   candidate, "hard constraints are never compensated by score" would stop
 *   being checkable in one place.
 * - **It never invents data.** Features with no evidence are dropped and their
 *   weight is redistributed across the features that do have evidence. The lost
 *   evidence surfaces as `dataCoverage`, not as a silent penalty or bonus.
 * - **It is fully determined by its inputs.** Same request, same mentors, same
 *   config ⇒ same order, down to ties, which are broken by an explicit total
 *   ordering rather than by whatever order the array happened to be in.
 *
 * `matchScore` is a weighted blend of bounded features on a 0–100 scale. It is
 * a *ranking* score and nothing more: it is not a probability, not a predicted
 * outcome, and must never be presented as a chance of success.
 */

import { FEATURE_NAMES, buildFeatures, rankingConfig } from "../features/featureBuilder.js";
import type {
  FeatureName,
  FeatureSet,
  RankingConfig,
} from "../features/featureBuilder.js";
import type { Mentor } from "../schemas/mentor.js";
import type { StudentRequest } from "../schemas/request.js";

/** One mentor's position and the arithmetic behind it. */
export interface RankedMentor {
  mentorId: string;
  /** 1-based position. */
  rank: number;
  /**
   * Weighted score in `[0, 100]`, rounded to 2 decimals — the only rounded
   * number here. It is a *ranking* score: not a probability, not a confidence,
   * not a predicted outcome.
   *
   * Reproducible from the fields below:
   * `matchScore ≈ 100 × Σ(weights[f] × scoreBreakdown[f])`.
   */
  matchScore: number;
  /** Feature values that had data, at full precision. */
  scoreBreakdown: Partial<Record<FeatureName, number>>;
  /** The normalised weights actually applied, at full precision, summing to 1. */
  weights: Partial<Record<FeatureName, number>>;
  /**
   * Share of the *applicable* evidence that was actually observed, in `[0, 1]`.
   * 1.0 means every feature this request asked for was fully answerable for
   * this mentor. Partially evidenced features (teaching a skill with no
   * published band) contribute a fraction, so the number reflects what is
   * genuinely known rather than merely what produced a value.
   */
  dataCoverage: number;
}

/** Options accepted by {@link rankMentors}. */
export interface RankOptions {
  /** Ranking configuration; defaults to `config/weights.v1.json`. */
  config?: RankingConfig;
  /** Truncate to the first K after ranking. Omit to return every mentor. */
  topK?: number;
}

/**
 * Tie-break order, applied in sequence when `matchScore` is equal.
 *
 * Documented because it is a product decision, not an implementation detail:
 * with equal scores we prefer the mentor we know more about, then the one
 * stronger on the request's own terms, then the more experienced, then the
 * cheaper. `mentorId` is the final key and is unique within a candidate set,
 * so the ordering is total — there is no residual dependence on input order.
 */
export const TIE_BREAK_ORDER = [
  "dataCoverage",
  "subjectExpertise",
  "focusSkillStrength",
  "sessionsCompleted",
  "pricePerHour",
  "mentorId",
] as const;

/* -------------------------------------------------------------------------- */
/* Weighting                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Applies request-aware adjustments to the base weights.
 *
 * A student who names their weak skill is telling us what the match is *for*,
 * so `focusSkillStrength` earns a larger share; naming teaching styles does the
 * same for `teachingStyleFit`. Boosts are multipliers applied before
 * normalisation, so they shift share between features rather than inflating the
 * total.
 *
 * @param request - Canonical student request.
 * @param config - Ranking configuration.
 * @returns Adjusted, not-yet-normalised weights.
 */
export function requestAwareWeights(
  request: StudentRequest,
  config: RankingConfig = rankingConfig,
): Record<FeatureName, number> {
  const weights = { ...config.baseWeights } as Record<FeatureName, number>;

  if (request.goal.focusSkills.length > 0) {
    weights.focusSkillStrength *= config.requestAware.focusSkillBoost;
  }
  if (request.softPreferences.teachingStyles.length > 0) {
    weights.teachingStyleFit *= config.requestAware.teachingStyleBoost;
  }

  return weights;
}

/**
 * Validates a ranking configuration in full.
 *
 * Every number the ranker reads is checked, not just the headline weights. A
 * malformed value elsewhere is just as dangerous and far easier to miss: a
 * negative `focusSkillBoost` would drive a weight negative and quietly produce
 * a score nobody could reproduce, and a scale whose floor meets its ceiling
 * would divide by zero and flatten a whole feature to 0. Failing loudly here is
 * the only way those stay impossible.
 *
 * @param config - Configuration to check.
 * @throws When any value is missing, non-finite, out of range, or degenerate.
 */
export function validateRankingConfig(config: RankingConfig = rankingConfig): void {
  if (typeof config.version !== "string" || config.version.trim().length === 0) {
    throw new Error('Invalid ranking config at "version": expected a non-empty string');
  }

  /** Asserts a finite number, optionally within an inclusive range. */
  const requireNumber = (
    value: unknown,
    path: string,
    { min, max }: { min?: number; max?: number } = {},
  ): number => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(`Invalid ranking config at "${path}": expected a finite number`);
    }
    if (min !== undefined && value < min) {
      throw new Error(`Invalid ranking config at "${path}": ${value} is below the minimum ${min}`);
    }
    if (max !== undefined && value > max) {
      throw new Error(`Invalid ranking config at "${path}": ${value} is above the maximum ${max}`);
    }
    return value;
  };

  /** Asserts a scale whose span is positive, so normalisation is well defined. */
  const requireScale = (scale: unknown, path: string): void => {
    if (typeof scale !== "object" || scale === null) {
      throw new Error(`Invalid ranking config at "${path}": expected { floor, ceiling }`);
    }
    const { floor, ceiling } = scale as { floor?: unknown; ceiling?: unknown };
    const low = requireNumber(floor, `${path}.floor`);
    const high = requireNumber(ceiling, `${path}.ceiling`);
    if (high <= low) {
      throw new Error(
        `Invalid ranking config at "${path}": ceiling ${high} must exceed floor ${low}`,
      );
    }
  };

  /* Base weights ---------------------------------------------------------- */
  const weights = config.baseWeights as Record<string, unknown>;
  let total = 0;
  for (const feature of FEATURE_NAMES) {
    total += requireNumber(weights[feature], `baseWeights.${feature}`, { min: 0 });
  }
  if (total <= 0) throw new Error("Invalid ranking config: baseWeights must sum to a positive value");

  for (const key of Object.keys(weights)) {
    if (!(FEATURE_NAMES as readonly string[]).includes(key)) {
      throw new Error(`Invalid ranking config at "baseWeights.${key}": unknown feature`);
    }
  }

  /* Request-aware multipliers --------------------------------------------- */
  // A boost of 0 would silence a feature the student explicitly asked for, and
  // a negative one would invert it, so both are rejected.
  requireNumber(config.requestAware.focusSkillBoost, "requestAware.focusSkillBoost", { min: 0.000_001 });
  requireNumber(config.requestAware.teachingStyleBoost, "requestAware.teachingStyleBoost", {
    min: 0.000_001,
  });

  /* Scales ---------------------------------------------------------------- */
  for (const domain of ["IELTS", "SAT", "HSK"] as const) {
    requireScale(config.credentialScale[domain], `credentialScale.${domain}`);
  }
  requireScale(config.sectionScale.IELTS, "sectionScale.IELTS");
  requireScale(config.sectionScale.SAT, "sectionScale.SAT");
  requireScale(config.rating, "rating");

  /* Focus-skill sub-weights ----------------------------------------------- */
  const taught = requireNumber(config.focusSkill.taughtWeight, "focusSkill.taughtWeight", { min: 0 });
  const band = requireNumber(config.focusSkill.bandWeight, "focusSkill.bandWeight", { min: 0 });
  if (taught + band <= 0) {
    throw new Error("Invalid ranking config: focusSkill weights must sum to a positive value");
  }

  /* Experience ------------------------------------------------------------ */
  const sessions = requireNumber(config.experience.sessionsWeight, "experience.sessionsWeight", {
    min: 0,
  });
  const months = requireNumber(config.experience.monthsWeight, "experience.monthsWeight", { min: 0 });
  if (sessions + months <= 0) {
    throw new Error("Invalid ranking config: experience weights must sum to a positive value");
  }
  // A rate of 0 would make experience constant at 0 for everyone.
  requireNumber(config.experience.sessionsRate, "experience.sessionsRate", { min: 0.000_001 });
  requireNumber(config.experience.monthsRate, "experience.monthsRate", { min: 0.000_001 });

  /* Budget ---------------------------------------------------------------- */
  requireNumber(config.budget.floorAtMax, "budget.floorAtMax", { min: 0, max: 1 });

  /* Explanation ----------------------------------------------------------- */
  /** Asserts a whole number, since these are counts of things to display. */
  const requireInteger = (value: unknown, path: string, min: number): void => {
    const parsed = requireNumber(value, path, { min });
    if (!Number.isInteger(parsed)) {
      throw new Error(`Invalid ranking config at "${path}": ${parsed} must be a whole number`);
    }
  };

  // At least one reason, or a recommendation arrives with no justification at
  // all. Zero tradeoffs is legitimate — some deployments may not show them.
  requireInteger(config.explanation.maxReasons, "explanation.maxReasons", 1);
  requireInteger(config.explanation.maxTradeoffs, "explanation.maxTradeoffs", 0);
}

/* -------------------------------------------------------------------------- */
/* Scoring                                                                    */
/* -------------------------------------------------------------------------- */

/** A scored mentor, with the feature set retained for tie-breaking. */
interface ScoredMentor {
  mentor: Mentor;
  features: FeatureSet;
  matchScore: number;
  scoreBreakdown: Partial<Record<FeatureName, number>>;
  weights: Partial<Record<FeatureName, number>>;
  dataCoverage: number;
}

/** Rounds to 2 decimals. Applied to the displayed score only. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Scores one mentor against one request.
 *
 * Weight redistribution happens here: features with no data are excluded, and
 * the remaining weights are renormalised to sum to 1. A mentor with no usable
 * feature at all scores 0 with `dataCoverage` 0 — the honest answer, since we
 * know nothing that bears on the request.
 *
 * `scoreBreakdown` and `weights` are kept at **full precision**, and only
 * `matchScore` is rounded. That is what makes a score auditable: anyone can
 * recompute `100 × Σ(weight × feature)` from the returned numbers and land on
 * the reported score, to within final-display rounding. Rounding the parts
 * would leave a residue nobody could account for.
 */
function scoreMentor(
  request: StudentRequest,
  mentor: Mentor,
  config: RankingConfig,
  adjustedWeights: Record<FeatureName, number>,
): ScoredMentor {
  const features = buildFeatures(request, mentor, config);

  let availableWeight = 0;
  let applicableWeight = 0;
  let observedWeight = 0;
  const scoreBreakdown: Partial<Record<FeatureName, number>> = {};

  for (const feature of FEATURE_NAMES) {
    const weight = adjustedWeights[feature];
    if (features.applicable[feature]) {
      applicableWeight += weight;
      // Evidence is fractional for partially observed features, so a mentor we
      // only half-know is reported as half-covered rather than fully covered.
      observedWeight += weight * features.evidence[feature];
    }

    const value = features.values[feature];
    if (value === null) continue;

    availableWeight += weight;
    scoreBreakdown[feature] = value;
  }

  const weights: Partial<Record<FeatureName, number>> = {};
  let weighted = 0;

  if (availableWeight > 0) {
    for (const feature of FEATURE_NAMES) {
      const value = features.values[feature];
      if (value === null) continue;
      const normalisedWeight = adjustedWeights[feature] / availableWeight;
      weights[feature] = normalisedWeight;
      weighted += normalisedWeight * value;
    }
  }

  return {
    mentor,
    features,
    matchScore: round2(weighted * 100),
    scoreBreakdown,
    weights,
    // Inapplicable features are excluded from both sides: a student who stated
    // no budget has not left a gap in the mentor's record.
    dataCoverage: applicableWeight > 0 ? observedWeight / applicableWeight : 1,
  };
}

/** Reads a feature for tie-breaking; missing data sorts last. */
function tieValue(scored: ScoredMentor, feature: FeatureName): number {
  return scored.features.values[feature] ?? -1;
}

/**
 * Total ordering over scored mentors: score first, then {@link TIE_BREAK_ORDER}.
 *
 * @returns Negative when `a` outranks `b`.
 */
function compareScored(a: ScoredMentor, b: ScoredMentor): number {
  if (a.matchScore !== b.matchScore) return b.matchScore - a.matchScore;
  if (a.dataCoverage !== b.dataCoverage) return b.dataCoverage - a.dataCoverage;

  const subject = tieValue(b, "subjectExpertise") - tieValue(a, "subjectExpertise");
  if (subject !== 0) return subject;

  const focus = tieValue(b, "focusSkillStrength") - tieValue(a, "focusSkillStrength");
  if (focus !== 0) return focus;

  const sessions = (b.mentor.sessionsCompleted ?? -1) - (a.mentor.sessionsCompleted ?? -1);
  if (sessions !== 0) return sessions;

  const price = a.mentor.pricePerHour - b.mentor.pricePerHour;
  if (price !== 0) return price;

  // Unique within a candidate set, so the ordering is total.
  return a.mentor.id.localeCompare(b.mentor.id);
}

/* -------------------------------------------------------------------------- */
/* Ranking                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Ranks eligible mentors for a request.
 *
 * Expects mentors that have already passed {@link applyHardConstraints}; it
 * applies no eligibility rules of its own and will happily rank an ineligible
 * mentor if handed one. That is deliberate: eligibility lives in exactly one
 * place, so it can be audited in exactly one place.
 *
 * @param request - Canonical, validated student request.
 * @param mentors - Eligible mentors to order.
 * @param options - Optional config override and `topK` truncation.
 * @returns Ranked mentors, best first, with 1-based `rank`.
 */
export function rankMentors(
  request: StudentRequest,
  mentors: readonly Mentor[],
  options: RankOptions = {},
): RankedMentor[] {
  const config = options.config ?? rankingConfig;
  validateRankingConfig(config);

  const adjustedWeights = requestAwareWeights(request, config);
  const scored = mentors.map((mentor) => scoreMentor(request, mentor, config, adjustedWeights));

  // `sort` is not required to be stable across engines for large arrays, which
  // is precisely why the comparator is a total order rather than score-only.
  scored.sort(compareScored);

  const limit = options.topK === undefined ? scored.length : Math.max(0, options.topK);

  return scored.slice(0, limit).map((entry, index) => ({
    mentorId: entry.mentor.id,
    rank: index + 1,
    matchScore: entry.matchScore,
    scoreBreakdown: entry.scoreBreakdown,
    weights: entry.weights,
    dataCoverage: entry.dataCoverage,
  }));
}
