/**
 * Gold-set loading, validation and scoring.
 *
 * ## The candidate universe is the whole point
 *
 * A reviewer judges *eight named mentors* for one request. Any metric comparing
 * that judgement against a ranking drawn from a different set of mentors is
 * meaningless — the two are answering different questions. So every gold
 * scenario is scored by ranking **exactly its own `candidateMentorIds`** and
 * comparing that ordering against the labels for those same mentors. Mentors
 * outside the scenario cannot influence its metrics, and a scenario stays
 * measurable even if none of its candidates appear in the engine's global
 * Top-K.
 *
 * ## Labels are validated, never repaired
 *
 * A malformed label file is reported with the reviewer, scenario and mentor
 * responsible, and its scenarios are excluded. It is never silently skipped, and
 * a missing label is never filled in — an invented judgement is a fake
 * measurement wearing a human's name.
 */

import { z } from "zod";

import { applyHardConstraints, rankMentors, satisfiesHardConstraints } from "../src/index.js";
import type { Mentor, StudentRequest } from "../src/index.js";
import {
  meanOfMeasured,
  ndcgAtK,
  pairwiseAgreement,
  precisionAtK,
  round,
} from "./metrics.js";
import type { RelevanceLabel } from "./metrics.js";

/** Format version this loader understands for label files. */
export const GOLD_LABELS_FORMAT_VERSION = "gold-labels.v1";

/** Format version this loader understands for the scenario template. */
export const GOLD_SET_FORMAT_VERSION = "gold-set.v1";

/** Grades reviewers may assign. */
export const RELEVANCE_MIN = 0;
export const RELEVANCE_MAX = 3;

/* -------------------------------------------------------------------------- */
/* Structure                                                                  */
/* -------------------------------------------------------------------------- */

/** One scenario in the committed template. */
export interface GoldScenarioRecord {
  scenarioId: string;
  requestId: string;
  request: StudentRequest;
  candidateMentorIds: string[];
  labels: unknown[];
}

/** The committed template file. */
export interface GoldSetTemplateFile {
  formatVersion: string;
  scenarios: GoldScenarioRecord[];
}

const RelevanceLabelSchema = z.strictObject({
  mentorId: z.string().refine((value) => value.trim().length > 0, {
    error: "mentorId must not be empty",
  }),
  relevance: z
    .number()
    .int(`relevance must be an integer between ${RELEVANCE_MIN} and ${RELEVANCE_MAX}`)
    .min(RELEVANCE_MIN, `relevance must be >= ${RELEVANCE_MIN}`)
    .max(RELEVANCE_MAX, `relevance must be <= ${RELEVANCE_MAX}`),
});

const ScenarioLabelsSchema = z.strictObject({
  scenarioId: z.string().refine((value) => value.trim().length > 0, {
    error: "scenarioId must not be empty",
  }),
  requestId: z.string().refine((value) => value.trim().length > 0, {
    error: "requestId must not be empty",
  }),
  labels: z.array(RelevanceLabelSchema),
});

const GoldLabelsFileSchema = z.strictObject({
  formatVersion: z.string(),
  reviewerId: z.string().refine((value) => value.trim().length > 0, {
    error: "reviewerId must not be empty",
  }),
  labelledAt: z.string().optional(),
  scenarios: z.array(ScenarioLabelsSchema),
});

/** One reviewer's validated label file. */
export type GoldLabelsFile = z.infer<typeof GoldLabelsFileSchema>;

/** Everything that can be wrong with a label file. */
export const GOLD_ISSUE_CODES = [
  "MALFORMED_STRUCTURE",
  "UNSUPPORTED_FORMAT_VERSION",
  "UNKNOWN_SCENARIO",
  "REQUEST_ID_MISMATCH",
  "MENTOR_NOT_IN_SCENARIO",
  "DUPLICATE_MENTOR_LABEL",
  "DUPLICATE_SCENARIO",
  "EMPTY_LABEL_SET",
  "CANDIDATE_MISSING_FROM_POOL",
  "CANDIDATE_NO_LONGER_ELIGIBLE",
] as const;

