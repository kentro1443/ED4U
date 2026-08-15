/**
 * Baseline rankers: the bar `rankerV1` has to clear.
 *
 * A ranker with no baseline is unfalsifiable — any output looks reasonable if
 * there is nothing simpler to compare it against. These two exist so the
 * benchmark can answer "does the extra machinery actually change anything, and
 * in which direction?"
 *
 * Both are deliberately *dumber* than `rankerV1`, in different ways:
 *
 * - **Baseline A** ignores everything except the headline credential. It is the
 *   ranking a spreadsheet gives you, and it is a genuinely hard baseline for
 *   credential-led requests.
 * - **Baseline B** scores the same features but with fixed weights, no
 *   request-aware boosts, and — importantly — treats missing data as zero
 *   rather than redistributing. That isolates the two things `rankerV1` adds:
 *   listening to what the student asked for, and refusing to punish gaps in our
 *   own records.
 *
 * Like `rankerV1`, neither removes anyone: eligibility is decided once, by the
 * hard filter.
 */

import { FEATURE_NAMES, buildFeatures, rankingConfig } from "../features/featureBuilder.js";
import type { RankingConfig } from "../features/featureBuilder.js";
import { headlineCredentialScore } from "../schemas/mentor.js";
import type { Mentor } from "../schemas/mentor.js";
import type { StudentRequest } from "../schemas/request.js";

/** One entry in a baseline ranking. */
export interface BaselineRankedMentor {
  mentorId: string;
  /** 1-based position. */
  rank: number;
  /**
   * The baseline's own score. Its scale is baseline-specific and comparable
   * only within that baseline — never against `matchScore`.
   */
  score: number;
}

/** Options shared by the baselines. */
export interface BaselineOptions {
  /** Truncate to the first K after ranking. Omit to return every mentor. */
  topK?: number;
  /** Ranking configuration; defaults to `config/weights.v1.json`. */
  config?: RankingConfig;
}

/** Applies the shared truncation and rank numbering. */
function finalise(
  scored: readonly { mentor: Mentor; score: number }[],
  topK: number | undefined,
): BaselineRankedMentor[] {
  const limit = topK === undefined ? scored.length : Math.max(0, topK);
  return scored
    .slice(0, limit)
    .map((entry, index) => ({ mentorId: entry.mentor.id, rank: index + 1, score: entry.score }));
}

/**
 * **Baseline A** — sort eligible mentors by their credential in the goal domain.
 *
 * Mentors with no credential on record sort last (score `-1`), because there is
 * nothing to sort them by — not because they are known to be weak. Ties break
 * by mentor id, so the ordering is total and reproducible.
 *
 * @param request - Canonical, validated request.
 * @param mentors - Eligible mentors.
 * @param options - Optional `topK`.
 */
export function baselineACredentialSort(
  request: StudentRequest,
  mentors: readonly Mentor[],
  options: BaselineOptions = {},
): BaselineRankedMentor[] {
  const domain = request.goal.domain;

  const scored = mentors
    .map((mentor) => ({
      mentor,
      score: headlineCredentialScore(mentor.credentials, domain) ?? -1,
    }))
    .sort((a, b) => b.score - a.score || a.mentor.id.localeCompare(b.mentor.id));

  return finalise(scored, options.topK);
}

/**
 * **Baseline B** — a static, non-request-aware weighted score.
 *
 * Differs from `rankerV1` in exactly two ways, which is the point:
 *
 * 1. No request-aware boosts — naming a focus skill does not change the weights.
 * 2. No weight redistribution — a feature with no data contributes `0 × weight`
 *    rather than being dropped, so a mentor is penalised for gaps in our
 *    records.
 *
 * Weights are the configured base weights, normalised over the features that
 * apply to the request. Scores are on the same 0–100 scale for readability, but
 * are still a *baseline* score and not comparable with `matchScore`.
 *
 * @param request - Canonical, validated request.
 * @param mentors - Eligible mentors.
 * @param options - Optional `topK` and config override.
 */
export function baselineBStaticWeighted(
  request: StudentRequest,
  mentors: readonly Mentor[],
  options: BaselineOptions = {},
): BaselineRankedMentor[] {
  const config = options.config ?? rankingConfig;
  const weights = config.baseWeights;

  const scored = mentors
    .map((mentor) => {
      const features = buildFeatures(request, mentor, config);

      let applicableWeight = 0;
      let weighted = 0;

      for (const feature of FEATURE_NAMES) {
        if (!features.applicable[feature]) continue;
        applicableWeight += weights[feature];
        // Missing data scores zero here — the naive choice this baseline exists
        // to represent.
        weighted += weights[feature] * (features.values[feature] ?? 0);
      }

      return {
        mentor,
        score: applicableWeight > 0 ? (weighted / applicableWeight) * 100 : 0,
      };
    })
    .sort((a, b) => b.score - a.score || a.mentor.id.localeCompare(b.mentor.id));

  return finalise(scored, options.topK);
}

/** The baselines the benchmark compares against, by stable identifier. */
export const BASELINES = {
  baselineA: baselineACredentialSort,
  baselineB: baselineBStaticWeighted,
} as const;

/** Identifier of a baseline ranker. */
export type BaselineName = keyof typeof BASELINES;
