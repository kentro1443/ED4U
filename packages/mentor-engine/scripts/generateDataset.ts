/**
 * Dataset orchestrator: generates every mock file and the manifest.
 *
 * Deliberately the only place that touches the filesystem — the generators
 * themselves are pure functions so tests can call them without writing files,
 * and the engine never reads files at all.
 *
 * ```bash
 * npm run generate                 # seed 42, 500 mentors, 1000 requests, 100 adversarial
 * npx tsx scripts/generateDataset.ts --seed 7 --mentors 50 --requests 100 --adversarial 20
 * ```
 */

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { GENERATOR_VERSION, generateMentors, summarizeMentors } from "./generateMentors.js";
import {
  ADVERSARIAL_LABELS,
  generateAdversarialCases,
  generateRequests,
  summarizeRequests,
} from "./generateRequests.js";
import type { AdversarialCase } from "./generateRequests.js";
import { ENGINE_VERSION, ONTOLOGY_VERSION, SCHEMA_VERSION, validateMentors, validateStudentRequest } from "../src/index.js";

/** Default dataset shape, matching the Phase 3 minimums in PLAN.md. */
export const DEFAULT_DATASET = {
  seed: 42,
  mentors: 500,
  requests: 1000,
  adversarial: 100,
} as const;

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, "..", "data");

/** Serialises a value the one way the whole project agrees on. */
function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** Returns the SHA-256 of a string, for manifest integrity records. */
function sha256(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/** Parses `--flag value` pairs from argv. */
function parseArgs(argv: readonly string[]): Record<string, number> {
  const parsed: Record<string, number> = {};
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i];
    const value = Number(argv[i + 1]);
    if (flag?.startsWith("--") && Number.isFinite(value)) {
      parsed[flag.slice(2)] = value;
    }
  }
  return parsed;
}

/** Counts adversarial cases per label, for the manifest. */
function summarizeAdversarial(cases: readonly AdversarialCase[]) {
  const byLabel: Record<string, number> = {};
  let deliberatelyInvalid = 0;

  for (const adversarialCase of cases) {
    byLabel[adversarialCase.label] = (byLabel[adversarialCase.label] ?? 0) + 1;
    if (!adversarialCase.expectsSchemaValid) deliberatelyInvalid++;
  }

  return {
    count: cases.length,
    labels: ADVERSARIAL_LABELS.length,
    byLabel: Object.fromEntries(Object.entries(byLabel).sort()),
    deliberatelyInvalid,
    validPayloads: cases.length - deliberatelyInvalid,
  };
}

/**
 * Generates every dataset file plus the manifest, and prints a summary.
 *
 * @param options - Seed and per-dataset counts.
 * @returns Exit code: non-zero when a *normal* record fails validation.
 */
