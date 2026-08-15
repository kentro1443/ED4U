/**
 * Criterion kinds, reason codes and coverage arithmetic for resolution.
 *
 * The engine executes a **closed world**: only criteria that map onto the
 * versioned ontology can influence matching. Students, however, write in an
 * **open world**. This module names the vocabulary used to report that gap
 * honestly — every criterion the student expressed ends up with exactly one
 * status, and nothing is ever dropped on the floor.
 */

import type { RequestResolutionStatus, ResolutionStatus } from "../schemas/result.js";

/** Which part of a request a criterion came from. */
export const CRITERION_KINDS = [
  "DOMAIN",
  "CURRENT_SCORE",
  "TARGET_SCORE",
  "FOCUS_SKILL",
  "VERIFIED_ONLY",
  "BUDGET",
  "MIN_CREDENTIAL",
  "REQUIRED_EXPERTISE",
  "REQUIRE_ALL_AVAILABILITY",
  "AVAILABILITY",
  "TEACHING_STYLE",
  "LANGUAGE",
  "GENDER",
  "ADDITIONAL_PREFERENCE",
  /** A field the contract does not define, reported rather than dropped. */
  "UNKNOWN_FIELD",
  /** A container (`goal`, `hardConstraints`, …) that was not an object. */
  "REQUEST_STRUCTURE",
] as const;

/** The request field a criterion originated from. */
export type CriterionKind = (typeof CRITERION_KINDS)[number];

/**
 * Machine-readable reasons a criterion could not be executed.
 *
 * Codes are stable API: UIs and the Phase 8 parser branch on them, so add new
 * codes rather than repurposing existing ones.
 */
export const UNRESOLVED_REASONS = [
  /** Understood, but the ontology has no feature for it (free-text wishes). */
  "NO_CANONICAL_FEATURE",
  /** A domain outside the V1 set (e.g. TOEFL). */
  "UNSUPPORTED_DOMAIN",
  /** A skill token that is not in the alias tables at all. */
  "UNKNOWN_SKILL",
  /** A known skill that the requested domain does not have (e.g. HSK speaking). */
  "SKILL_NOT_IN_DOMAIN",
  /** Maps to more than one canonical value and no context disambiguates it. */
  "MULTIPLE_CANDIDATES",
  /** Canonical in principle, but the domain needed to interpret it is unknown. */
  "MISSING_DOMAIN_CONTEXT",
  /** Blank or whitespace-only criterion. */
  "EMPTY_CRITERION",
  /** Two or more mutually exclusive budgets were supplied. */
  "CONTRADICTORY_BUDGET",
  /** Target score is not above the current score. */
  "CONTRADICTORY_SCORE_GOAL",
  /** Several mutually exclusive values were supplied for a single-valued preference. */
  "CONTRADICTORY_PREFERENCE",
  /** A score that does not exist on the goal domain's scale. */
  "INVALID_SCORE_FOR_DOMAIN",
  /** A price that is not a non-negative integer number of VND. */
  "INVALID_PRICE",
  /** A skill required in a domain other than the goal domain. */
  "DOMAIN_MISMATCH",
  /** Not one of the closed vocabulary values for its field. */
  "UNKNOWN_VALUE",
  /** Recognisable slot syntax at a granularity the ontology does not model. */
  "UNSUPPORTED_SLOT_GRANULARITY",
  /** Wrong JavaScript type for the field (e.g. an object where a string is required). */
  "INVALID_TYPE",
  /** Canonical values were produced but the assembled request failed schema validation. */
  "SCHEMA_REJECTED",
  /** A field name the canonical request contract does not define. */
  "UNKNOWN_FIELD",
] as const;

/** Machine-readable reason a criterion was not executed. */
export type UnresolvedReason = (typeof UNRESOLVED_REASONS)[number];

/** Statuses that mean "the engine may act on this criterion". */
export type ResolvedStatus = Extract<ResolutionStatus, "RESOLVED" | "SEMANTICALLY_RESOLVED">;

/** Statuses that mean "the engine must not act on this criterion". */
export type UnresolvedStatus = Exclude<ResolutionStatus, ResolvedStatus>;

/**
 * Rounds coverage to four decimals.
 *
 * Coverage is compared in tests and stored in reports, so it must not carry
 * binary floating-point noise (`0.7999999999999999`).
 *
 * @param value - Raw ratio.
 */
function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/**
 * Computes the share of requested criteria the engine can actually execute.
 *
 * @param resolvedCount - Criteria mapped onto canonical values.
 * @param unresolvedCount - Criteria the engine will not execute.
 * @returns Coverage in `[0, 1]`; `1` when no criteria were supplied at all
 *   (nothing was requested, so nothing was missed).
 */
export function computeCoverage(resolvedCount: number, unresolvedCount: number): number {
  const total = resolvedCount + unresolvedCount;
  return total === 0 ? 1 : round4(resolvedCount / total);
}

/**
 * Derives the overall resolution status from per-criterion outcomes.
 *
 * @param resolvedCount - Criteria mapped onto canonical values.
 * @param unresolvedCount - Criteria the engine will not execute.
 */
export function deriveResolutionStatus(
  resolvedCount: number,
  unresolvedCount: number,
): RequestResolutionStatus {
  if (unresolvedCount === 0) return "RESOLVED";
  return resolvedCount === 0 ? "UNRESOLVED" : "PARTIALLY_RESOLVED";
}
