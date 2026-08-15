/**
 * Pure metric functions for the evaluation harness.
 *
 * Split from the benchmark runner so each one can be tested against worked
 * examples — a metric nobody has verified is worse than no metric, because it
 * produces a number people will quote.
 *
 * Two families live here and they must never be confused:
 *
 * - **Engineering metrics** (latency, determinism, violation rates) measure
 *   whether the engine *works*. They need no human input and are reported
 *   unconditionally.
 * - **Quality metrics** (NDCG, Precision, pairwise agreement) measure whether
 *   the engine is *right*. They are meaningless without human labels, so every
 *   function here takes labels as an argument and there is no code path that
 *   invents them.
 */

/** A human relevance judgement for one mentor in one scenario. */
export interface RelevanceLabel {
  mentorId: string;
  /** Graded relevance, higher is better. Convention: 0 = unsuitable, 3 = ideal. */
  relevance: number;
}

/* -------------------------------------------------------------------------- */
/* Distribution helpers                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Returns the value at a percentile using the nearest-rank method.
 *
 * Nearest-rank rather than interpolation: with a few hundred samples the
 * interpolated value is a number no observation actually took, which invites
 * false precision in a latency report.
 *
 * @param values - Samples; not mutated.
 * @param percentile - Percentile in `[0, 100]`.
 * @returns The sample at that percentile, or 0 for an empty input.
 */
export function percentile(values: readonly number[], percentile: number): number {
  if (values.length === 0) return 0;

  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((percentile / 100) * sorted.length);
  const index = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[index] as number;
}

/** Rounds to a fixed number of decimals, for stable report output. */
export function round(value: number, decimals = 4): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/* -------------------------------------------------------------------------- */
/* Quality metrics — require human labels                                     */
/* -------------------------------------------------------------------------- */

/** Discounted cumulative gain over an ordered list of relevance grades. */
function dcg(relevances: readonly number[]): number {
  return relevances.reduce(
    (sum, relevance, index) => sum + (2 ** relevance - 1) / Math.log2(index + 2),
    0,
  );
}

/**
 * Normalised discounted cumulative gain at K.
 *
 * **Requires complete labels over the evaluation universe.** An unlabeled
 * candidate has no relevance — treating it as 0 invents a negative human
 * judgement, and the ideal ranking cannot be established without knowing every
 * candidate's grade. When labels are incomplete this returns `null`, and the
 * caller reports the metric as not measured.
 *
 * @param rankedMentorIds - The engine's ordering, best first.
 * @param labels - Human relevance judgements for this scenario.
 * @param k - Cutoff.
 * @param universe - Every candidate in the evaluation universe. Defaults to the
 *   ranked list, which is the universe when the ranking covers all candidates.
 * @returns NDCG in `[0, 1]`, or `null` when the labels are not complete enough.
 */
export function ndcgAtK(
  rankedMentorIds: readonly string[],
  labels: readonly RelevanceLabel[],
  k: number,
  universe: readonly string[] = rankedMentorIds,
): number | null {
  if (labels.length === 0) return null;

  const byId = new Map(labels.map((label) => [label.mentorId, label.relevance]));
  // Every candidate must be graded, or the ideal ranking is unknowable and the
  // top-K gains would rest on invented zeros.
  if (universe.some((mentorId) => !byId.has(mentorId))) return null;

  const actual = dcg(rankedMentorIds.slice(0, k).map((id) => byId.get(id) ?? 0));
  const ideal = dcg(
    universe
      .map((mentorId) => byId.get(mentorId) as number)
      .sort((a, b) => b - a)
      .slice(0, k),
  );

  return ideal === 0 ? null : round(actual / ideal);
}

/**
 * Precision at K: the share of the top K judged relevant.
 *
 * **Requires every one of the top K to be labelled.** Scoring over "the judged
 * subset of the top 3" silently changes the denominator, so a run where two of
 * three recommendations were never looked at would report a precision as if it
 * had been fully reviewed.
 *
 * @param rankedMentorIds - The engine's ordering, best first.
 * @param labels - Human relevance judgements.
 * @param k - Cutoff.
 * @param threshold - Minimum relevance counted as "relevant".
 * @returns Precision in `[0, 1]`, or `null` when any of the top K is unlabelled.
 */
