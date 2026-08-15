/**
 * Canonical response contract.
 *
 * Phase 1 fixes the *shape* of what the engine returns so later phases (and the
 * ED4U server adapter) can be written against a stable contract. The
 * producers live in Phases 2–6; nothing here executes matching logic.
 *
 * Every type in this file must be JSON-serializable: the same payload has to
 * survive a `POST /v1/match/mentor` boundary unchanged if the implementation is
 * ever moved out of process.
 */

import type { Skill } from "./validation.js";

/* -------------------------------------------------------------------------- */
/* Criterion resolution                                                       */
/* -------------------------------------------------------------------------- */

/** Every status a single requested criterion can end in. */
export const RESOLUTION_STATUSES = [
  /** Mapped to a canonical value by exact/alias match. */
  "RESOLVED",
  /** Mapped by a semantic (non-exact) method; requires review. */
  "SEMANTICALLY_RESOLVED",
  /** Matches more than one canonical value; not safe to execute. */
  "AMBIGUOUS",
  /** Understood, but the engine has no canonical feature for it. */
  "UNSUPPORTED",
  /** Canonical, but the data needed to evaluate it is absent. */
  "MISSING_DATA",
  /** Structurally invalid or contradicted by another criterion. */
  "REJECTED",
] as const;

/** Status of a single requested criterion. */
export type ResolutionStatus = (typeof RESOLUTION_STATUSES)[number];

/** A criterion the engine mapped onto a canonical value. */
export interface ResolvedCriterion {
  /** Which request field the criterion came from, e.g. `FOCUS_SKILL`. */
  kind: string;
  /** The student's original text or value, verbatim. */
  raw: string;
  /** The canonical value it maps to. */
  canonical: string;
  status: Extract<ResolutionStatus, "RESOLVED" | "SEMANTICALLY_RESOLVED">;
}

/** A criterion the engine could not (or must not) execute. */
export interface UnresolvedCriterion {
  /** Which request field the criterion came from, e.g. `ADDITIONAL_PREFERENCE`. */
  kind: string;
  /** The student's original text or value, verbatim — never discarded. */
  raw: string;
  status: Exclude<ResolutionStatus, "RESOLVED" | "SEMANTICALLY_RESOLVED">;
  /** Machine-readable reason code, e.g. `NO_CANONICAL_FEATURE`. */
  reason: string;
  /** Candidate canonical values, when the status is `AMBIGUOUS`. */
  candidates?: string[];
}

/** Overall outcome of resolving a request's criteria. */
export type RequestResolutionStatus = "RESOLVED" | "PARTIALLY_RESOLVED" | "UNRESOLVED";

/** How much of the student's request the engine was able to execute. */
export interface RequestResolution {
  status: RequestResolutionStatus;
  /** Supported criteria / requested criteria, in `[0, 1]`. */
  coverage: number;
  resolved: ResolvedCriterion[];
  unresolved: UnresolvedCriterion[];
}

/* -------------------------------------------------------------------------- */
/* Recommendations                                                            */
/* -------------------------------------------------------------------------- */

/** Per-feature scores, each in `[0, 1]`, keyed by feature name. */
export type ScoreBreakdown = Record<string, number>;

/** A single ranked mentor, with the evidence behind its position. */
export interface MentorRecommendation {
  mentorId: string;
  /** 1-based position in the returned list. */
  rank: number;
  /**
   * Weighted score on a 0–100 scale. This is a *ranking* score: it is not a
   * probability of success and must never be presented as one.
   */
  matchScore: number;
  scoreBreakdown: ScoreBreakdown;
  /**
   * The normalised weights actually applied, at full precision.
   *
   * Carried through to the response so a recommendation is auditable on its
   * own: `matchScore ≈ 100 × Σ(appliedWeights[f] × scoreBreakdown[f])`. Without
   * it, a stored recommendation cannot be re-derived and the score becomes a
   * number the reader has to take on trust.
   */
  appliedWeights: ScoreBreakdown;
  /** Factual statements derived from mentor data, never from an LLM in V1. */
  reasons: string[];
  /** Factual disadvantages relative to other ranked candidates. */
  tradeoffs: string[];
  /** Share of the features that had real data behind them, in `[0, 1]`. */
  dataCoverage: number;
}

/* -------------------------------------------------------------------------- */
/* Diagnostics and response                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Reasons a mentor can be removed by the hard-constraint filter.
 *
 * The three credential reasons are deliberately distinct. Collapsing them would
 * report "this mentor does not have a 7.0" when the truth is "we have never
 * been told what they have" — a claim about data we do not hold.
 */
export const FILTER_REASONS = [
  /** Does not teach the requested domain. */
  "DOMAIN",
  /** Unverified while the request demanded verified mentors. */
  "UNVERIFIED",
  /** Hourly price above the stated maximum. */
  "PRICE",
  /** No usable overlap with the requested slots. */
  "AVAILABILITY",
  /** Holds a credential in the domain, but below the required minimum. */
  "CREDENTIAL_MINIMUM",
  /** Explicitly holds no credential in the domain (`null`). */
  "CREDENTIAL_ABSENT",
  /** Credential in the domain is unknown, so the minimum cannot be verified. */
  "CREDENTIAL_UNKNOWN",
  /** Does not teach every explicitly required skill. */
  "REQUIRED_EXPERTISE",
  /** Structurally unusable, e.g. a duplicate mentor id within one candidate set. */
  "INVALID_RECORD",
] as const;

/** A single hard-constraint filter reason. */
export type FilterReason = (typeof FILTER_REASONS)[number];

/** Counts and timings describing how a match was produced. */
export interface MatchDiagnostics {
  /** Mentors supplied to the engine. */
  candidateCount: number;
  /** Mentors surviving every hard constraint. */
  eligibleCount: number;
  /**
   * Each removed mentor counted **once**, under their primary filter reason.
   * Sums exactly to `candidateCount - eligibleCount`, so it reads as a funnel.
   */
  filteredOut: Partial<Record<FilterReason, number>>;
  /**
   * Every failed constraint counted, so one mentor failing three constraints
   * contributes to three buckets. Answers "how many mentors were too expensive"
   * independently of whatever else was wrong with them.
   */
  filteredOutByReason: Partial<Record<FilterReason, number>>;
  /** Wall-clock duration of the match call, in milliseconds. */
  latencyMs: number;
  /** Set when no mentor satisfies the hard constraints. */
  noFeasibleMatch?: boolean;
  /** Skills the request targeted, echoed for debuggability. */
  focusSkills?: Skill[];
}

/** The engine's complete, serializable answer to one request. */
export interface MatchResponse {
  /** Version of the engine contract that produced this response. */
  engineVersion: string;
  /** Exact package/artifact version that executed this match. */
  packageVersion: string;
  /** Version of the data contract this payload conforms to. */
  schemaVersion: string;
  /**
   * Versions of the configuration that produced this result.
   *
   * A persisted match run is only reproducible if you know which ontology,
   * alias table and weight file were in force — the scores are a function of
   * all three.
   */
  configVersions: {
    ontology: string;
    aliases: string;
    weights: string;
  };
  requestResolution: RequestResolution;
  /** Ranked mentors, best first, at most `topK` entries. */
  recommendations: MentorRecommendation[];
  diagnostics: MatchDiagnostics;
}
