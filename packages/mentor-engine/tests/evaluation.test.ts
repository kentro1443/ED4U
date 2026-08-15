/**
 * Phase 7 — evaluation harness and verification.
 *
 * Three things are checked here, and the third matters most:
 *
 * 1. The metric functions compute what they claim, against worked examples.
 * 2. The baselines behave as specified, so comparisons mean something.
 * 3. **The harness's own checks actually fire.** A benchmark whose detectors
 *    have never been shown to catch a bad result would report a clean run no
 *    matter what the engine did.
 *
 * Plus the anti-fabrication guarantee: no human label exists anywhere in the
 * repository, and the harness says so instead of estimating.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  applyHardConstraints,
  baselineACredentialSort,
  baselineBStaticWeighted,
  topKRecommendations,
  validateMentors,
  validateStudentRequest,
} from "../src/index.js";
import type { Mentor, MentorRecommendation, StudentRequest } from "../src/index.js";
import {
  kendallTau,
  meanOfMeasured,
  ndcgAtK,
  pairwiseAgreement,
  percentile,
  precisionAtK,
  topKOverlap,
} from "../scripts/metrics.js";
import { CliError, auditRecommendations, parseArgs, runBenchmark } from "../scripts/benchmark.js";
import {
  evaluateGoldScenarios,
  interReviewerAgreement,
  rankGoldScenario,
  validateGoldLabelFile,
} from "../scripts/goldSet.js";
import type { GoldLabelsFile, GoldSetTemplateFile } from "../scripts/goldSet.js";
import type { RelevanceLabel } from "../scripts/metrics.js";
import { buildGoldSetTemplate } from "../scripts/generateGoldSetTemplate.js";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

/** Reads a committed dataset file. */
function readData<T>(name: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, name), "utf8")) as T;
}

const mentors = readData<Mentor[]>("mentors.mock.json");
const requests = readData<StudentRequest[]>("requests.mock.json");

/** Builds a validated canonical request. */
function makeRequest(overrides: Record<string, unknown> = {}): StudentRequest {
  const result = validateStudentRequest({
    requestId: "R001",
    goal: { domain: "IELTS", focusSkills: ["IELTS.WRITING"] },
    hardConstraints: { verifiedOnly: false, requiredExpertise: [], requireAllAvailability: false },
    availability: ["TUE_19_00"],
    softPreferences: { teachingStyles: [], languages: [] },
    additionalPreferences: [],
    ...overrides,
  });
  if (!result.ok) throw new Error(`invalid request fixture: ${JSON.stringify(result.issues)}`);
  return result.value;
}

/** Builds a validated canonical mentor. */
function makeMentor(id: string, overrides: Record<string, unknown> = {}): Mentor {
  const result = validateMentors([
    {
      id,
      name: `Mentor ${id}`,
      birthYear: 1998,
      verified: true,
      credentials: { ielts: { overall: 7.5 }, sat: null, hsk: null },
      expertise: ["IELTS.WRITING"],
      availability: ["TUE_19_00"],
      pricePerHour: 200_000,
      sessionsCompleted: 20,
      teachingExperienceMonths: 12,
      rating: 4.5,
      teachingStyles: ["PATIENT"],
      ...overrides,
    },
  ]);
  if (!result.ok) throw new Error(`invalid mentor fixture: ${JSON.stringify(result.issues)}`);
  return result.value[0] as Mentor;
}

/* -------------------------------------------------------------------------- */
/* Metrics                                                                    */
/* -------------------------------------------------------------------------- */

