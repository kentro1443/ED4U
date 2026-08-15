/**
 * Hard-constraint filter: who is *eligible*, never who is *best*.
 *
 * This module answers one question per mentor — may this mentor legitimately be
 * offered for this request? — and answers it with a yes/no plus a reason. It
 * contains no scores, no weights, no sorting, and no notion of "better". That
 * separation is the engine's central safety property:
 *
 * > A mentor violating a hard constraint has **zero** chance of appearing in
 * > recommendations. No score, however high, can buy their way back in.
 *
 * Two consequences follow, and both are deliberate:
 *
 * 1. **Nothing is relaxed.** When every mentor fails, the answer is
 *    `NO_FEASIBLE_MATCH` — not the "closest" mentors with a caveat. Quietly
 *    widening a budget or dropping `verifiedOnly` would hand the student a
 *    mentor they explicitly ruled out.
 * 2. **Unknown is not absent.** A credential minimum cannot be *verified*
 *    against a credential we were never given, so such a mentor is removed —
 *    but under `CREDENTIAL_UNKNOWN`, distinct from the `CREDENTIAL_ABSENT` of a
 *    mentor who told us they hold nothing. The filter never claims to know
 *    something it does not.
 *
 * Pure and framework-independent: no I/O, no clock, no globals. Same inputs,
 * same output, always.
 */

import { credentialKnowledge, headlineCredentialScore } from "../schemas/mentor.js";
import type { Mentor } from "../schemas/mentor.js";
import type { StudentRequest } from "../schemas/request.js";
import { FILTER_REASONS } from "../schemas/result.js";
import type { FilterReason } from "../schemas/result.js";
import { domainOfSkill } from "../schemas/validation.js";

/**
 * Fixed order in which constraints are evaluated.
 *
 * It defines two things that must not drift between runs: the order of reasons
 * recorded for a mentor failing several constraints, and which reason counts as
 * that mentor's *primary* one in {@link FilterDiagnostics.filteredOut}. Cheap,
 * structural checks come first so the common case exits early.
 */
export const CONSTRAINT_ORDER: readonly FilterReason[] = [
  "INVALID_RECORD",
  "DOMAIN",
  "UNVERIFIED",
  "PRICE",
  "AVAILABILITY",
  "CREDENTIAL_MINIMUM",
  "CREDENTIAL_ABSENT",
  "CREDENTIAL_UNKNOWN",
  "REQUIRED_EXPERTISE",
];

/** A mentor removed by the filter, with every constraint they failed. */
export interface RejectedMentor {
  mentorId: string;
  /**
   * Every constraint this mentor failed, in {@link CONSTRAINT_ORDER}. Never
   * empty. The first entry is the primary reason used in diagnostics.
   */
  reasons: FilterReason[];
}

/** Counts describing how a candidate set was reduced. */
export interface FilterDiagnostics {
  /** Mentors supplied to the filter. */
  candidateCount: number;
  /** Mentors satisfying every hard constraint. */
  eligibleCount: number;
  /**
   * Each removed mentor counted **once**, under their primary reason. These
   * counts sum exactly to `candidateCount - eligibleCount`, so they can be
   * shown to a user as a funnel without double-counting.
   */
  filteredOut: Partial<Record<FilterReason, number>>;
  /**
   * Every failed constraint counted, so one mentor failing three constraints
   * contributes to three buckets. Answers "how many mentors were too expensive"
   * regardless of what else was wrong with them.
   */
  filteredOutByReason: Partial<Record<FilterReason, number>>;
}

/** Whether the request can be served at all by the supplied candidates. */
export type FeasibilityStatus = "FEASIBLE" | "NO_FEASIBLE_MATCH";

/** The complete result of applying hard constraints. */
export interface HardConstraintResult {
  /** `NO_FEASIBLE_MATCH` when no mentor survives; constraints are never relaxed. */
  status: FeasibilityStatus;
  /**
   * Eligible mentors **in input order**. The filter does no ranking; ordering
   * here carries no quality signal and must not be read as one.
   */
  eligible: Mentor[];
  /** Every removed mentor and why, in input order. */
  rejected: RejectedMentor[];
  diagnostics: FilterDiagnostics;
}