/** A specific, attributable problem with human labels. */
export interface GoldIssue {
  code: (typeof GOLD_ISSUE_CODES)[number];
  /** File or reviewer the problem belongs to, when known. */
  reviewerId?: string;
  scenarioId?: string;
  mentorId?: string;
  message: string;
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Validates one reviewer's label file against the committed template.
 *
 * Checks structure first, then every semantic rule that structure cannot
 * express: the scenario must exist, its request must match, and every labelled
 * mentor must be one of that scenario's candidates.
 *
 * @param raw - Parsed JSON from a label file.
 * @param template - The committed scenario template.
 * @param source - File name, used when the reviewer id itself is unusable.
 * @returns The validated file, or every issue found.
 */
export function validateGoldLabelFile(
  raw: unknown,
  template: GoldSetTemplateFile,
  source: string,
): { ok: true; value: GoldLabelsFile; issues: GoldIssue[] } | { ok: false; issues: GoldIssue[] } {
  const parsed = GoldLabelsFileSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((issue) => ({
        code: "MALFORMED_STRUCTURE" as const,
        reviewerId: source,
        message: `${issue.path.map(String).join(".") || "(root)"}: ${issue.message}`,
      })),
    };
  }

  const file = parsed.data;
  const issues: GoldIssue[] = [];

  if (file.formatVersion !== GOLD_LABELS_FORMAT_VERSION) {
    // A stale format is fatal: field meanings may have changed underneath us.
    return {
      ok: false,
      issues: [
        {
          code: "UNSUPPORTED_FORMAT_VERSION",
          reviewerId: file.reviewerId,
          message: `Expected formatVersion "${GOLD_LABELS_FORMAT_VERSION}", found "${file.formatVersion}"`,
        },
      ],
    };
  }

  const scenariosById = new Map(template.scenarios.map((scenario) => [scenario.scenarioId, scenario]));
  const seenScenarios = new Set<string>();

  for (const entry of file.scenarios) {
    if (seenScenarios.has(entry.scenarioId)) {
      issues.push({
        code: "DUPLICATE_SCENARIO",
        reviewerId: file.reviewerId,
        scenarioId: entry.scenarioId,
        message: "Scenario appears more than once in this reviewer's file",
      });
      continue;
    }
    seenScenarios.add(entry.scenarioId);

    const scenario = scenariosById.get(entry.scenarioId);
    if (scenario === undefined) {
      issues.push({
        code: "UNKNOWN_SCENARIO",
        reviewerId: file.reviewerId,
        scenarioId: entry.scenarioId,
        message: "Scenario id is not in the committed gold-set template",
      });
      continue;
    }

    if (scenario.requestId !== entry.requestId) {
      issues.push({
        code: "REQUEST_ID_MISMATCH",
        reviewerId: file.reviewerId,
        scenarioId: entry.scenarioId,
        message: `Template scenario refers to request ${scenario.requestId}, label file says ${entry.requestId}`,
      });
      continue;
    }

    if (entry.labels.length === 0) {
      issues.push({
        code: "EMPTY_LABEL_SET",
        reviewerId: file.reviewerId,
        scenarioId: entry.scenarioId,
        message: "Scenario is present but carries no labels",
      });
      continue;
    }

    const candidates = new Set(scenario.candidateMentorIds);
    const seenMentors = new Set<string>();

    for (const label of entry.labels) {
      if (!candidates.has(label.mentorId)) {
        issues.push({
          code: "MENTOR_NOT_IN_SCENARIO",
          reviewerId: file.reviewerId,
          scenarioId: entry.scenarioId,
          mentorId: label.mentorId,
          message: "Labelled mentor is not one of this scenario's candidates",
        });
      }
      if (seenMentors.has(label.mentorId)) {
        issues.push({
          code: "DUPLICATE_MENTOR_LABEL",
          reviewerId: file.reviewerId,
          scenarioId: entry.scenarioId,
          mentorId: label.mentorId,
          message: "Mentor is labelled more than once in this scenario",
        });
      }
      seenMentors.add(label.mentorId);
    }
  }

  return issues.length === 0 ? { ok: true, value: file, issues: [] } : { ok: false, issues };
}

/* -------------------------------------------------------------------------- */
/* Scoring                                                                    */
/* -------------------------------------------------------------------------- */

/** Quality numbers for one reviewer on one scenario. */
export interface ScenarioMeasurement {
  scenarioId: string;
  reviewerId: string;
  /** How many of the scenario's candidates this reviewer actually judged. */
  judgedCandidates: number;
  totalCandidates: number;
  ndcgAt3: number | null;
  precisionAt3: number | null;
  pairwiseAgreement: number | null;
  /** Why a metric was not measured, when it was not. */
  completeness: {
    /** NDCG needs every candidate graded, or the ideal ranking is unknowable. */
    ndcgAt3: "MEASURED" | "INCOMPLETE_LABELS";
    /** Precision needs every returned top-3 candidate graded. */
    precisionAt3: "MEASURED" | "TOP_K_NOT_FULLY_LABELLED";
    /** Pairwise agreement needs one strictly-ordered comparable pair. */
    pairwiseAgreement: "MEASURED" | "NO_COMPARABLE_PAIR";
  };
}

