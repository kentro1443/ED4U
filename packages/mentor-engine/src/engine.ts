/**
 * `matchMentors` — the single high-level entry point.
 *
 * This is orchestration and nothing else. It contains no filtering rule, no
 * feature, no weight and no sentence: it composes the modules that were each
 * verified on their own, and assembles their output into one serializable
 * {@link MatchResponse}.
 *
 * That restraint is deliberate. Duplicating a constraint check here would give
 * the engine two places where eligibility is decided, and the Phase 4 guarantee
 * — that a hard violation is unrecoverable — would stop being checkable in one
 * place.
 *
 * ```text
 * validated request + mentors
 *        |
 *        v
 *   applyHardConstraints   (Phase 4)
 *        |
 *        v
 *   rankMentors            (Phase 5)
 *        |
 *        v
 *   explainRecommendations (Phase 6)
 *        |
 *        v
 *      MatchResponse
 * ```
 *
 * No network, no database and no filesystem access. Given the same inputs and
 * config it returns the same decision output; observational timing
 * (`diagnostics.latencyMs`) is intentionally nondeterministic.
 */

import { rankingConfig } from "./features/featureBuilder.js";
import type { RankingConfig } from "./features/featureBuilder.js";
import { applyHardConstraints } from "./filtering/hardConstraints.js";
import { ALIASES_VERSION, ONTOLOGY_VERSION } from "./normalization/canonicalizer.js";
import { explainRecommendations } from "./explanation/explainer.js";
import { rankMentors } from "./ranking/rankerV1.js";
import type { Mentor } from "./schemas/mentor.js";
import type { StudentRequest } from "./schemas/request.js";
import type { MatchResponse, RequestResolution } from "./schemas/result.js";
import { ENGINE_VERSION, SCHEMA_VERSION } from "./schemas/validation.js";
import { PACKAGE_VERSION } from "./version.js";

/** Default number of recommendations returned. */
export const DEFAULT_TOP_K = 5;

/** Everything `matchMentors` needs. */
export interface MatchMentorsInput {
  /** Canonical, already-validated student request. */
  request: StudentRequest;
  /** Canonical, already-validated candidate mentors. */
  mentors: readonly Mentor[];
  /** How many recommendations to return. Defaults to {@link DEFAULT_TOP_K}. */
  topK?: number;
  /** Ranking configuration; defaults to `config/weights.v1.json`. */
  config?: RankingConfig;
  /**
   * Resolution report from the Phase 2 resolver or Phase 8 parser, when the
   * caller went through one.
   *
   * Optional because a caller submitting an already-canonical request has
   * nothing to resolve. When omitted, the response reports full coverage with no
   * criteria — an honest description of "nothing needed interpreting", not a
   * fabricated success.
   */
  resolution?: RequestResolution;
}

/** Validates V1 Top-K semantics instead of inheriting accidental Array.slice behaviour. */
function requireTopK(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
    throw new RangeError("topK must be a finite positive integer (>= 1)");
  }
  return value;
}

/** A request that needed no interpretation, described honestly. */
const NOTHING_TO_RESOLVE: RequestResolution = {
  status: "RESOLVED",
  coverage: 1,
  resolved: [],
  unresolved: [],
};

/**
 * Matches mentors to a request and explains the result.
 *
 * Expects canonical input that has already passed `validateStudentRequest` and
 * `validateMentors`. Validation is the adapter's boundary, not this function's:
 * re-validating here would hide adapter bugs behind a silent second chance.
 *
 * @param input - Request, candidate mentors, and optional Top-K/config.
 * @returns A complete, JSON-serializable {@link MatchResponse}. When no mentor
 *   satisfies the hard constraints, `recommendations` is empty and
 *   `diagnostics.noFeasibleMatch` is `true` — constraints are never relaxed to
 *   manufacture a result.
 */
export function matchMentors(input: MatchMentorsInput): MatchResponse {
  const startedAt = performance.now();
  const { request, mentors } = input;
  const topK = requireTopK(input.topK ?? DEFAULT_TOP_K);
  const config = input.config ?? rankingConfig;

  /* Phase 4 — who is eligible. */
  const filtered = applyHardConstraints(request, mentors);

  /* Phase 5 + 6 — order the survivors and say why. */
  const ranked = rankMentors(request, filtered.eligible, { topK, config });
  const recommendations = explainRecommendations(request, ranked, filtered.eligible, { config });

  const noFeasibleMatch = filtered.status === "NO_FEASIBLE_MATCH";

  return {
    engineVersion: ENGINE_VERSION,
    packageVersion: PACKAGE_VERSION,
    schemaVersion: SCHEMA_VERSION,
    configVersions: {
      ontology: ONTOLOGY_VERSION,
      aliases: ALIASES_VERSION,
      weights: config.version,
    },
    requestResolution: input.resolution ?? NOTHING_TO_RESOLVE,
    recommendations,
    diagnostics: {
      candidateCount: filtered.diagnostics.candidateCount,
      eligibleCount: filtered.diagnostics.eligibleCount,
      filteredOut: filtered.diagnostics.filteredOut,
      filteredOutByReason: filtered.diagnostics.filteredOutByReason,
      latencyMs: Math.round((performance.now() - startedAt) * 1000) / 1000,
      ...(noFeasibleMatch ? { noFeasibleMatch: true } : {}),
      ...(request.goal.focusSkills.length > 0 ? { focusSkills: request.goal.focusSkills } : {}),
    },
  };
}