export function precisionAtK(
  rankedMentorIds: readonly string[],
  labels: readonly RelevanceLabel[],
  k: number,
  threshold = 2,
): number | null {
  if (labels.length === 0) return null;

  const byId = new Map(labels.map((label) => [label.mentorId, label.relevance]));
  const top = rankedMentorIds.slice(0, k);
  if (top.length === 0) return null;
  if (top.some((mentorId) => !byId.has(mentorId))) return null;

  const relevant = top.filter((id) => (byId.get(id) as number) >= threshold).length;
  return round(relevant / top.length);
}

/**
 * Pairwise ranking agreement with human judgement.
 *
 * For every pair the humans ordered strictly (one graded above the other),
 * checks whether the engine put them in the same order. Pairs the humans graded
 * equally carry no information and are skipped.
 *
 * @param rankedMentorIds - The engine's ordering, best first.
 * @param labels - Human relevance judgements.
 * @returns Agreement in `[0, 1]`, or `null` when no strictly-ordered pair exists.
 */
export function pairwiseAgreement(
  rankedMentorIds: readonly string[],
  labels: readonly RelevanceLabel[],
): number | null {
  const position = new Map(rankedMentorIds.map((id, index) => [id, index]));
  const judged = labels.filter((label) => position.has(label.mentorId));

  let comparable = 0;
  let agreed = 0;

  for (let i = 0; i < judged.length; i++) {
    for (let j = i + 1; j < judged.length; j++) {
      const a = judged[i] as RelevanceLabel;
      const b = judged[j] as RelevanceLabel;
      if (a.relevance === b.relevance) continue;

      comparable++;
      const humanPrefersA = a.relevance > b.relevance;
      const enginePrefersA = (position.get(a.mentorId) as number) < (position.get(b.mentorId) as number);
      if (humanPrefersA === enginePrefersA) agreed++;
    }
  }

  return comparable === 0 ? null : round(agreed / comparable);
}

/* -------------------------------------------------------------------------- */
/* Comparison metrics — engine against a baseline                             */
/* -------------------------------------------------------------------------- */

/**
 * Kendall's tau-b between two orderings of the same mentors.
 *
 * Measures how differently two rankers order the same candidates: `1` is
 * identical, `-1` is reversed, `0` is unrelated.
 *
 * This is a *divergence* measure, not a quality one. A low tau says the two
 * rankers disagree; it says nothing about which is right. Only human labels can
 * answer that.
 *
 * @param a - First ordering, best first.
 * @param b - Second ordering, best first.
 * @returns Tau in `[-1, 1]`, or `null` when fewer than two mentors are shared.
 */
export function kendallTau(a: readonly string[], b: readonly string[]): number | null {
  const positionB = new Map(b.map((id, index) => [id, index]));
  const shared = a.filter((id) => positionB.has(id));
  if (shared.length < 2) return null;

  let concordant = 0;
  let discordant = 0;

  for (let i = 0; i < shared.length; i++) {
    for (let j = i + 1; j < shared.length; j++) {
      const first = shared[i] as string;
      const second = shared[j] as string;
      // `shared` preserves a's order, so i before j means a prefers `first`.
      const bPrefersFirst = (positionB.get(first) as number) < (positionB.get(second) as number);
      if (bPrefersFirst) concordant++;
      else discordant++;
    }
  }

  const pairs = concordant + discordant;
  return pairs === 0 ? null : round((concordant - discordant) / pairs);
}

/**
 * Overlap between two top-K sets (Jaccard index).
 *
 * @param a - First ordering.
 * @param b - Second ordering.
 * @param k - Cutoff.
 * @returns Overlap in `[0, 1]`, or `null` when both top-K sets are empty.
 */
export function topKOverlap(a: readonly string[], b: readonly string[], k: number): number | null {
  const setA = new Set(a.slice(0, k));
  const setB = new Set(b.slice(0, k));
  if (setA.size === 0 && setB.size === 0) return null;

  const intersection = [...setA].filter((id) => setB.has(id)).length;
  const union = new Set([...setA, ...setB]).size;
  return round(intersection / union);
}

/**
 * Averages the non-null values of a sample, reporting how many were usable.
 *
 * Keeps "we measured 40 scenarios and averaged 12" visible, instead of quietly
 * treating unmeasurable scenarios as zeros.
 *
 * @param values - Per-scenario values, `null` where not measurable.
 */
export function meanOfMeasured(values: readonly (number | null)[]): {
  mean: number | null;
  measured: number;
  total: number;
} {
  const measured = values.filter((value): value is number => value !== null);
  return {
    mean: measured.length === 0 ? null : round(measured.reduce((a, b) => a + b, 0) / measured.length),
    measured: measured.length,
    total: values.length,
  };
}
