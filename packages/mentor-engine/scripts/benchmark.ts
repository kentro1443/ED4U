/**
 * Evaluation harness: prove the engine works, instead of asserting it does.
 *
 * Runs the full pipeline over the committed fixtures and reports two clearly
 * separated things:
 *
 * - **Engineering metrics** — measured here, every run: hard-constraint
 *   violations, valid-result rate, crashes, duplicates, invalid scores,
 *   determinism, latency. These say whether the engine *works*.
 * - **Human-quality metrics** — NDCG@3, Precision@3, pairwise agreement. These
 *   say whether it is *right*, and they are reported as `NOT_MEASURED` until
 *   real reviewers have labelled the gold set. They are never estimated,
 *   simulated, or filled in from the engine's own output.
 *
 * The harness fails loudly — non-zero exit, offending ids listed — on any hard
 * constraint violation, crash, invalid score, duplicate recommendation, or
 * determinism failure. A benchmark that cannot fail is decoration.
 *
 * ```bash
 * npm run benchmark
 * npx tsx scripts/benchmark.ts --requests 200 --topK 3
 * ```
 */

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { arch, cpus, platform, totalmem } from "node:os";
import { performance } from "node:perf_hooks";

import {
  ALIASES_VERSION,
  ENGINE_VERSION,
  ONTOLOGY_VERSION,
  SCHEMA_VERSION,
  WEIGHTS_VERSION,
  applyHardConstraints,
  baselineACredentialSort,
  baselineBStaticWeighted,
  satisfiesHardConstraints,
  topKRecommendations,
  validateMentors,
  validateStudentRequest,
} from "../src/index.js";
import type { Mentor, MentorRecommendation, StudentRequest } from "../src/index.js";
import { kendallTau, meanOfMeasured, percentile, round, topKOverlap } from "./metrics.js";
import { evaluateGoldScenarios, validateGoldLabelFile } from "./goldSet.js";
import type {
  GoldEvaluation,
  GoldIssue,
  GoldLabelsFile,
  GoldSetTemplateFile,
} from "./goldSet.js";

/** Version of the benchmark report format. */
export const BENCHMARK_REPORT_VERSION = "benchmark-report.v1";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, "..", "data");
const GOLD_DIR = join(DATA_DIR, "gold");
const REPORT_DIR = join(DATA_DIR, "benchmark");

/** Reads a committed dataset file. */
function readData<T>(name: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, name), "utf8")) as T;
}

/** A single thing that went wrong, always carrying the ids needed to debug it. */
export interface BenchmarkFailure {
  kind:
    | "HARD_CONSTRAINT_VIOLATION"
    | "UNHANDLED_CRASH"
    | "INVALID_SCORE"
    | "DUPLICATE_RECOMMENDATION"
    | "NON_DETERMINISTIC"
    | "MALFORMED_RECOMMENDATION"
    | "EMPTY_WORKLOAD";
  requestId: string;
  mentorId?: string;
  detail: string;
}

/** Everything the harness measured about engine behaviour. */
export interface EngineeringMetrics {
  requestsEvaluated: number;
  mentorsPerRequest: number;
  recommendationsProduced: number;
  hardConstraintViolations: number;
  /** `null` when nothing was produced to violate anything. */
  hardConstraintViolationRate: number | null;
  validResults: number;
  /** `null` when no request was evaluated. */
  validResultRate: number | null;
  unhandledCrashes: number;
  duplicateRecommendations: number;
  invalidScores: number;
  deterministicRequests: number;
  /** `null` when no request was evaluated. */
  determinismRate: number | null;
  feasibleRequests: number;
  infeasibleRequests: number;
  latencyMs: { p50: number; p95: number; max: number; mean: number };
}

/* -------------------------------------------------------------------------- */
/* Gold set                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Loads and validates every reviewer label file.
 *
 * A malformed file is never silently skipped: its issues are returned and end up
 * in the report, naming the reviewer, scenario and mentor responsible.
 */