describe("metric functions", () => {
  it("computes nearest-rank percentiles", () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(values, 50)).toBe(5);
    expect(percentile(values, 95)).toBe(10);
    expect(percentile(values, 0)).toBe(1);
    expect(percentile([], 50)).toBe(0);
    // Order of the input must not matter.
    expect(percentile([9, 1, 5], 50)).toBe(5);
  });

  it("computes NDCG@K against a worked example", () => {
    const labels = [
      { mentorId: "A", relevance: 3 },
      { mentorId: "B", relevance: 2 },
      { mentorId: "C", relevance: 0 },
    ];
    // Perfect ordering scores 1.
    expect(ndcgAtK(["A", "B", "C"], labels, 3)).toBe(1);
    // Reversed ordering scores strictly less.
    expect(ndcgAtK(["C", "B", "A"], labels, 3) as number).toBeLessThan(1);
    // DCG for [B, A] = 3/1 + 7/1.585 = 7.416; IDCG = 7/1 + 3/1.585 = 8.893.
    expect(ndcgAtK(["B", "A"], labels, 2)).toBeCloseTo(0.8339, 3);
  });

  it("returns null for NDCG when nothing was labelled", () => {
    expect(ndcgAtK(["A"], [], 3)).toBeNull();
    expect(ndcgAtK(["Z"], [{ mentorId: "A", relevance: 3 }], 3)).toBeNull();
  });

  it("computes Precision@K only when the whole top K was judged", () => {
    const labels = [
      { mentorId: "A", relevance: 3 },
      { mentorId: "B", relevance: 1 },
      { mentorId: "C", relevance: 2 },
    ];
    expect(precisionAtK(["A", "C", "B"], labels, 3)).toBe(0.6667); // rounded to 4dp
    expect(precisionAtK(["A", "C"], labels, 2)).toBe(1);
    expect(precisionAtK(["B"], labels, 1)).toBe(0);

    // An unjudged mentor in the top K makes the metric unmeasurable: scoring
    // over "the judged subset" would silently change the denominator and report
    // a precision as if everything had been reviewed.
    expect(precisionAtK(["A", "UNJUDGED"], labels, 2)).toBeNull();
    expect(precisionAtK(["UNJUDGED"], labels, 1)).toBeNull();
  });

  it("never treats an unlabelled candidate as relevance 0", () => {
    const labels = [
      { mentorId: "A", relevance: 3 },
      { mentorId: "B", relevance: 3 },
    ];

    // C is unlabelled. Scoring it as 0 would manufacture a negative human
    // judgement and make the engine look wrong for ranking it at all.
    expect(ndcgAtK(["A", "B", "C"], labels, 3)).toBeNull();
    expect(ndcgAtK(["C", "A", "B"], labels, 3)).toBeNull();
    expect(precisionAtK(["A", "B", "C"], labels, 3)).toBeNull();

    // Complete labels over the universe make it measurable again.
    const complete = [...labels, { mentorId: "C", relevance: 0 }];
    expect(ndcgAtK(["A", "B", "C"], complete, 3)).toBe(1);
  });

  it("uses the evaluation universe to establish the ideal ranking", () => {
    const labels = [
      { mentorId: "A", relevance: 1 },
      { mentorId: "B", relevance: 3 },
    ];
    // Ranked list covers the universe: measurable, and A-first is not ideal.
    expect(ndcgAtK(["A", "B"], labels, 2) as number).toBeLessThan(1);
    expect(ndcgAtK(["B", "A"], labels, 2)).toBe(1);
    // A universe member missing from the labels makes it unmeasurable.
    expect(ndcgAtK(["A", "B"], labels, 2, ["A", "B", "C"])).toBeNull();
  });

  it("computes pairwise agreement, skipping ties", () => {
    const labels = [
      { mentorId: "A", relevance: 3 },
      { mentorId: "B", relevance: 1 },
      { mentorId: "C", relevance: 1 },
    ];
    // A>B and A>C are the only strict pairs; B/C is a tie and carries no signal.
    expect(pairwiseAgreement(["A", "B", "C"], labels)).toBe(1);
    expect(pairwiseAgreement(["B", "C", "A"], labels)).toBe(0);
    expect(pairwiseAgreement(["B", "A", "C"], labels)).toBe(0.5);
    expect(pairwiseAgreement(["A"], [{ mentorId: "A", relevance: 1 }])).toBeNull();
  });

  it("computes Kendall tau between two orderings", () => {
    expect(kendallTau(["A", "B", "C"], ["A", "B", "C"])).toBe(1);
    expect(kendallTau(["A", "B", "C"], ["C", "B", "A"])).toBe(-1);
    expect(kendallTau(["A", "B", "C"], ["A", "C", "B"])).toBe(0.3333); // rounded to 4dp
    expect(kendallTau(["A"], ["A"])).toBeNull();
  });

  it("computes top-K overlap", () => {
    expect(topKOverlap(["A", "B", "C"], ["A", "B", "C"], 3)).toBe(1);
    expect(topKOverlap(["A", "B", "C"], ["D", "E", "F"], 3)).toBe(0);
    expect(topKOverlap(["A", "B"], ["B", "C"], 2)).toBe(0.3333); // rounded to 4dp
    expect(topKOverlap([], [], 3)).toBeNull();
  });

  it("averages only what was measured, and says how much that was", () => {
    expect(meanOfMeasured([1, null, 0])).toEqual({ mean: 0.5, measured: 2, total: 3 });
    expect(meanOfMeasured([null, null])).toEqual({ mean: null, measured: 0, total: 2 });
  });
});

/* -------------------------------------------------------------------------- */
/* Baselines                                                                  */
/* -------------------------------------------------------------------------- */

