/**
 * Builds the empty human gold-set template.
 *
 * This script creates *scenarios* — a request plus a shortlist of candidates —
 * and nothing else. Every `labels` array it writes is empty, and it must stay
 * that way:
 *
 * > **Do not fabricate human labels.** A synthesised label is not a weak
 * > signal, it is a fake measurement. Quality metrics computed against invented
 * > labels would report the engine agreeing with itself, dressed up as human
 * > agreement, and would be worse than reporting nothing at all.
 *
 * Candidates are sampled **at random from the eligible pool**, not taken from
 * `rankerV1`'s top results. Showing reviewers the engine's own favourites first
 * would bias their judgement toward the thing being evaluated, and would also
 * leave the engine's worst mistakes — good mentors it ranked far down — unseen
 * and unmeasured.
 *
 * ```bash
 * npm run goldset:template
 * ```
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { SeededRandom } from "./random.js";
import {
  ENGINE_VERSION,
  SCHEMA_VERSION,
  applyHardConstraints,
  validateMentors,
  validateStudentRequest,
} from "../src/index.js";
import type { Mentor, StudentRequest } from "../src/index.js";
import { readFileSync } from "node:fs";

/** Version of the gold-set file format. */
export const GOLD_SET_FORMAT_VERSION = "gold-set.v1";

/** Defaults chosen to sit inside PLAN.md's 50–100 scenarios, 5–10 candidates. */
export const GOLD_SET_DEFAULTS = {
  seed: 42,
  scenarios: 60,
  candidatesPerScenario: 8,
} as const;

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, "..", "data");
const GOLD_DIR = join(DATA_DIR, "gold");

/** One scenario awaiting human judgement. */
export interface GoldScenario {
  scenarioId: string;
  requestId: string;
  /** The full canonical request, so reviewers see exactly what was asked. */
  request: StudentRequest;
  /** Shortlist to rank, in a fixed but ranking-independent order. */
  candidateMentorIds: string[];
  /**
   * Human relevance judgements. **Always empty in the template.** Reviewers
   * fill these in a separate labels file; see `data/gold/README.md`.
   */
  labels: never[];
}

/** The template file's shape. */
export interface GoldSetTemplate {
  formatVersion: string;
  engineVersion: string;
  schemaVersion: string;
  seed: number;
  instructions: string[];
  labelsAreFabricated: false;
  scenarios: GoldScenario[];
}

/**
 * Builds gold-set scenarios from the committed fixtures.
 *
 * @param options - Seed, scenario count and candidates per scenario.
 * @returns Scenarios with empty label arrays.
 */
export function buildGoldSetTemplate(
  mentors: readonly Mentor[],
  requests: readonly StudentRequest[],
  options: { seed: number; scenarios: number; candidatesPerScenario: number },
): GoldSetTemplate {
  const rng = new SeededRandom(options.seed);
  const scenarios: GoldScenario[] = [];

  for (const request of requests) {
    if (scenarios.length >= options.scenarios) break;

    const { eligible, status } = applyHardConstraints(request, mentors);
    // A scenario is only useful if reviewers have a real choice to make.
    if (status === "NO_FEASIBLE_MATCH" || eligible.length < options.candidatesPerScenario) continue;

    const sampled = rng
      .sample(eligible, options.candidatesPerScenario)
      .map((mentor) => mentor.id)
      .sort();

    scenarios.push({
      scenarioId: `GS-${String(scenarios.length + 1).padStart(3, "0")}`,
      requestId: request.requestId,
      request,
      candidateMentorIds: sampled,
      labels: [],
    });
  }

  return {
    formatVersion: GOLD_SET_FORMAT_VERSION,
    engineVersion: ENGINE_VERSION,
    schemaVersion: SCHEMA_VERSION,
    seed: options.seed,
    labelsAreFabricated: false,
    instructions: [
      "Each scenario is one student request and a shortlist of eligible mentors.",
      "Rank or grade the candidates for that specific request, using the request's own goal, constraints and preferences.",
      "Suggested grades: 3 = ideal match, 2 = good, 1 = weak but defensible, 0 = unsuitable.",
      "Candidates are listed in id order, NOT in the engine's ranking order, so your judgement is not anchored to it.",
      "Do not consult the engine's output while labelling.",
      "At least two independent reviewers should label each scenario so agreement can be measured.",
      "Write labels to data/gold/labels/<reviewerId>.json — never into this template.",
    ],
    scenarios,
  };
}

/** Reads a committed dataset file. */
function readData<T>(name: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, name), "utf8")) as T;
}

/**
 * Writes the template and the reviewer instructions.
 *
 * @returns Exit code; non-zero if the fixtures could not produce enough scenarios.
 */
export function main(options = GOLD_SET_DEFAULTS): number {
  const mentorResult = validateMentors(readData<unknown[]>("mentors.mock.json"));
  if (!mentorResult.ok) {
    console.error("Mentor fixtures failed validation; regenerate with `npm run generate`.");
    return 1;
  }

  const requests: StudentRequest[] = [];
  for (const raw of readData<unknown[]>("requests.mock.json")) {
    const parsed = validateStudentRequest(raw);
    if (parsed.ok) requests.push(parsed.value);
  }

  const template = buildGoldSetTemplate(mentorResult.value, requests, options);

  if (template.scenarios.length < 50) {
    console.error(
      `Only ${template.scenarios.length} scenarios could be built; PLAN.md asks for 50-100.`,
    );
    return 1;
  }

  mkdirSync(join(GOLD_DIR, "labels"), { recursive: true });
  writeFileSync(
    join(GOLD_DIR, "gold-set.template.json"),
    `${JSON.stringify(template, null, 2)}\n`,
    "utf8",
  );

  console.log(
    `Gold-set template: ${template.scenarios.length} scenarios x ${options.candidatesPerScenario} candidates`,
  );
  console.log("All label arrays are empty. Human labels must come from real reviewers.");
  console.log(`Written to data/gold/gold-set.template.json`);
  return 0;
}

/* Run when invoked directly. */
if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "")) {
  process.exitCode = main();
}