/** Per-reviewer rollup, kept visible rather than flattened into one number. */
export interface ReviewerSummary {
  reviewerId: string;
  scenariosLabelled: number;
  candidatesJudged: number;
  ndcgAt3: ReturnType<typeof meanOfMeasured>;
  precisionAt3: ReturnType<typeof meanOfMeasured>;
  pairwiseAgreement: ReturnType<typeof meanOfMeasured>;
}

/** The complete human-quality result. */
export interface GoldEvaluation {
  status: "MEASURED" | "NOT_MEASURED";
  reason?: string;
  reviewers: string[];
  scenariosInTemplate: number;
  scenariosMeasured: number;
  coverage: {
    /** Share of template scenarios with at least one usable reviewer label. */
    scenarioCoverage: number;
    /** Share of candidates judged, across measured scenarios. */
    candidateCoverage: number;
    /** Partial labelling is permitted; this is how much was actually judged. */
    partialScenarios: number;
  };
  metrics: {
    ndcgAt3: ReturnType<typeof meanOfMeasured> | null;
    precisionAt3: ReturnType<typeof meanOfMeasured> | null;
    pairwiseAgreement: ReturnType<typeof meanOfMeasured> | null;
  };
  interReviewerAgreement: {
    status: "MEASURED" | "NOT_MEASURED";
    reason?: string;
    comparedScenarios: number;
    reviewerPairs: string[];
    agreement: ReturnType<typeof meanOfMeasured> | null;
  };
  perReviewer: ReviewerSummary[];
  measurements: ScenarioMeasurement[];
  issues: GoldIssue[];
}

/**
 * Agreement between two humans on the same scenario.
 *
 * Same construction as engine-vs-human agreement, over pairs *both* reviewers
 * ordered strictly. Reported separately because it is the yardstick: an engine
 * scoring 0.7 against humans who agree with each other 0.7 of the time is at
 * human level, and quoting the first number without the second is misleading.
 *
 * @returns Agreement in `[0, 1]`, or `null` when no pair is strictly ordered by
 *   both reviewers.
 */
export function interReviewerAgreement(
  a: readonly RelevanceLabel[],
  b: readonly RelevanceLabel[],
): number | null {
  const gradeB = new Map(b.map((label) => [label.mentorId, label.relevance]));
  const shared = a.filter((label) => gradeB.has(label.mentorId));

  let comparable = 0;
  let agreed = 0;

  for (let i = 0; i < shared.length; i++) {
    for (let j = i + 1; j < shared.length; j++) {
      const first = shared[i] as RelevanceLabel;
      const second = shared[j] as RelevanceLabel;

      const aPrefersFirst = first.relevance - second.relevance;
      const bPrefersFirst =
        (gradeB.get(first.mentorId) as number) - (gradeB.get(second.mentorId) as number);
      if (aPrefersFirst === 0 || bPrefersFirst === 0) continue;

      comparable++;
      if (aPrefersFirst > 0 === bPrefersFirst > 0) agreed++;
    }
  }

  return comparable === 0 ? null : round(agreed / comparable);
}

/**
 * Ranks exactly one scenario's candidate universe.
 *
 * Deliberately independent of the benchmark's global Top-K: the ordering must
 * be over the same mentors the reviewer saw, and nothing else.
 *
 * @returns The engine's ordering of those candidates, plus any candidate that
 *   could not be used.
 */
export function rankGoldScenario(
  scenario: GoldScenarioRecord,
  mentorsById: ReadonlyMap<string, Mentor>,
): { order: string[]; usable: Mentor[]; issues: GoldIssue[] } {
  const issues: GoldIssue[] = [];
  const usable: Mentor[] = [];

  for (const mentorId of scenario.candidateMentorIds) {
    const mentor = mentorsById.get(mentorId);
    if (mentor === undefined) {
      issues.push({
        code: "CANDIDATE_MISSING_FROM_POOL",
        scenarioId: scenario.scenarioId,
        mentorId,
        message: "Scenario candidate is not in the current mentor dataset",
      });
      continue;
    }
    // The scenario was built from eligible mentors; if the data has since moved,
    // that candidate is stale and must not be scored as if it were still valid.
    if (!satisfiesHardConstraints(scenario.request, mentor)) {
      issues.push({
        code: "CANDIDATE_NO_LONGER_ELIGIBLE",
        scenarioId: scenario.scenarioId,
        mentorId,
        message: "Scenario candidate no longer satisfies the scenario's hard constraints",
      });
      continue;
    }
    usable.push(mentor);
  }

  return {
    order: rankMentors(scenario.request, usable).map((entry) => entry.mentorId),
    usable,
    issues,
  };
}