/* -------------------------------------------------------------------------- */
/* Individual constraints                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Reports whether a mentor teaches anything in the requested domain.
 *
 * Eligibility is based on declared *expertise*, not on holding a credential: a
 * mentor may legitimately teach a domain whose certificate we have not been
 * given. If the student wants a credential guarantee, that is what
 * `minCredentialScore` is for — and it is checked separately.
 */
function teachesDomain(mentor: Mentor, request: StudentRequest): boolean {
  return mentor.expertise.some((skill) => domainOfSkill(skill) === request.goal.domain);
}

/**
 * Reports whether the mentor's schedule satisfies the request.
 *
 * - No requested slots → nothing to satisfy; the constraint does not apply.
 * - `requireAllAvailability` → the mentor must cover **every** requested slot.
 * - Otherwise → a single shared slot is enough to start.
 */
function satisfiesAvailability(mentor: Mentor, request: StudentRequest): boolean {
  if (request.availability.length === 0) return true;

  const mentorSlots = new Set(mentor.availability);
  return request.hardConstraints.requireAllAvailability
    ? request.availability.every((slot) => mentorSlots.has(slot))
    : request.availability.some((slot) => mentorSlots.has(slot));
}

/**
 * Checks a credential minimum while keeping PRESENT / ABSENT / UNKNOWN apart.
 *
 * @returns The reason this mentor fails, or `undefined` when they pass.
 */
function checkCredentialMinimum(
  mentor: Mentor,
  request: StudentRequest,
): FilterReason | undefined {
  const minimum = request.hardConstraints.minCredentialScore;
  if (minimum === undefined) return undefined;

  const domain = request.goal.domain;
  switch (credentialKnowledge(mentor.credentials, domain)) {
    case "ABSENT":
      // The mentor told us they hold nothing here; the minimum cannot be met.
      return "CREDENTIAL_ABSENT";
    case "UNKNOWN":
      // We were never told. A hard constraint must be *verified*, never assumed
      // either way, so the mentor is removed — but recorded as unknown, so a UI
      // can ask for the missing certificate instead of accusing them.
      return "CREDENTIAL_UNKNOWN";
    case "PRESENT": {
      const score = headlineCredentialScore(mentor.credentials, domain);
      // Inclusive: a mentor sitting exactly on the minimum satisfies it.
      return score !== undefined && score >= minimum ? undefined : "CREDENTIAL_MINIMUM";
    }
  }
}

/** Reports whether the mentor teaches every explicitly required skill. */
function hasRequiredExpertise(mentor: Mentor, request: StudentRequest): boolean {
  const required = request.hardConstraints.requiredExpertise;
  if (required.length === 0) return true;

  const taught = new Set(mentor.expertise);
  return required.every((skill) => taught.has(skill));
}

/* -------------------------------------------------------------------------- */
/* Filter                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Collects every hard constraint a mentor fails, in {@link CONSTRAINT_ORDER}.
 *
 * All constraints are evaluated even after the first failure: a student who
 * sees only "too expensive" may raise their budget and hit an availability wall
 * they were never told about.
 *
 * @param duplicateId - True when this mentor's id already appeared in the set.
 */
function collectFailures(
  mentor: Mentor,
  request: StudentRequest,
  duplicateId: boolean,
): FilterReason[] {
  const failures: FilterReason[] = [];

  if (duplicateId) failures.push("INVALID_RECORD");
  if (!teachesDomain(mentor, request)) failures.push("DOMAIN");
  if (request.hardConstraints.verifiedOnly && !mentor.verified) failures.push("UNVERIFIED");

  const maxPrice = request.hardConstraints.maxPricePerHour;
  // Inclusive bound: a mentor priced exactly at the maximum is affordable.
  if (maxPrice !== undefined && mentor.pricePerHour > maxPrice) failures.push("PRICE");

  if (!satisfiesAvailability(mentor, request)) failures.push("AVAILABILITY");

  const credentialFailure = checkCredentialMinimum(mentor, request);
  if (credentialFailure !== undefined) failures.push(credentialFailure);

  if (!hasRequiredExpertise(mentor, request)) failures.push("REQUIRED_EXPERTISE");

  // Sorting by the fixed order keeps multi-failure output stable regardless of
  // the order the checks happen to run in.
  return failures.sort(
    (a, b) => CONSTRAINT_ORDER.indexOf(a) - CONSTRAINT_ORDER.indexOf(b),
  );
}