export function main(options: {
  seed: number;
  mentors: number;
  requests: number;
  adversarial: number;
}): number {
  const mentors = generateMentors({ seed: options.seed, count: options.mentors });
  // Offset the seed per dataset so requests are not a mirror of the mentor draw.
  const requests = generateRequests({ seed: options.seed + 1, count: options.requests });
  const adversarial = generateAdversarialCases({
    seed: options.seed + 2,
    count: options.adversarial,
  });

  /* Validate every normal record before anything is written. -------------- */
  const mentorValidation = validateMentors(mentors);
  const invalidRequests = requests
    .map((request, index) => ({ index, result: validateStudentRequest(request) }))
    .filter(({ result }) => !result.ok);

  if (!mentorValidation.ok || invalidRequests.length > 0) {
    console.error("Generation FAILED: normal records must all validate.");
    if (!mentorValidation.ok) {
      console.error(`  mentors: ${mentorValidation.issues.length} issue(s)`);
      for (const issue of mentorValidation.issues.slice(0, 5)) {
        console.error(`    ${issue.path}: ${issue.message}`);
      }
    }
    for (const { index, result } of invalidRequests.slice(0, 5)) {
      const issues = result.ok ? [] : result.issues;
      console.error(`  request[${index}]: ${issues.map((i) => `${i.path} ${i.message}`).join("; ")}`);
    }
    return 1;
  }

  /* Write the datasets. --------------------------------------------------- */
  const files = [
    { name: "mentors.mock.json", content: serialize(mentors), count: mentors.length },
    { name: "requests.mock.json", content: serialize(requests), count: requests.length },
    { name: "adversarial.mock.json", content: serialize(adversarial), count: adversarial.length },
  ];

  mkdirSync(DATA_DIR, { recursive: true });
  for (const file of files) writeFileSync(join(DATA_DIR, file.name), file.content, "utf8");

  const mentorDistribution = summarizeMentors(mentors);
  const requestDistribution = summarizeRequests(requests);
  const adversarialDistribution = summarizeAdversarial(adversarial);

  /**
   * The manifest carries no timestamp on purpose: reproducibility is the whole
   * claim of this phase, and a clock would make every regeneration differ.
   */
  const manifest = {
    generatorVersion: GENERATOR_VERSION,
    engineVersion: ENGINE_VERSION,
    schemaVersion: SCHEMA_VERSION,
    ontologyVersion: ONTOLOGY_VERSION,
    seed: options.seed,
    seedDerivation: {
      mentors: options.seed,
      requests: options.seed + 1,
      adversarial: options.seed + 2,
    },
    note: "Deterministic output. No timestamp is recorded so regeneration is byte-identical.",
    files: files.map((file) => ({
      name: file.name,
      records: file.count,
      bytes: Buffer.byteLength(file.content, "utf8"),
      sha256: sha256(file.content),
    })),
    distribution: {
      mentors: mentorDistribution,
      requests: requestDistribution,
      adversarial: adversarialDistribution,
    },
  };

  writeFileSync(join(DATA_DIR, "manifest.json"), serialize(manifest), "utf8");

  /* Print the summary. ---------------------------------------------------- */
  console.log(`Generated with seed ${options.seed} (generator ${GENERATOR_VERSION})\n`);
  console.log(`Mentors: ${mentorDistribution.count}`);
  console.log(`  verified: ${mentorDistribution.verified} | unverified: ${mentorDistribution.unverified}`);
  console.log(`  IELTS: ${mentorDistribution.withIelts} | SAT: ${mentorDistribution.withSat} | HSK: ${mentorDistribution.withHsk} | multi-domain: ${mentorDistribution.multiDomain}`);
  console.log(`  incomplete profiles: ${mentorDistribution.incompleteProfiles} | no rating: ${mentorDistribution.withoutRating} | no availability: ${mentorDistribution.withoutAvailability}`);
  console.log(`  price VND/h: min ${mentorDistribution.price.min} | median ${mentorDistribution.price.median} | max ${mentorDistribution.price.max}`);
  console.log(`  domain mix: ${JSON.stringify(mentorDistribution.byDomainCombination)}`);
  console.log(`  IELTS overall: ${JSON.stringify(mentorDistribution.ieltsOverall)}\n`);

  console.log(`Requests: ${requestDistribution.count}`);
  console.log(`  by domain: ${JSON.stringify(requestDistribution.byDomain)}`);
  console.log(`  with budget: ${requestDistribution.withBudget} | verifiedOnly: ${requestDistribution.verifiedOnly} | min credential: ${requestDistribution.withMinCredential}`);
  console.log(`  with focus skills: ${requestDistribution.withFocusSkills} | with free text: ${requestDistribution.withFreeText}\n`);

  console.log(`Adversarial: ${adversarialDistribution.count} across ${adversarialDistribution.labels} labels`);
  console.log(`  deliberately invalid payloads: ${adversarialDistribution.deliberatelyInvalid}`);
  console.log(`  by label: ${JSON.stringify(adversarialDistribution.byLabel)}\n`);

  console.log("All normal records passed schema validation.");
  return 0;
}

/* Run when invoked directly. */
if (process.argv[1] !== undefined && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "")) {
  const args = parseArgs(process.argv.slice(2));
  process.exitCode = main({
    seed: args.seed ?? DEFAULT_DATASET.seed,
    mentors: args.mentors ?? DEFAULT_DATASET.mentors,
    requests: args.requests ?? DEFAULT_DATASET.requests,
    adversarial: args.adversarial ?? DEFAULT_DATASET.adversarial,
  });
}