describe("Baseline A — credential sort", () => {
  const request = makeRequest();

  it("orders by the credential in the goal domain", () => {
    const ranked = baselineACredentialSort(request, [
      makeMentor("MID", { credentials: { ielts: { overall: 7.5 }, sat: null, hsk: null } }),
      makeMentor("TOP", { credentials: { ielts: { overall: 9 }, sat: null, hsk: null } }),
      makeMentor("LOW", { credentials: { ielts: { overall: 6 }, sat: null, hsk: null } }),
    ]);
    expect(ranked.map((r) => r.mentorId)).toEqual(["TOP", "MID", "LOW"]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("puts mentors with no credential on record last, not first", () => {
    const ranked = baselineACredentialSort(request, [
      makeMentor("UNKNOWN", { credentials: {} }),
      makeMentor("KNOWN", { credentials: { ielts: { overall: 6 }, sat: null, hsk: null } }),
    ]);
    expect(ranked.map((r) => r.mentorId)).toEqual(["KNOWN", "UNKNOWN"]);
  });

  it("ignores credentials outside the goal domain", () => {
    const satRequest = makeRequest({ goal: { domain: "SAT", focusSkills: [] } });
    const ranked = baselineACredentialSort(satRequest, [
      makeMentor("IELTS-STAR", {
        credentials: { ielts: { overall: 9 }, sat: { total: 1200 }, hsk: null },
        expertise: ["SAT.MATH"],
      }),
      makeMentor("SAT-STAR", {
        credentials: { ielts: null, sat: { total: 1550 }, hsk: null },
        expertise: ["SAT.MATH"],
      }),
    ]);
    expect(ranked[0]?.mentorId).toBe("SAT-STAR");
  });

  it("is deterministic and order-independent", () => {
    const { eligible } = applyHardConstraints(requests[0] as StudentRequest, mentors);
    const forward = baselineACredentialSort(requests[0] as StudentRequest, eligible);
    const reversed = baselineACredentialSort(requests[0] as StudentRequest, [...eligible].reverse());
    expect(reversed).toEqual(forward);
  });
});

describe("Baseline B — static weighted", () => {
  const request = makeRequest();

  it("penalises missing data instead of redistributing it", () => {
    // Identical mentors except one has no rating. rankerV1 treats that as
    // unknown; Baseline B scores it as zero, which is the whole point.
    const rated = makeMentor("RATED", { rating: 5 });
    const unrated = makeMentor("UNRATED", { rating: undefined });

    const ranked = baselineBStaticWeighted(request, [unrated, rated]);
    expect(ranked[0]?.mentorId).toBe("RATED");
    expect(ranked[0]?.score as number).toBeGreaterThan(ranked[1]?.score as number);
  });

  it("does not apply request-aware boosts", () => {
    // The same candidates score identically whether or not a focus skill is
    // named, because the weights never change.
    const withFocus = makeRequest({ goal: { domain: "IELTS", focusSkills: ["IELTS.WRITING"] } });
    const withoutFocus = makeRequest({ goal: { domain: "IELTS", focusSkills: [] } });
    const pool = [makeMentor("A"), makeMentor("B", { pricePerHour: 100_000 })];

    const a = baselineBStaticWeighted(withFocus, pool);
    const b = baselineBStaticWeighted(withoutFocus, pool);
    // Focus changes which features apply, but never the weighting policy, so
    // ordering by the shared features is unchanged.
    expect(a.map((r) => r.mentorId)).toEqual(b.map((r) => r.mentorId));
  });

  it("keeps scores inside [0, 100] and is deterministic", () => {
    const { eligible } = applyHardConstraints(requests[0] as StudentRequest, mentors);
    const ranked = baselineBStaticWeighted(requests[0] as StudentRequest, eligible);

    for (const entry of ranked) {
      expect(entry.score).toBeGreaterThanOrEqual(0);
      expect(entry.score).toBeLessThanOrEqual(100);
    }
    expect(baselineBStaticWeighted(requests[0] as StudentRequest, [...eligible].reverse())).toEqual(
      ranked,
    );
  });
});

describe("baselines share the engine's separation of concerns", () => {
  it("rank everyone they are given and filter nobody", () => {
    const request = makeRequest();
    expect(baselineACredentialSort(request, mentors)).toHaveLength(mentors.length);
    expect(baselineBStaticWeighted(request, mentors)).toHaveLength(mentors.length);
  });

  it("respect topK", () => {
    const request = makeRequest();
    expect(baselineACredentialSort(request, mentors, { topK: 3 })).toHaveLength(3);
    expect(baselineBStaticWeighted(request, mentors, { topK: 3 })).toHaveLength(3);
    expect(baselineACredentialSort(request, mentors, { topK: 0 })).toEqual([]);
  });

  it("differ from rankerV1 often enough to be a real comparison", () => {
    // If a baseline agreed with the engine everywhere it would prove nothing.
    let differences = 0;
    for (const request of requests.slice(0, 50)) {
      const { eligible } = applyHardConstraints(request, mentors);
      if (eligible.length < 2) continue;
      const engineTop = topKRecommendations(request, eligible, { topK: 1 })[0]?.mentorId;
      const baselineTop = baselineACredentialSort(request, eligible, { topK: 1 })[0]?.mentorId;
      if (engineTop !== baselineTop) differences++;
    }
    expect(differences).toBeGreaterThan(5);
  });
});

/* -------------------------------------------------------------------------- */
/* The harness's own checks must fire                                         */
/* -------------------------------------------------------------------------- */

describe("audit detects every failure it claims to", () => {
  const request = makeRequest();
  const pool = [makeMentor("M1"), makeMentor("M2")];

  /** A structurally valid recommendation, to be broken in each test. */
  function goodRecommendation(mentorId: string, rank: number): MentorRecommendation {
    return {
      mentorId,
      rank,
      matchScore: 50,
      scoreBreakdown: { subjectExpertise: 0.5 },
      appliedWeights: { subjectExpertise: 1 },
      reasons: ["IELTS 7.5 overall"],
      tradeoffs: [],
      dataCoverage: 1,
    };
  }

  it("passes a clean result set", () => {
    expect(
      auditRecommendations(request, pool, [goodRecommendation("M1", 1), goodRecommendation("M2", 2)]),
    ).toEqual([]);
  });

  it("catches a duplicate recommendation", () => {
    const failures = auditRecommendations(request, pool, [
      goodRecommendation("M1", 1),
      goodRecommendation("M1", 2),
    ]);
    expect(failures.map((f) => f.kind)).toContain("DUPLICATE_RECOMMENDATION");
    expect(failures[0]?.requestId).toBe("R001");
    expect(failures[0]?.mentorId).toBe("M1");
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 101])(
    "catches an invalid matchScore (%s)",
    (matchScore) => {
      const failures = auditRecommendations(request, pool, [
        { ...goodRecommendation("M1", 1), matchScore },
      ]);
      expect(failures.map((f) => f.kind)).toContain("INVALID_SCORE");
    },
  );

  it("catches an invalid dataCoverage", () => {
    const failures = auditRecommendations(request, pool, [
      { ...goodRecommendation("M1", 1), dataCoverage: 1.5 },
    ]);
    expect(failures.map((f) => f.kind)).toContain("INVALID_SCORE");
  });

  it("catches an out-of-sequence rank", () => {
    const failures = auditRecommendations(request, pool, [goodRecommendation("M1", 7)]);
    expect(failures.map((f) => f.kind)).toContain("MALFORMED_RECOMMENDATION");
  });

  it("catches a recommendation with no reason", () => {
    const failures = auditRecommendations(request, pool, [
      { ...goodRecommendation("M1", 1), reasons: [] },
    ]);
    expect(failures.some((f) => f.detail.includes("no factual reason"))).toBe(true);
  });

  it("catches a hard-constraint violation", () => {
    const verifiedOnly = makeRequest({
      hardConstraints: { verifiedOnly: true, requiredExpertise: [], requireAllAvailability: false },
    });
    const unverified = makeMentor("UNVERIFIED", { verified: false });

    const failures = auditRecommendations(verifiedOnly, [unverified], [
      goodRecommendation("UNVERIFIED", 1),
    ]);
    expect(failures.map((f) => f.kind)).toContain("HARD_CONSTRAINT_VIOLATION");
    expect(failures[0]?.mentorId).toBe("UNVERIFIED");
  });

  it("catches a mentor who was never in the candidate pool", () => {
    const failures = auditRecommendations(request, pool, [goodRecommendation("GHOST", 1)]);
    expect(failures[0]?.kind).toBe("HARD_CONSTRAINT_VIOLATION");
    expect(failures[0]?.detail).toContain("not in the candidate pool");
  });

  it("names the ids needed to reproduce every failure", () => {
    const failures = auditRecommendations(request, pool, [
      { ...goodRecommendation("M1", 9), matchScore: Number.NaN },
    ]);
    expect(failures.length).toBeGreaterThan(0);
    for (const failure of failures) {
      expect(failure.requestId).toBe("R001");
      expect(failure.mentorId).toBe("M1");
      expect(failure.detail.length).toBeGreaterThan(0);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* The benchmark itself                                                       */
/* -------------------------------------------------------------------------- */

describe("benchmark over the fixture set", () => {
  const result = runBenchmark(mentors, requests.slice(0, 200), { topK: 5 });

  it("passes with zero violations, crashes, duplicates and invalid scores", () => {
    expect(result.engineering.hardConstraintViolations).toBe(0);
    expect(result.engineering.hardConstraintViolationRate).toBe(0);
    expect(result.engineering.unhandledCrashes).toBe(0);
    expect(result.engineering.duplicateRecommendations).toBe(0);
    expect(result.engineering.invalidScores).toBe(0);
    expect(result.failures).toEqual([]);
    expect(result.status).toBe("PASS");
  });

  it("reports 100% determinism and valid results", () => {
    expect(result.engineering.determinismRate).toBe(1);
    expect(result.engineering.validResultRate).toBe(1);
  });

  it("meets the p95 latency target on 500 mentors", () => {
    expect(result.engineering.mentorsPerRequest).toBe(500);
    expect(result.engineering.latencyMs.p95).toBeLessThan(200);
    expect(result.engineering.latencyMs.p50).toBeGreaterThan(0);
  });

  it("actually produced recommendations, so the metrics are not vacuous", () => {
    expect(result.engineering.recommendationsProduced).toBeGreaterThan(500);
    expect(result.engineering.feasibleRequests).toBeGreaterThan(50);
    // ...and encountered infeasible requests too, so both paths are exercised.
    expect(result.engineering.infeasibleRequests).toBeGreaterThan(0);
  });

  it("compares against both baselines", () => {
    const comparison = result.comparison as Record<string, { comparedRequests: number }>;
    expect(comparison.baselineA?.comparedRequests).toBeGreaterThan(50);
    expect(comparison.baselineB?.comparedRequests).toBeGreaterThan(50);
  });

  it("is reproducible: the same fixtures give the same engineering metrics", () => {
    const again = runBenchmark(mentors, requests.slice(0, 200), { topK: 5 });
    const strip = (metrics: typeof result.engineering) => ({ ...metrics, latencyMs: undefined });
    // Latency is the one metric that legitimately varies between runs.
    expect(strip(again.engineering)).toEqual(strip(result.engineering));
    expect(JSON.stringify(again.comparison)).toBe(JSON.stringify(result.comparison));
  });
});

/* -------------------------------------------------------------------------- */
/* Human labels: absent, and honestly reported as absent                      */
/* -------------------------------------------------------------------------- */

describe("human-quality metrics are not fabricated", () => {
  const result = runBenchmark(mentors, requests.slice(0, 50), { topK: 5 });

  it("reports NOT_MEASURED while no reviewer labels exist", () => {
    const human = result.humanQuality as {
      status: string;
      reason: string;
      metrics: Record<string, unknown>;
    };
    expect(human.status).toBe("NOT_MEASURED");
    expect(human.reason).toMatch(/no human labels/i);
    expect(human.metrics).toEqual({ ndcgAt3: null, precisionAt3: null, pairwiseAgreement: null });
  });

  it("has no label files anywhere in the repository", () => {
    const labelsDir = join(DATA_DIR, "gold", "labels");
    const files = existsSync(labelsDir) ? readdirSync(labelsDir).filter((f) => f.endsWith(".json")) : [];
    expect(files).toEqual([]);
  });

  it("ships a template whose every label array is empty", () => {
    const template = readData<{
      formatVersion: string;
      labelsAreFabricated: boolean;
      scenarios: { scenarioId: string; candidateMentorIds: string[]; labels: unknown[] }[];
    }>(join("gold", "gold-set.template.json"));

    expect(template.formatVersion).toBe("gold-set.v1");
    expect(template.labelsAreFabricated).toBe(false);
    for (const scenario of template.scenarios) {
      expect(scenario.labels, scenario.scenarioId).toEqual([]);
    }
  });

  it("covers 50-100 scenarios with 5-10 candidates each, as PLAN.md asks", () => {
    const template = readData<{
      scenarios: { candidateMentorIds: string[] }[];
    }>(join("gold", "gold-set.template.json"));

    expect(template.scenarios.length).toBeGreaterThanOrEqual(50);
    expect(template.scenarios.length).toBeLessThanOrEqual(100);
    for (const scenario of template.scenarios) {
      expect(scenario.candidateMentorIds.length).toBeGreaterThanOrEqual(5);
      expect(scenario.candidateMentorIds.length).toBeLessThanOrEqual(10);
      expect(new Set(scenario.candidateMentorIds).size).toBe(scenario.candidateMentorIds.length);
    }
  });

  it("does not present candidates in the engine's own ranking order", () => {
    // Anchoring reviewers to the engine's ordering would bias the labels toward
    // the thing being evaluated, and hide its worst misses entirely.
    const template = readData<{
      scenarios: { requestId: string; candidateMentorIds: string[] }[];
    }>(join("gold", "gold-set.template.json"));
    const byId = new Map(requests.map((request) => [request.requestId, request]));

    let compared = 0;
    let matchedEngineOrder = 0;

    for (const scenario of template.scenarios.slice(0, 20)) {
      const request = byId.get(scenario.requestId);
      if (request === undefined) continue;
      const { eligible } = applyHardConstraints(request, mentors);
      const engineOrder = topKRecommendations(request, eligible, { topK: 8 }).map((r) => r.mentorId);
      compared++;
      if (JSON.stringify(engineOrder) === JSON.stringify(scenario.candidateMentorIds)) {
        matchedEngineOrder++;
      }
    }

    expect(compared).toBeGreaterThan(10);
    expect(matchedEngineOrder).toBe(0);
  });

  it("builds the template deterministically", () => {
    const first = buildGoldSetTemplate(mentors, requests, {
      seed: 42,
      scenarios: 10,
      candidatesPerScenario: 8,
    });
    const second = buildGoldSetTemplate(mentors, requests, {
      seed: 42,
      scenarios: 10,
      candidatesPerScenario: 8,
    });
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    expect(first.scenarios.every((scenario) => scenario.labels.length === 0)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* The saved report                                                           */
/* -------------------------------------------------------------------------- */

describe("benchmark report", () => {
  const reportPath = join(DATA_DIR, "benchmark", "report.json");

  it("has been written by `npm run benchmark`", () => {
    expect(existsSync(reportPath), "run `npm run benchmark` first").toBe(true);
  });

  it("records the full committed workload, not a truncated run", () => {
    const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
      engineering: { requestsEvaluated: number; mentorsPerRequest: number };
    };
    expect(report.engineering.requestsEvaluated).toBe(requests.length);
    expect(report.engineering.mentorsPerRequest).toBe(mentors.length);
  });

  it("records every version needed to reproduce the run", () => {
    const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
      reportVersion: string;
      versions: Record<string, string | null>;
      dataset: Record<string, { sha256: string; records: number }>;
      run: Record<string, unknown>;
      status: string;
    };

    expect(report.reportVersion).toBe("benchmark-report.v1");
    for (const key of ["engine", "schema", "ontology", "aliases", "weights"]) {
      expect(report.versions[key], key).toBeTruthy();
    }

    // The artifact that actually ran, not only the semantic contract version.
    expect(report.versions.package).toMatch(/^@ed4u\/mentor-engine@\d/);
    // A commit is recorded when one exists; null is honest when it does not.
    expect(Object.hasOwn(report.versions, "gitCommit")).toBe(true);
    expect(Object.hasOwn(report.versions, "gitWorkingTreeDirty")).toBe(true);
    if (report.versions.gitCommit !== null) {
      expect(report.versions.gitCommit).toMatch(/^[0-9a-f]{40}$/);
    }
    for (const dataset of Object.values(report.dataset)) {
      expect(dataset.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(dataset.records).toBeGreaterThan(0);
    }
    for (const key of ["timestampUtc", "node", "platform", "arch", "cpu"]) {
      expect(report.run[key], key).toBeTruthy();
    }
    expect(report.status).toBe("PASS");
  });

  it("separates measured engineering metrics from unmeasured human ones", () => {
    const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
      engineering: Record<string, unknown>;
      humanQuality: { status: string; metrics: Record<string, unknown> };
      comparison: { note: string };
    };

    expect(report.engineering.hardConstraintViolationRate).toBe(0);
    expect(report.humanQuality.status).toBe("NOT_MEASURED");
    expect(Object.values(report.humanQuality.metrics)).toEqual([null, null, null]);
    // No fabricated human numbers anywhere in the persisted report.
    expect(JSON.stringify(report.humanQuality)).not.toMatch(/"ndcgAt3":\s*[0-9]/);
    // The comparison block must not be read as a quality claim.
    expect(report.comparison.note).toMatch(/does not mean either is better/i);
  });
});

/* -------------------------------------------------------------------------- */
/* Gold-set candidate universe                                                */
/* -------------------------------------------------------------------------- */

describe("gold scenarios are scored over their own candidate universe", () => {
  /**
   * Synthetic labels, used ONLY to exercise the metric plumbing.
   *
   * These are not human judgements and are never written to disk. The
   * repository still contains no label file, and the benchmark still reports
   * NOT_MEASURED — asserted separately above. Testing the arithmetic with
   * fixtures is legitimate; reporting quality from them would not be.
   */
  function labelFile(
    reviewerId: string,
    scenarios: { scenarioId: string; requestId: string; labels: RelevanceLabel[] }[],
  ): GoldLabelsFile {
    return { formatVersion: "gold-labels.v1", reviewerId, scenarios };
  }

  /** A two-candidate scenario over mentors the test controls completely. */
  function scenarioOver(candidateMentorIds: string[]): GoldSetTemplateFile {
    return {
      formatVersion: "gold-set.v1",
      scenarios: [
        {
          scenarioId: "GS-T01",
          requestId: "R001",
          request: makeRequest(),
          candidateMentorIds,
          labels: [],
        },
      ],
    };
  }

  const weakA = makeMentor("A-WEAK", {
    credentials: { ielts: { overall: 6 }, sat: null, hsk: null },
    rating: 3.2,
    sessionsCompleted: 5,
  });
  const weakB = makeMentor("B-WEAKER", {
    credentials: { ielts: { overall: 5.5 }, sat: null, hsk: null },
    rating: 3,
    sessionsCompleted: 3,
  });
  const outsider = makeMentor("Z-OUTSIDER", {
    credentials: {
      ielts: { overall: 9, listening: 9, reading: 9, writing: 9, speaking: 9 },
      sat: null,
      hsk: null,
    },
    rating: 5,
    sessionsCompleted: 900,
    pricePerHour: 100_000,
  });

  const template = scenarioOver(["A-WEAK", "B-WEAKER"]);
  const labels = [
    labelFile("reviewer-a", [
      {
        scenarioId: "GS-T01",
        requestId: "R001",
        labels: [
          { mentorId: "A-WEAK", relevance: 3 },
          { mentorId: "B-WEAKER", relevance: 0 },
        ],
      },
    ]),
  ];

  it("ignores mentors outside candidateMentorIds entirely", () => {
    const withoutOutsider = evaluateGoldScenarios(template, labels, [weakA, weakB]);
    const withOutsider = evaluateGoldScenarios(template, labels, [weakA, weakB, outsider]);

    // A dramatically better mentor exists in the pool but is not a candidate,
    // so it cannot move a single number.
    expect(withOutsider.metrics).toEqual(withoutOutsider.metrics);
    expect(withOutsider.measurements).toEqual(withoutOutsider.measurements);
    expect(withOutsider.status).toBe("MEASURED");
  });

  it("stays measurable when no candidate is in the engine's global Top-5", () => {
    // Twenty strong mentors crowd out both candidates from any global Top-5.
    const crowd = Array.from({ length: 20 }, (_, index) =>
      makeMentor(`STRONG-${String(index).padStart(2, "0")}`, {
        credentials: {
          ielts: { overall: 9, listening: 9, reading: 9, writing: 9, speaking: 9 },
          sat: null,
          hsk: null,
        },
        rating: 5,
        sessionsCompleted: 500,
      }),
    );
    const pool = [...crowd, weakA, weakB];

    const globalTop5 = topKRecommendations(makeRequest(), pool, { topK: 5 }).map((r) => r.mentorId);
    expect(globalTop5).not.toContain("A-WEAK");
    expect(globalTop5).not.toContain("B-WEAKER");

    const evaluation = evaluateGoldScenarios(template, labels, pool);
    expect(evaluation.status).toBe("MEASURED");
    expect(evaluation.measurements).toHaveLength(1);
    expect(evaluation.measurements[0]?.ndcgAt3).not.toBeNull();
    expect(evaluation.measurements[0]?.totalCandidates).toBe(2);
  });

  it("ranks the candidate subset independently of the global ranking", () => {
    const { order, usable } = rankGoldScenario(
      template.scenarios[0] as never,
      new Map([weakA, weakB, outsider].map((m) => [m.id, m])),
    );
    expect(usable.map((m) => m.id).sort()).toEqual(["A-WEAK", "B-WEAKER"]);
    expect(order).toEqual(["A-WEAK", "B-WEAKER"]);
  });

  it("reports how much of each scenario was actually judged", () => {
    const partial = [
      labelFile("reviewer-a", [
        {
          scenarioId: "GS-T01",
          requestId: "R001",
          labels: [{ mentorId: "A-WEAK", relevance: 3 }],
        },
      ]),
    ];
    const evaluation = evaluateGoldScenarios(template, partial, [weakA, weakB]);

    expect(evaluation.measurements[0]?.judgedCandidates).toBe(1);
    expect(evaluation.measurements[0]?.totalCandidates).toBe(2);
    expect(evaluation.coverage.candidateCoverage).toBe(0.5);
    expect(evaluation.coverage.partialScenarios).toBe(1);
  });

  it("excludes a candidate that is no longer eligible, and says so", () => {
    const verifiedOnly: GoldSetTemplateFile = {
      formatVersion: "gold-set.v1",
      scenarios: [
        {
          scenarioId: "GS-T01",
          requestId: "R001",
          request: makeRequest({
            hardConstraints: { verifiedOnly: true, requiredExpertise: [], requireAllAvailability: false },
          }),
          candidateMentorIds: ["A-WEAK", "B-WEAKER"],
          labels: [],
        },
      ],
    };
    const nowUnverified = makeMentor("B-WEAKER", { verified: false });

    const evaluation = evaluateGoldScenarios(verifiedOnly, labels, [weakA, nowUnverified]);
    expect(evaluation.issues.map((i) => i.code)).toContain("CANDIDATE_NO_LONGER_ELIGIBLE");
  });

  it("reports NOT_MEASURED when no reviewer has labelled anything", () => {
    const evaluation = evaluateGoldScenarios(template, [], [weakA, weakB]);
    expect(evaluation.status).toBe("NOT_MEASURED");
    expect(evaluation.metrics).toEqual({ ndcgAt3: null, precisionAt3: null, pairwiseAgreement: null });
  });
});

describe("inter-reviewer agreement", () => {
  it("is NOT_MEASURED with a single reviewer", () => {
    expect(
      interReviewerAgreement(
        [{ mentorId: "A", relevance: 3 }],
        [{ mentorId: "A", relevance: 1 }],
      ),
    ).toBeNull();
  });

  it("measures agreement over strictly-ordered pairs only", () => {
    const a = [
      { mentorId: "A", relevance: 3 },
      { mentorId: "B", relevance: 1 },
      { mentorId: "C", relevance: 2 },
    ];
    expect(interReviewerAgreement(a, a)).toBe(1);
    expect(
      interReviewerAgreement(a, [
        { mentorId: "A", relevance: 0 },
        { mentorId: "B", relevance: 3 },
        { mentorId: "C", relevance: 1 },
      ]),
    ).toBe(0);
    // Ties on one side carry no information and are skipped.
    expect(
      interReviewerAgreement(a, [
        { mentorId: "A", relevance: 2 },
        { mentorId: "B", relevance: 2 },
        { mentorId: "C", relevance: 2 },
      ]),
    ).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* Label validation                                                           */
/* -------------------------------------------------------------------------- */

describe("human labels are validated, never silently skipped", () => {
  const template: GoldSetTemplateFile = {
    formatVersion: "gold-set.v1",
    scenarios: [
      {
        scenarioId: "GS-001",
        requestId: "R001",
        request: makeRequest(),
        candidateMentorIds: ["M-A", "M-B"],
        labels: [],
      },
    ],
  };

  /** A structurally valid file, mutated per case. */
  function file(overrides: Record<string, unknown> = {}): unknown {
    return {
      formatVersion: "gold-labels.v1",
      reviewerId: "reviewer-a",
      scenarios: [
        { scenarioId: "GS-001", requestId: "R001", labels: [{ mentorId: "M-A", relevance: 3 }] },
      ],
      ...overrides,
    };
  }

  it("accepts a well-formed file", () => {
    const result = validateGoldLabelFile(file(), template, "reviewer-a.json");
    expect(result.ok).toBe(true);
  });

  const CASES: [string, unknown, string][] = [
    ["a stale format version", file({ formatVersion: "gold-labels.v0" }), "UNSUPPORTED_FORMAT_VERSION"],
    ["a missing reviewer id", file({ reviewerId: undefined }), "MALFORMED_STRUCTURE"],
    ["a blank reviewer id", file({ reviewerId: "   " }), "MALFORMED_STRUCTURE"],
    ["a non-object payload", "not a file", "MALFORMED_STRUCTURE"],
    ["an unknown extra field", file({ mood: "confident" }), "MALFORMED_STRUCTURE"],
    [
      "an unknown scenario id",
      file({ scenarios: [{ scenarioId: "GS-999", requestId: "R001", labels: [{ mentorId: "M-A", relevance: 3 }] }] }),
      "UNKNOWN_SCENARIO",
    ],
    [
      "a requestId mismatch",
      file({ scenarios: [{ scenarioId: "GS-001", requestId: "R999", labels: [{ mentorId: "M-A", relevance: 3 }] }] }),
      "REQUEST_ID_MISMATCH",
    ],
    [
      "a mentor outside the scenario",
      file({ scenarios: [{ scenarioId: "GS-001", requestId: "R001", labels: [{ mentorId: "M-GHOST", relevance: 3 }] }] }),
      "MENTOR_NOT_IN_SCENARIO",
    ],
    [
      "a duplicate mentor label",
      file({
        scenarios: [
          {
            scenarioId: "GS-001",
            requestId: "R001",
            labels: [
              { mentorId: "M-A", relevance: 3 },
              { mentorId: "M-A", relevance: 1 },
            ],
          },
        ],
      }),
      "DUPLICATE_MENTOR_LABEL",
    ],
    [
      "a duplicate scenario in one file",
      file({
        scenarios: [
          { scenarioId: "GS-001", requestId: "R001", labels: [{ mentorId: "M-A", relevance: 3 }] },
          { scenarioId: "GS-001", requestId: "R001", labels: [{ mentorId: "M-B", relevance: 2 }] },
        ],
      }),
      "DUPLICATE_SCENARIO",
    ],
    [
      "an empty label set",
      file({ scenarios: [{ scenarioId: "GS-001", requestId: "R001", labels: [] }] }),
      "EMPTY_LABEL_SET",
    ],
    [
      "a fractional relevance",
      file({ scenarios: [{ scenarioId: "GS-001", requestId: "R001", labels: [{ mentorId: "M-A", relevance: 2.5 }] }] }),
      "MALFORMED_STRUCTURE",
    ],
    [
      "a relevance above the scale",
      file({ scenarios: [{ scenarioId: "GS-001", requestId: "R001", labels: [{ mentorId: "M-A", relevance: 4 }] }] }),
      "MALFORMED_STRUCTURE",
    ],
    [
      "a negative relevance",
      file({ scenarios: [{ scenarioId: "GS-001", requestId: "R001", labels: [{ mentorId: "M-A", relevance: -1 }] }] }),
      "MALFORMED_STRUCTURE",
    ],
    [
      "a non-numeric relevance",
      file({ scenarios: [{ scenarioId: "GS-001", requestId: "R001", labels: [{ mentorId: "M-A", relevance: "high" }] }] }),
      "MALFORMED_STRUCTURE",
    ],
  ];

  it.each(CASES)("rejects %s", (_label, payload, expectedCode) => {
    const result = validateGoldLabelFile(payload, template, "reviewer-a.json");
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain(expectedCode);
  });

  it("attributes every issue to a reviewer, and a scenario or mentor where relevant", () => {
    const result = validateGoldLabelFile(
      file({ scenarios: [{ scenarioId: "GS-001", requestId: "R001", labels: [{ mentorId: "M-GHOST", relevance: 3 }] }] }),
      template,
      "reviewer-a.json",
    );
    expect(result.ok).toBe(false);
    const issue = result.issues[0];
    expect(issue?.reviewerId).toBe("reviewer-a");
    expect(issue?.scenarioId).toBe("GS-001");
    expect(issue?.mentorId).toBe("M-GHOST");
    expect(issue?.message.length).toBeGreaterThan(10);
  });
});

/* -------------------------------------------------------------------------- */
/* CLI and empty workloads                                                    */
/* -------------------------------------------------------------------------- */

describe("the benchmark cannot claim success without doing work", () => {
  it("accepts valid options", () => {
    expect(parseArgs(["--requests", "200", "--topK", "3"])).toEqual({ requests: 200, topK: 3 });
    expect(parseArgs([])).toEqual({});
  });

  const REJECTED: [string, string[]][] = [
    ["--requests 0", ["--requests", "0"]],
    ["--topK 0", ["--topK", "0"]],
    ["a negative count", ["--requests", "-5"]],
    ["a fractional count", ["--requests", "2.5"]],
    ["a non-numeric value", ["--requests", "abc"]],
    ["an empty value", ["--requests", ""]],
    ["Infinity", ["--requests", "Infinity"]],
    ["NaN", ["--requests", "NaN"]],
    ["an unknown flag", ["--bogus", "5"]],
    ["a missing value", ["--requests"]],
    ["a bare argument", ["200"]],
  ];

  it.each(REJECTED)("rejects %s", (_label, argv) => {
    expect(() => parseArgs(argv)).toThrow(CliError);
  });

  it("never reports a rate of 100% from an empty run", () => {
    const empty = runBenchmark([], [], { topK: 5 });

    // Zero violations out of zero recommendations is "not measured", not "perfect".
    expect(empty.engineering.hardConstraintViolationRate).toBeNull();
    expect(empty.engineering.validResultRate).toBeNull();
    expect(empty.engineering.determinismRate).toBeNull();
    expect(empty.status).toBe("FAIL");
    expect(empty.failures.map((f) => f.kind)).toContain("EMPTY_WORKLOAD");
  });

  it("still measures rates on a real workload", () => {
    const real = runBenchmark(mentors, requests.slice(0, 20), { topK: 3 });
    expect(real.engineering.hardConstraintViolationRate).toBe(0);
    expect(real.engineering.determinismRate).toBe(1);
    expect(real.status).toBe("PASS");
  });
});