function loadHumanLabels(template: GoldSetTemplateFile): {
  files: GoldLabelsFile[];
  issues: GoldIssue[];
} {
  const labelsDir = join(GOLD_DIR, "labels");
  if (!existsSync(labelsDir)) return { files: [], issues: [] };

  const files: GoldLabelsFile[] = [];
  const issues: GoldIssue[] = [];

  for (const name of readdirSync(labelsDir).sort()) {
    if (!name.endsWith(".json")) continue;

    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(join(labelsDir, name), "utf8"));
    } catch (error) {
      issues.push({
        code: "MALFORMED_STRUCTURE",
        reviewerId: name,
        message: `File is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      });
      continue;
    }

    const validated = validateGoldLabelFile(raw, template, name);
    if (validated.ok) files.push(validated.value);
    else issues.push(...validated.issues);
  }

  return { files, issues };
}

/** Reads the committed gold-set template, if it has been generated. */
function loadGoldTemplate(): GoldSetTemplateFile | undefined {
  const path = join(GOLD_DIR, "gold-set.template.json");
  if (!existsSync(path)) return undefined;
  return JSON.parse(readFileSync(path, "utf8")) as GoldSetTemplateFile;
}

/* -------------------------------------------------------------------------- */
/* Auditing                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Checks one result set for everything that must never happen.
 *
 * Extracted so the harness's own detection logic can be tested against
 * deliberately broken input. A benchmark whose checks have never been shown to
 * fire is decoration: it would report a clean run no matter what the engine did.
 *
 * @param request - The request these recommendations answer.
 * @param mentors - The candidate pool they were drawn from.
 * @param recommendations - What the engine returned.
 * @returns Every problem found, each naming the ids needed to reproduce it.
 */
export function auditRecommendations(
  request: StudentRequest,
  mentors: readonly Mentor[],
  recommendations: readonly MentorRecommendation[],
): BenchmarkFailure[] {
  const failures: BenchmarkFailure[] = [];
  const byId = new Map(mentors.map((mentor) => [mentor.id, mentor]));
  const seen = new Set<string>();

  for (const [index, recommendation] of recommendations.entries()) {
    if (seen.has(recommendation.mentorId)) {
      failures.push({
        kind: "DUPLICATE_RECOMMENDATION",
        requestId: request.requestId,
        mentorId: recommendation.mentorId,
        detail: "Mentor appears more than once in one result set",
      });
    }
    seen.add(recommendation.mentorId);

    const { matchScore, dataCoverage } = recommendation;
    if (!Number.isFinite(matchScore) || matchScore < 0 || matchScore > 100) {
      failures.push({
        kind: "INVALID_SCORE",
        requestId: request.requestId,
        mentorId: recommendation.mentorId,
        detail: `matchScore ${String(matchScore)} is not a finite value in [0, 100]`,
      });
    }
    if (!Number.isFinite(dataCoverage) || dataCoverage < 0 || dataCoverage > 1) {
      failures.push({
        kind: "INVALID_SCORE",
        requestId: request.requestId,
        mentorId: recommendation.mentorId,
        detail: `dataCoverage ${String(dataCoverage)} is not a finite value in [0, 1]`,
      });
    }

    if (recommendation.rank !== index + 1) {
      failures.push({
        kind: "MALFORMED_RECOMMENDATION",
        requestId: request.requestId,
        mentorId: recommendation.mentorId,
        detail: `Rank ${recommendation.rank} out of sequence at position ${index + 1}`,
      });
    }
    if (recommendation.reasons.length === 0) {
      failures.push({
        kind: "MALFORMED_RECOMMENDATION",
        requestId: request.requestId,
        mentorId: recommendation.mentorId,
        detail: "Recommendation carries no factual reason",
      });
    }

    // The invariant everything else rests on.
    const mentor = byId.get(recommendation.mentorId);
    if (mentor === undefined || !satisfiesHardConstraints(request, mentor)) {
      failures.push({
        kind: "HARD_CONSTRAINT_VIOLATION",
        requestId: request.requestId,
        mentorId: recommendation.mentorId,
        detail:
          mentor === undefined
            ? "Recommended mentor is not in the candidate pool"
            : "Recommended mentor violates a hard constraint",
      });
    }
  }

  return failures;
}

/* -------------------------------------------------------------------------- */
/* Benchmark                                                                  */
/* -------------------------------------------------------------------------- */

/** Options accepted by {@link runBenchmark}. */
export interface BenchmarkOptions {
  requests?: number;
  topK?: number;
}

/** The full benchmark result, before it is written to disk. */
export interface BenchmarkResult {
  engineering: EngineeringMetrics;
  comparison: Record<string, unknown>;
  humanQuality: GoldEvaluation | NotMeasured;
  failures: BenchmarkFailure[];
  status: "PASS" | "FAIL";
}

/** Human quality when there is not even a gold-set template to score against. */
export interface NotMeasured {
  status: "NOT_MEASURED";
  reason: string;
  metrics: { ndcgAt3: null; precisionAt3: null; pairwiseAgreement: null };
}

/**
 * Runs the benchmark over the committed fixtures.
 *
 * Pure with respect to the filesystem apart from reading fixtures: the caller
 * decides whether to write a report, so tests can run the same measurement
 * without producing artefacts.
 *
 * @param mentors - Validated mentor fixtures.
 * @param requests - Validated request fixtures.
 * @param options - Scope of the run.
 */
export function runBenchmark(
  mentors: readonly Mentor[],
  requests: readonly StudentRequest[],
  options: BenchmarkOptions = {},
): BenchmarkResult {
  const topK = options.topK ?? 5;
  const failures: BenchmarkFailure[] = [];
  const latencies: number[] = [];

  let recommendationsProduced = 0;
  let hardConstraintViolations = 0;
  let validResults = 0;
  let unhandledCrashes = 0;
  let duplicateRecommendations = 0;
  let invalidScores = 0;
  let deterministicRequests = 0;
  let feasibleRequests = 0;

  const engineTop: Map<string, string[]> = new Map();
  const baselineATop: Map<string, string[]> = new Map();
  const baselineBTop: Map<string, string[]> = new Map();

  for (const request of requests) {
    let recommendations: MentorRecommendation[];

    const started = performance.now();
    try {
      const { eligible, status } = applyHardConstraints(request, mentors);
      recommendations = topKRecommendations(request, eligible, { topK });
      latencies.push(performance.now() - started);

      if (status === "FEASIBLE") feasibleRequests++;

      /* Determinism: same inputs, byte-identical output. -------------------- */
      const repeat = topKRecommendations(request, eligible, { topK });
      if (JSON.stringify(repeat) === JSON.stringify(recommendations)) {
        deterministicRequests++;
      } else {
        failures.push({
          kind: "NON_DETERMINISTIC",
          requestId: request.requestId,
          detail: "Two identical calls produced different recommendations",
        });
      }

      /* Baselines, for comparison only. ------------------------------------ */
      engineTop.set(request.requestId, recommendations.map((r) => r.mentorId));
      baselineATop.set(
        request.requestId,
        baselineACredentialSort(request, eligible, { topK }).map((r) => r.mentorId),
      );
      baselineBTop.set(
        request.requestId,
        baselineBStaticWeighted(request, eligible, { topK }).map((r) => r.mentorId),
      );
    } catch (error) {
      unhandledCrashes++;
      failures.push({
        kind: "UNHANDLED_CRASH",
        requestId: request.requestId,
        detail: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    /* Structural checks, via the shared auditor. --------------------------- */
    recommendationsProduced += recommendations.length;

    const requestFailures = auditRecommendations(request, mentors, recommendations);
    for (const failure of requestFailures) {
      if (failure.kind === "DUPLICATE_RECOMMENDATION") duplicateRecommendations++;
      if (failure.kind === "INVALID_SCORE") invalidScores++;
      if (failure.kind === "HARD_CONSTRAINT_VIOLATION") hardConstraintViolations++;
      failures.push(failure);
    }

    const requestIsValid = requestFailures.length === 0;

    if (requestIsValid) validResults++;
  }

  const evaluated = requests.length;
  // A zero denominator means "nothing was measured", which is emphatically not
  // "everything passed". Returning 1 here once let an empty run report a 100%
  // violation rate and a clean bill of health in the same breath.
  const safeRate = (numerator: number, denominator: number): number | null =>
    denominator === 0 ? null : round(numerator / denominator, 6);

  if (evaluated === 0) {
    failures.push({
      kind: "EMPTY_WORKLOAD",
      requestId: "(none)",
      detail: "Benchmark ran zero requests; no claim of success can be made from an empty run",
    });
  }

  const engineering: EngineeringMetrics = {
    requestsEvaluated: evaluated,
    mentorsPerRequest: mentors.length,
    recommendationsProduced,
    hardConstraintViolations,
    hardConstraintViolationRate: safeRate(hardConstraintViolations, recommendationsProduced),
    validResults,
    validResultRate: safeRate(validResults, evaluated),
    unhandledCrashes,
    duplicateRecommendations,
    invalidScores,
    deterministicRequests,
    determinismRate: safeRate(deterministicRequests, evaluated),
    feasibleRequests,
    infeasibleRequests: evaluated - feasibleRequests - unhandledCrashes,
    latencyMs: {
      p50: round(percentile(latencies, 50), 3),
      p95: round(percentile(latencies, 95), 3),
      max: round(Math.max(0, ...latencies), 3),
      mean: round(latencies.reduce((a, b) => a + b, 0) / Math.max(1, latencies.length), 3),
    },
  };

  /* Engine vs baselines: divergence, not quality. ------------------------- */
  const compareAgainst = (baseline: Map<string, string[]>) => {
    const taus: (number | null)[] = [];
    const overlaps: (number | null)[] = [];
    let sameTop1 = 0;
    let comparable = 0;

    for (const [requestId, engineOrder] of engineTop) {
      const baselineOrder = baseline.get(requestId);
      if (baselineOrder === undefined || engineOrder.length === 0) continue;
      comparable++;
      taus.push(kendallTau(engineOrder, baselineOrder));
      overlaps.push(topKOverlap(engineOrder, baselineOrder, 3));
      if (engineOrder[0] === baselineOrder[0]) sameTop1++;
    }

    return {
      comparedRequests: comparable,
      sameTopMentorRate: safeRate(sameTop1, comparable),
      meanKendallTau: meanOfMeasured(taus),
      meanTop3Overlap: meanOfMeasured(overlaps),
    };
  };

  const comparison = {
    note: "These measure how differently rankerV1 and each baseline order the same candidates. A low overlap means they disagree; it does not mean either is better. Only human labels can establish that.",
    baselineA: {
      description: "Eligible mentors sorted by their credential in the goal domain.",
      ...compareAgainst(baselineATop),
    },
    baselineB: {
      description:
        "Static non-request-aware weighted score; missing data counts as zero instead of being redistributed.",
      ...compareAgainst(baselineBTop),
    },
  };

  /* Human quality: over each scenario's OWN candidate universe. ------------ */
  // Deliberately NOT derived from `engineTop`. That is the engine's Top-K over
  // the whole eligible pool; a reviewer judged eight named mentors. Scoring one
  // against the other compares answers to different questions.
  const template = loadGoldTemplate();
  const humanQuality =
    template === undefined
      ? {
          status: "NOT_MEASURED" as const,
          reason:
            "No gold-set template found. Run `npm run goldset:template`, then have independent reviewers label it.",
          metrics: { ndcgAt3: null, precisionAt3: null, pairwiseAgreement: null },
        }
      : (() => {
          const { files, issues } = loadHumanLabels(template);
          return evaluateGoldScenarios(template, files, mentors, issues);
        })();

  const status: "PASS" | "FAIL" = failures.length === 0 ? "PASS" : "FAIL";

  return { engineering, comparison, humanQuality, failures, status };
}

/* -------------------------------------------------------------------------- */
/* CLI                                                                        */
/* -------------------------------------------------------------------------- */

/** Flags the CLI understands. */
const KNOWN_FLAGS = ["requests", "topK"] as const;

/** A rejected command line, with the reason a human needs to fix it. */
export class CliError extends Error {}

/**
 * Parses and strictly validates `--flag value` pairs.
 *
 * Strict because a benchmark that quietly accepts `--requests 0` will happily
 * report PASS for having evaluated nothing, and a typo'd flag would be silently
 * ignored while the run pretended to honour it.
 *
 * @throws {CliError} On unknown flags, missing values, or values that are not
 *   finite positive integers.
 */
export function parseArgs(argv: readonly string[]): { requests?: number; topK?: number } {
  const parsed: { requests?: number; topK?: number } = {};

  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const raw = argv[i + 1];

    if (flag === undefined) break;
    if (!flag.startsWith("--")) {
      throw new CliError(`Unexpected argument "${flag}"; options must be given as --flag value`);
    }

    const name = flag.slice(2);
    if (!(KNOWN_FLAGS as readonly string[]).includes(name)) {
      throw new CliError(`Unknown option "${flag}". Supported: ${KNOWN_FLAGS.map((f) => `--${f}`).join(", ")}`);
    }
    if (raw === undefined) throw new CliError(`Option "${flag}" needs a value`);

    const value = Number(raw);
    if (!Number.isFinite(value) || !Number.isInteger(value) || value < 1) {
      throw new CliError(
        `Option "${flag}" must be a finite positive integer, received "${raw}". A benchmark of zero work cannot pass.`,
      );
    }

    parsed[name as (typeof KNOWN_FLAGS)[number]] = value;
  }

  return parsed;
}

/**
 * The exact artifact version this run used.
 *
 * `ENGINE_VERSION` is the semantic contract version and moves slowly; the
 * package version is what actually shipped. A persisted report has to name both,
 * or it cannot be tied back to the code that produced it.
 */
function packageVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(HERE, "..", "package.json"), "utf8")) as {
      name?: string;
      version?: string;
    };
    return `${pkg.name ?? "unknown"}@${pkg.version ?? "unknown"}`;
  } catch {
    return "unknown";
  }
}

/**
 * The commit this ran against, when the working tree is a git checkout.
 *
 * `null` rather than a guess when git is unavailable — a report that invents a
 * commit is worse than one that admits it does not know.
 */
function gitCommitSha(): { sha: string | null; dirty: boolean | null } {
  try {
    const sha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: join(HERE, ".."),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const status = execFileSync("git", ["status", "--porcelain"], {
      cwd: join(HERE, ".."),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return { sha, dirty: status.trim().length > 0 };
  } catch {
    return { sha: null, dirty: null };
  }
}

/** SHA-256 of a fixture file, so a report names the exact data it ran on. */
function fixtureHash(name: string): string {
  return createHash("sha256").update(readFileSync(join(DATA_DIR, name), "utf8"), "utf8").digest("hex");
}

/**
 * Runs the benchmark, writes the versioned report, and returns an exit code.
 *
 * @returns 0 when every check passed, 1 otherwise.
 */
export function main(options: BenchmarkOptions = {}): number {
  const mentorResult = validateMentors(readData<unknown[]>("mentors.mock.json"));
  if (!mentorResult.ok) {
    console.error("Mentor fixtures failed validation; run `npm run generate` first.");
    return 1;
  }

  // Every committed normal request must validate. Skipping a bad fixture would
  // shrink the workload silently and still report PASS, which is the same class
  // of dishonesty as an empty run.
  const requests: StudentRequest[] = [];
  const invalidFixtures: string[] = [];

  readData<unknown[]>("requests.mock.json").forEach((raw, index) => {
    const parsed = validateStudentRequest(raw);
    if (parsed.ok) {
      requests.push(parsed.value);
      return;
    }
    const requestId =
      typeof raw === "object" && raw !== null && typeof (raw as { requestId?: unknown }).requestId === "string"
        ? (raw as { requestId: string }).requestId
        : "(unrecoverable requestId)";
    invalidFixtures.push(
      `requests.mock.json[${index}] ${requestId}: ${parsed.issues.map((i) => `${i.path} ${i.message}`).join("; ")}`,
    );
  });

  if (invalidFixtures.length > 0) {
    console.error(`Request fixtures failed validation (${invalidFixtures.length}); run \`npm run generate\`.`);
    for (const detail of invalidFixtures.slice(0, 10)) console.error(`  ${detail}`);
    return 1;
  }

  if (requests.length === 0) {
    console.error("No request fixtures to benchmark.");
    return 1;
  }

  const limit = options.requests ?? requests.length;
  const scoped = requests.slice(0, limit);
  const git = gitCommitSha();
  const startedAt = Date.now();
  const result = runBenchmark(mentorResult.value, scoped, options);
  const durationMs = Date.now() - startedAt;

  const report = {
    reportVersion: BENCHMARK_REPORT_VERSION,
    status: result.status,
    versions: {
      /** Semantic contract versions. */
      engine: ENGINE_VERSION,
      schema: SCHEMA_VERSION,
      ontology: ONTOLOGY_VERSION,
      aliases: ALIASES_VERSION,
      weights: WEIGHTS_VERSION,
      /** The artifact that actually ran, and the code it was built from. */
      package: packageVersion(),
      gitCommit: git.sha,
      gitWorkingTreeDirty: git.dirty,
    },
    dataset: {
      mentors: { file: "mentors.mock.json", records: mentorResult.value.length, sha256: fixtureHash("mentors.mock.json") },
      requests: { file: "requests.mock.json", records: scoped.length, sha256: fixtureHash("requests.mock.json") },
    },
    run: {
      // Environment is recorded because latency is the one metric that depends
      // on it; every other number here is machine-independent.
      timestampUtc: new Date(startedAt).toISOString(),
      durationMs,
      node: process.version,
      platform: platform(),
      arch: arch(),
      cpu: cpus()[0]?.model ?? "unknown",
      cpuCount: cpus().length,
      totalMemoryMb: Math.round(totalmem() / 1024 / 1024),
    },
    engineering: result.engineering,
    comparison: result.comparison,
    humanQuality: result.humanQuality,
    failures: result.failures.slice(0, 100),
    failureCount: result.failures.length,
  };

  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(join(REPORT_DIR, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

  /* Console summary. ------------------------------------------------------- */
  const e = result.engineering;
  console.log(`Benchmark ${result.status} — ${e.requestsEvaluated} requests x ${e.mentorsPerRequest} mentors\n`);
  console.log("Engineering metrics (measured):");
  const pct = (rate: number | null) => (rate === null ? "n/a" : `${(rate * 100).toFixed(2)}%`);
  console.log(`  hard constraint violations : ${e.hardConstraintViolations} (${pct(e.hardConstraintViolationRate)})`);
  console.log(`  valid result rate          : ${pct(e.validResultRate)}`);
  console.log(`  unhandled crashes          : ${e.unhandledCrashes}`);
  console.log(`  duplicate recommendations  : ${e.duplicateRecommendations}`);
  console.log(`  invalid scores             : ${e.invalidScores}`);
  console.log(`  determinism                : ${pct(e.determinismRate)}`);
  console.log(`  feasible / infeasible      : ${e.feasibleRequests} / ${e.infeasibleRequests}`);
  console.log(`  latency p50 / p95 / max ms : ${e.latencyMs.p50} / ${e.latencyMs.p95} / ${e.latencyMs.max}\n`);

  const a = result.comparison.baselineA as { sameTopMentorRate: number; meanTop3Overlap: { mean: number | null } };
  const b = result.comparison.baselineB as { sameTopMentorRate: number; meanTop3Overlap: { mean: number | null } };
  console.log("Divergence from baselines (not a quality claim):");
  console.log(`  vs Baseline A: same top mentor ${(a.sameTopMentorRate * 100).toFixed(1)}%, mean top-3 overlap ${String(a.meanTop3Overlap.mean)}`);
  console.log(`  vs Baseline B: same top mentor ${(b.sameTopMentorRate * 100).toFixed(1)}%, mean top-3 overlap ${String(b.meanTop3Overlap.mean)}\n`);

  const human = result.humanQuality as { status: string; reason?: string };
  console.log(`Human-quality metrics: ${human.status}`);
  if (human.reason !== undefined) console.log(`  ${human.reason}\n`);

  if (result.failures.length > 0) {
    console.error(`FAILURES (${result.failures.length}), first 10:`);
    for (const failure of result.failures.slice(0, 10)) {
      console.error(`  [${failure.kind}] ${failure.requestId}${failure.mentorId === undefined ? "" : `/${failure.mentorId}`}: ${failure.detail}`);
    }
    return 1;
  }

  console.log("Report written to data/benchmark/report.json");
  return 0;
}

/* Run when invoked directly. */
if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "")) {
  try {
    const args = parseArgs(process.argv.slice(2));
    process.exitCode = main({
      ...(args.requests === undefined ? {} : { requests: args.requests }),
      ...(args.topK === undefined ? {} : { topK: args.topK }),
    });
  } catch (error) {
    console.error(error instanceof CliError ? error.message : String(error));
    process.exitCode = 1;
  }
}