/**
 * Applies every hard constraint to a candidate set.
 *
 * Expects **already validated** canonical inputs: a `StudentRequest` and
 * `Mentor[]` that have passed the Phase 1 schemas. The filter's job is
 * eligibility, not validation — the one structural defect it does catch is a
 * duplicate mentor id, because that is a property of the *set* rather than of
 * any single record, and a duplicate would otherwise surface twice in the
 * recommendations.
 *
 * @param request - Canonical, validated student request.
 * @param mentors - Canonical, validated candidate mentors.
 * @returns Eligible mentors in input order, rejections with reasons, and
 *   diagnostics. `status` is `NO_FEASIBLE_MATCH` when nothing survives.
 */
export function applyHardConstraints(
  request: StudentRequest,
  mentors: readonly Mentor[],
): HardConstraintResult {
  const eligible: Mentor[] = [];
  const rejected: RejectedMentor[] = [];
  const filteredOut: Partial<Record<FilterReason, number>> = {};
  const filteredOutByReason: Partial<Record<FilterReason, number>> = {};
  const seenIds = new Set<string>();

  for (const mentor of mentors) {
    const duplicateId = seenIds.has(mentor.id);
    seenIds.add(mentor.id);

    const failures = collectFailures(mentor, request, duplicateId);

    if (failures.length === 0) {
      eligible.push(mentor);
      continue;
    }

    rejected.push({ mentorId: mentor.id, reasons: failures });

    const primary = failures[0] as FilterReason;
    filteredOut[primary] = (filteredOut[primary] ?? 0) + 1;
    for (const reason of failures) {
      filteredOutByReason[reason] = (filteredOutByReason[reason] ?? 0) + 1;
    }
  }

  return {
    status: eligible.length === 0 ? "NO_FEASIBLE_MATCH" : "FEASIBLE",
    eligible,
    rejected,
    diagnostics: {
      candidateCount: mentors.length,
      eligibleCount: eligible.length,
      filteredOut: sortReasonCounts(filteredOut),
      filteredOutByReason: sortReasonCounts(filteredOutByReason),
    },
  };
}

/**
 * Re-keys a reason-count map into {@link CONSTRAINT_ORDER}.
 *
 * Object key order is observable through `JSON.stringify`, and diagnostics get
 * serialised into benchmark reports that are compared across runs — so the
 * ordering has to be fixed rather than "whichever reason happened first".
 */
function sortReasonCounts(
  counts: Partial<Record<FilterReason, number>>,
): Partial<Record<FilterReason, number>> {
  const ordered: Partial<Record<FilterReason, number>> = {};
  for (const reason of CONSTRAINT_ORDER) {
    const count = counts[reason];
    if (count !== undefined) ordered[reason] = count;
  }
  return ordered;
}

/**
 * Independently re-checks that a mentor satisfies every hard constraint.
 *
 * Exported as an audit hook for benchmarks and tests: it answers "is this
 * recommendation legal?" without consulting the filter's own bookkeeping, so a
 * bug in {@link applyHardConstraints} cannot hide behind its own diagnostics.
 *
 * @param request - The request the mentor was selected for.
 * @param mentor - The mentor to audit.
 * @returns `true` when the mentor violates no hard constraint.
 */
export function satisfiesHardConstraints(request: StudentRequest, mentor: Mentor): boolean {
  return collectFailures(mentor, request, false).length === 0;
}

/** Every filter reason, re-exported for consumers building UIs over diagnostics. */
export { FILTER_REASONS };