/**
 * Scores every labelled gold scenario over its own candidate universe.
 *
 * Partial labelling **is allowed** — a reviewer may grade five of eight
 * candidates — because forcing completeness would silently discard real
 * judgement. The cost is reported rather than hidden: `coverage` states how many
 * scenarios and candidates were actually judged, and every measurement carries
 * its own `judgedCandidates` count.
 *
 * @param template - The committed scenario template.
 * @param files - Validated reviewer label files.
 * @param mentors - The current mentor dataset.
 * @param loadIssues - Issues found while loading/validating the files.
 */
export function evaluateGoldScenarios(
  template: GoldSetTemplateFile,
  files: readonly GoldLabelsFile[],
  mentors: readonly Mentor[],
  loadIssues: readonly GoldIssue[] = [],
): GoldEvaluation {
  const issues: GoldIssue[] = [...loadIssues];
  const mentorsById = new Map(mentors.map((mentor) => [mentor.id, mentor]));
  const scenariosById = new Map(template.scenarios.map((s) => [s.scenarioId, s]));

  const measurements: ScenarioMeasurement[] = [];
  const byScenario = new Map<string, { reviewerId: string; labels: RelevanceLabel[] }[]>();

  for (const file of files) {
    for (const entry of file.scenarios) {
      if (entry.labels.length === 0) continue;
      const existing = byScenario.get(entry.scenarioId) ?? [];
      existing.push({ reviewerId: file.reviewerId, labels: entry.labels });
      byScenario.set(entry.scenarioId, existing);
    }
  }

  if (byScenario.size === 0) {
    return {
      status: "NOT_MEASURED",
      reason:
        "No human labels are present in data/gold/labels/. NDCG@3, Precision@3 and pairwise agreement are undefined without independent reviewer judgements and are deliberately not estimated.",
      reviewers: files.map((file) => file.reviewerId).sort(),
      scenariosInTemplate: template.scenarios.length,
      scenariosMeasured: 0,
      coverage: { scenarioCoverage: 0, candidateCoverage: 0, partialScenarios: 0 },
      metrics: { ndcgAt3: null, precisionAt3: null, pairwiseAgreement: null },
      interReviewerAgreement: {
        status: "NOT_MEASURED",
        reason: "Fewer than two reviewers have labelled any shared scenario.",
        comparedScenarios: 0,
        reviewerPairs: [],
        agreement: null,
      },
      perReviewer: [],
      measurements: [],
      issues,
    };
  }

  /* Per-scenario, per-reviewer measurement over the scenario's own universe. */
  let judgedTotal = 0;
  let candidateTotal = 0;
  let partialScenarios = 0;
  const interAgreements: (number | null)[] = [];
  const reviewerPairs = new Set<string>();
  let comparedScenarios = 0;

  for (const [scenarioId, reviewerEntries] of [...byScenario.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const scenario = scenariosById.get(scenarioId);
    if (scenario === undefined) continue;

    const { order, usable, issues: scenarioIssues } = rankGoldScenario(scenario, mentorsById);
    issues.push(...scenarioIssues);
    if (usable.length < 2) continue;

    const universe = new Set(usable.map((mentor) => mentor.id));
    const usableEntries = reviewerEntries
      .map((entry) => ({
        reviewerId: entry.reviewerId,
        // Only labels inside the universe count — a label for a mentor that is
        // no longer eligible cannot be scored against a ranking without them.
        labels: entry.labels.filter((label) => universe.has(label.mentorId)),
      }))
      .filter((entry) => entry.labels.length > 0)
      .sort((a, b) => a.reviewerId.localeCompare(b.reviewerId));

    for (const entry of usableEntries) {
      // Each metric states its own completeness requirement; partial labels are
      // allowed but must never be quietly filled in with zeros.
      const ndcg = ndcgAtK(order, entry.labels, 3, order);
      const precision = precisionAtK(order, entry.labels, 3);
      const pairwise = pairwiseAgreement(order, entry.labels);

      measurements.push({
        scenarioId,
        reviewerId: entry.reviewerId,
        judgedCandidates: entry.labels.length,
        totalCandidates: usable.length,
        ndcgAt3: ndcg,
        precisionAt3: precision,
        pairwiseAgreement: pairwise,
        completeness: {
          ndcgAt3: ndcg === null ? "INCOMPLETE_LABELS" : "MEASURED",
          precisionAt3: precision === null ? "TOP_K_NOT_FULLY_LABELLED" : "MEASURED",
          pairwiseAgreement: pairwise === null ? "NO_COMPARABLE_PAIR" : "MEASURED",
        },
      });

      judgedTotal += entry.labels.length;
      candidateTotal += usable.length;
      if (entry.labels.length < usable.length) partialScenarios++;
    }

    /* Human vs human, only with two or more reviewers on this scenario. */
    if (usableEntries.length >= 2) {
      comparedScenarios++;
      for (let i = 0; i < usableEntries.length; i++) {
        for (let j = i + 1; j < usableEntries.length; j++) {
          const a = usableEntries[i] as { reviewerId: string; labels: RelevanceLabel[] };
          const b = usableEntries[j] as { reviewerId: string; labels: RelevanceLabel[] };
          reviewerPairs.add(`${a.reviewerId} vs ${b.reviewerId}`);
          interAgreements.push(interReviewerAgreement(a.labels, b.labels));
        }
      }
    }
  }

  /* Per-reviewer rollups. -------------------------------------------------- */
  const reviewerIds = [...new Set(measurements.map((m) => m.reviewerId))].sort();
  const perReviewer: ReviewerSummary[] = reviewerIds.map((reviewerId) => {
    const own = measurements.filter((m) => m.reviewerId === reviewerId);
    return {
      reviewerId,
      scenariosLabelled: own.length,
      candidatesJudged: own.reduce((sum, m) => sum + m.judgedCandidates, 0),
      ndcgAt3: meanOfMeasured(own.map((m) => m.ndcgAt3)),
      precisionAt3: meanOfMeasured(own.map((m) => m.precisionAt3)),
      pairwiseAgreement: meanOfMeasured(own.map((m) => m.pairwiseAgreement)),
    };
  });

  const measuredScenarios = new Set(measurements.map((m) => m.scenarioId)).size;

  return {
    status: measurements.length === 0 ? "NOT_MEASURED" : "MEASURED",
    ...(measurements.length === 0
      ? { reason: "Label files were present but none could be scored; see issues." }
      : {}),
    reviewers: [...new Set(files.map((file) => file.reviewerId))].sort(),
    scenariosInTemplate: template.scenarios.length,
    scenariosMeasured: measuredScenarios,
    coverage: {
      scenarioCoverage: round(measuredScenarios / Math.max(1, template.scenarios.length)),
      candidateCoverage: candidateTotal === 0 ? 0 : round(judgedTotal / candidateTotal),
      partialScenarios,
    },
    metrics: {
      ndcgAt3: meanOfMeasured(measurements.map((m) => m.ndcgAt3)),
      precisionAt3: meanOfMeasured(measurements.map((m) => m.precisionAt3)),
      pairwiseAgreement: meanOfMeasured(measurements.map((m) => m.pairwiseAgreement)),
    },
    interReviewerAgreement:
      interAgreements.length === 0
        ? {
            status: "NOT_MEASURED",
            reason:
              "Fewer than two independent reviewers have labelled the same scenario, so human-vs-human agreement is undefined and is not estimated.",
            comparedScenarios: 0,
            reviewerPairs: [],
            agreement: null,
          }
        : {
            status: "MEASURED",
            comparedScenarios,
            reviewerPairs: [...reviewerPairs].sort(),
            agreement: meanOfMeasured(interAgreements),
          },
    perReviewer,
    measurements,
    issues,
  };
}

/**
 * Confirms a template scenario's candidates were eligible when it was built.
 *
 * Exposed for tests and for anyone auditing a stale gold set.
 *
 * @returns Candidate ids that are no longer eligible.
 */
export function staleCandidates(
  scenario: GoldScenarioRecord,
  mentors: readonly Mentor[],
): string[] {
  const { eligible } = applyHardConstraints(scenario.request, mentors);
  const eligibleIds = new Set(eligible.map((mentor) => mentor.id));
  return scenario.candidateMentorIds.filter((id) => !eligibleIds.has(id));
}
