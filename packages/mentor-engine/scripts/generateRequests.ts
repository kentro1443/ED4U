/**
 * Reproducible student-request generator, plus the labelled adversarial set.
 *
 * Two very different things live here on purpose:
 *
 * - `generateRequests()` produces *normal* traffic — every record must pass
 *   `StudentRequestSchema`. These exercise the happy path at volume.
 * - `generateAdversarialCases()` produces *hostile* fixtures — infeasible
 *   constraints, unknown skills, duplicate ids, corrupted records. Each one is
 *   explicitly labelled with what it attacks and what the engine must do, so a
 *   failing case names its own bug instead of just going red.
 *
 * Adversarial fixtures are never mixed into the normal set: a benchmark that
 * silently includes them would report a meaningless validity rate.
 *
 * Usage:
 * ```bash
 * npx tsx scripts/generateRequests.ts --seed 42 --count 1000
 * ```
 */

import { SeededRandom, roundToStep } from "./random.js";
import type { StudentRequest } from "../src/index.js";
import { SKILLS, TEACHING_STYLES } from "../src/index.js";

/** Version of the request-generation logic. */
export const REQUEST_GENERATOR_VERSION = "mock-generator-v1.1.0";

/** Options accepted by the request generators. */
export interface GenerateRequestsOptions {
  /** Integer seed; the same seed always yields the same dataset. */
  seed: number;
  /** How many records to generate. */
  count: number;
}

/** Score scales, used to keep goals valid for their domain. */
const DOMAIN_SCALES = {
  IELTS: { current: [4.5, 5, 5.5, 6, 6.5, 7], target: [6, 6.5, 7, 7.5, 8, 8.5] },
  SAT: { current: [900, 1000, 1100, 1200, 1300], target: [1200, 1300, 1400, 1450, 1500, 1550] },
  HSK: { current: [1, 2, 3, 4], target: [3, 4, 5, 6] },
} as const;

/** Slots students typically ask for: after school and at weekends. */
const STUDENT_SLOTS: readonly string[] = [
  "MON_19_00", "MON_20_00", "TUE_19_00", "TUE_19_30", "TUE_20_00",
  "WED_19_00", "WED_20_00", "THU_19_00", "THU_19_30", "THU_20_00",
  "FRI_19_00", "FRI_20_00", "SAT_09_00", "SAT_10_00", "SAT_14_00",
  "SUN_09_00", "SUN_09_30", "SUN_15_00", "SUN_20_00",
];

/**
 * Free-text wishes with no canonical feature.
 *
 * These exist so the normal dataset exercises the "unknown input is preserved"
 * path at volume, not only in hand-written tests.
 */
const FREE_TEXT_PREFERENCES: readonly string[] = [
  "muốn mentor nói chuyện chill",
  "mentor vui tính, hay kể chuyện",
  "cần người nhắc bài thường xuyên",
  "thích học qua ví dụ thực tế",
  "mong mentor từng du học",
  "muốn được chữa bài chi tiết",
];

/* -------------------------------------------------------------------------- */
/* Normal requests                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Generates one canonical student request.
 *
 * Every value is drawn from the canonical vocabularies and each domain's own
 * scale, so the record validates by construction rather than by retrying.
 *
 * @param rng - Seeded source.
 * @param index - Zero-based index, used for the request id.
 */
function generateRequest(rng: SeededRandom, index: number): StudentRequest {
  const requestId = `R${String(index + 1).padStart(5, "0")}`;

  // Domain mix mirrors demand, which is not the same as mentor supply.
  const domain = rng.weighted([["IELTS", 0.6], ["SAT", 0.25], ["HSK", 0.15]] as const);
  const scale = DOMAIN_SCALES[domain];

  const currentScore = rng.pick(scale.current);
  // A target must beat the current score; pick from the valid remainder.
  const reachableTargets = scale.target.filter((value) => value > currentScore);
  const targetScore =
    reachableTargets.length > 0 ? rng.pick(reachableTargets) : undefined;

  const domainSkills = SKILLS.filter((skill) => skill.startsWith(`${domain}.`));
  const focusSkills = rng
    .sample(domainSkills, rng.weighted([[0, 0.15], [1, 0.55], [2, 0.3]]))
    .sort();

  const goal: Record<string, unknown> = { domain, focusSkills };
  if (rng.bool(0.85)) goal.currentScore = currentScore;
  if (targetScore !== undefined && rng.bool(0.9)) goal.targetScore = targetScore;

  const hardConstraints: Record<string, unknown> = {
    verifiedOnly: rng.bool(0.45),
    requiredExpertise: rng.bool(0.15) ? rng.sample(domainSkills, 1).sort() : [],
    requireAllAvailability: rng.bool(0.2),
  };
  if (rng.bool(0.7)) {
    hardConstraints.maxPricePerHour = roundToStep(rng.int(120_000, 500_000), 10_000);
  }
  if (rng.bool(0.25)) {
    hardConstraints.minCredentialScore = rng.pick(
      domain === "IELTS" ? [6.5, 7, 7.5, 8] : domain === "SAT" ? [1300, 1400, 1450] : [4, 5, 6],
    );
  }

  const softPreferences: Record<string, unknown> = {
    teachingStyles: rng.sample([...TEACHING_STYLES], rng.weighted([[0, 0.3], [1, 0.45], [2, 0.25]])).sort(),
    languages: rng.bool(0.2) ? ["VI"] : [],
  };
  if (rng.bool(0.08)) softPreferences.gender = rng.pick(["female", "male"]);

  return {
    requestId,
    goal,
    hardConstraints,
    availability: rng.sample(STUDENT_SLOTS, rng.weighted([[1, 0.2], [2, 0.35], [3, 0.3], [4, 0.15]])).sort(),
    softPreferences,
    additionalPreferences: rng.bool(0.2) ? [rng.pick(FREE_TEXT_PREFERENCES)] : [],
  } as unknown as StudentRequest;
}

/**
 * Generates a reproducible set of normal student requests.
 *
 * @param options - Seed and count.
 */
export function generateRequests({ seed, count }: GenerateRequestsOptions): StudentRequest[] {
  const rng = new SeededRandom(seed);
  return Array.from({ length: count }, (_, index) => generateRequest(rng, index));
}

/* -------------------------------------------------------------------------- */
/* Adversarial cases                                                          */
/* -------------------------------------------------------------------------- */

/** The hostile situations the V1 engine must survive. */
export const ADVERSARIAL_LABELS = [
  "NO_MENTOR_WITHIN_BUDGET",
  "NO_COMPATIBLE_AVAILABILITY",
  "ALL_CANDIDATES_UNVERIFIED",
  "UNKNOWN_SKILL",
  "MISSING_CREDENTIAL",
  "EMPTY_PREFERENCE_SET",
  "IMPOSSIBLE_HARD_CONSTRAINTS",
  "RARE_DOMAIN_COMBINATION",
  "DUPLICATE_MENTOR_IDS",
  "CORRUPTED_RECORD",
] as const;

/** A hostile situation the engine must handle explicitly. */
export type AdversarialLabel = (typeof ADVERSARIAL_LABELS)[number];

/** One labelled adversarial fixture. */
export interface AdversarialCase {
  id: string;
  /** What this case attacks. */
  label: AdversarialLabel;
  /** Whether the payload targets the request, the mentor dataset, or one record. */
  target: "REQUEST" | "MENTOR_DATASET";
  /** Human-readable description of the scenario. */
  description: string;
  /** What the engine must do. Prose for now; Phase 4+ turn these into assertions. */
  expectedBehavior: string;
  /**
   * Whether the payload is expected to pass canonical schema validation.
   * `false` means the fixture is *deliberately* invalid — that is the point of
   * the case, not a defect in the generator.
   */
  expectsSchemaValid: boolean;
  /** Raw request payload, for `target: "REQUEST"` cases. */
  request?: unknown;
  /** Raw mentor payloads, for `target: "MENTOR_DATASET"` cases. */
  mentors?: unknown[];
}

/** A minimal valid mentor, used as the base for dataset-level fixtures. */
function baseMentor(rng: SeededRandom, id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    name: `Adversarial Mentor ${id}`,
    birthYear: rng.int(1990, 2004),
    verified: true,
    credentials: { ielts: { overall: 7.5 }, sat: null, hsk: null },
    expertise: ["IELTS.WRITING"],
    availability: ["TUE_19_00"],
    pricePerHour: 250_000,
    ...overrides,
  };
}

/** A minimal valid request, used as the base for request-level fixtures. */
function baseRequest(id: string, overrides: Record<string, unknown> = {}) {
  return {
    requestId: id,
    goal: { domain: "IELTS", focusSkills: ["IELTS.WRITING"] },
    hardConstraints: { verifiedOnly: false, requiredExpertise: [], requireAllAvailability: false },
    availability: ["TUE_19_00"],
    softPreferences: { teachingStyles: [], languages: [] },
    additionalPreferences: [],
    ...overrides,
  };
}

/** Builds one adversarial case for a given label and variant index. */
function buildCase(
  rng: SeededRandom,
  label: AdversarialLabel,
  id: string,
  variant: number,
): AdversarialCase {
  switch (label) {
    case "NO_MENTOR_WITHIN_BUDGET":
      return {
        id, label, target: "REQUEST", expectsSchemaValid: true,
        description: `Budget of ${1_000 + variant * 500} VND/hour is far below any real mentor price.`,
        expectedBehavior: "Every mentor is filtered out on PRICE; the engine returns NO_FEASIBLE_MATCH rather than relaxing the budget.",
        request: baseRequest(id, {
          hardConstraints: {
            verifiedOnly: false,
            maxPricePerHour: 1_000 + variant * 500,
            requiredExpertise: [],
            requireAllAvailability: false,
          },
        }),
      };

    case "NO_COMPATIBLE_AVAILABILITY":
      return {
        id, label, target: "REQUEST", expectsSchemaValid: true,
        description: "Student is only free in the small hours, when no mentor teaches.",
        expectedBehavior: "Every mentor is filtered out on AVAILABILITY; no mentor is recommended on the strength of other features.",
        request: baseRequest(id, {
          availability: [`MON_0${(variant % 5) + 1}_00`, `TUE_0${(variant % 4) + 1}_30`],
        }),
      };

    case "ALL_CANDIDATES_UNVERIFIED":
      return {
        id, label, target: "MENTOR_DATASET", expectsSchemaValid: true,
        description: "Every candidate is unverified while the request demands verifiedOnly.",
        expectedBehavior: "All mentors are filtered out on UNVERIFIED; the diagnostics report the count.",
        request: baseRequest(id, {
          hardConstraints: { verifiedOnly: true, requiredExpertise: [], requireAllAvailability: false },
        }),
        mentors: Array.from({ length: 3 + (variant % 3) }, (_, i) =>
          baseMentor(rng, `${id}-M${i + 1}`, { verified: false }),
        ),
      };

    case "UNKNOWN_SKILL":
      return {
        id, label, target: "REQUEST", expectsSchemaValid: false,
        description: "Focus skill the ontology has never heard of.",
        expectedBehavior: "Schema rejects the canonical form; the resolver reports UNKNOWN_SKILL and preserves the raw text.",
        request: baseRequest(id, {
          goal: {
            domain: "IELTS",
            focusSkills: [["IELTS.GRAMMAR", "IELTS.PRONUNCIATION", "IELTS.VOCABULARY"][variant % 3]],
          },
        }),
      };

    case "MISSING_CREDENTIAL":
      return {
        id, label, target: "MENTOR_DATASET", expectsSchemaValid: true,
        description: "Mentors claim IELTS expertise but their IELTS credential is UNKNOWN (key omitted).",
        expectedBehavior: "Missing credentials are reported as missing data; they must never be scored as zero, nor praised in explanations.",
        mentors: Array.from({ length: 2 + (variant % 3) }, (_, i) =>
          baseMentor(rng, `${id}-M${i + 1}`, { credentials: {} }),
        ),
        request: baseRequest(id, {
          hardConstraints: {
            verifiedOnly: false,
            minCredentialScore: 7,
            requiredExpertise: [],
            requireAllAvailability: false,
          },
        }),
      };

    case "EMPTY_PREFERENCE_SET":
      return {
        id, label, target: "REQUEST", expectsSchemaValid: true,
        description: "Student states a domain and nothing else.",
        expectedBehavior: "The engine ranks on what little it has and reports low data coverage; it must not invent preferences.",
        request: {
          requestId: id,
          goal: { domain: (["IELTS", "SAT", "HSK"] as const)[variant % 3] },
        },
      };

    case "IMPOSSIBLE_HARD_CONSTRAINTS":
      return {
        id, label, target: "REQUEST", expectsSchemaValid: true,
        description: "Top credential, lowest price, verified only, and every slot required at once.",
        expectedBehavior: "Returns NO_FEASIBLE_MATCH with per-constraint filter counts; no constraint is relaxed to produce results.",
        request: baseRequest(id, {
          hardConstraints: {
            verifiedOnly: true,
            maxPricePerHour: 50_000 + variant * 1_000,
            minCredentialScore: 9,
            requiredExpertise: ["IELTS.WRITING", "IELTS.SPEAKING"],
            requireAllAvailability: true,
          },
          availability: ["MON_19_00", "TUE_19_00", "WED_19_00", "THU_19_00", "FRI_19_00", "SAT_09_00"],
        }),
      };

    case "RARE_DOMAIN_COMBINATION":
      return {
        id, label, target: "MENTOR_DATASET", expectsSchemaValid: true,
        description: "HSK writing request against a candidate pool that is almost entirely IELTS.",
        expectedBehavior: "Domain filtering leaves few or no candidates; the engine reports the shortage instead of substituting another domain.",
        request: baseRequest(id, {
          goal: { domain: "HSK", focusSkills: ["HSK.WRITING"] },
          hardConstraints: {
            verifiedOnly: false,
            requiredExpertise: ["HSK.WRITING"],
            requireAllAvailability: false,
          },
        }),
        mentors: [
          ...Array.from({ length: 4 }, (_, i) => baseMentor(rng, `${id}-M${i + 1}`)),
          baseMentor(rng, `${id}-M5`, {
            credentials: { ielts: null, sat: null, hsk: { level: 4 + (variant % 3) } },
            expertise: ["HSK.READING"],
          }),
        ],
      };

    case "DUPLICATE_MENTOR_IDS":
      return {
        id, label, target: "MENTOR_DATASET", expectsSchemaValid: false,
        description: "The same mentor id appears twice in one candidate set.",
        expectedBehavior: "validateMentors rejects the dataset; a duplicate must never yield duplicate recommendations.",
        mentors: [
          baseMentor(rng, `${id}-DUP`),
          baseMentor(rng, `${id}-M2`),
          baseMentor(rng, `${id}-DUP`, { pricePerHour: 300_000 + variant * 1_000 }),
        ],
      };

    case "CORRUPTED_RECORD":
      return {
        id, label, target: "MENTOR_DATASET", expectsSchemaValid: false,
        description: "A mentor record with corrupted field types and out-of-range values.",
        expectedBehavior: "Validation fails with precise field paths; no partially-parsed mentor reaches the ranker.",
        mentors: [
          baseMentor(rng, `${id}-M1`),
          {
            ...baseMentor(rng, `${id}-BAD`),
            ...[
              { pricePerHour: "rẻ" },
              { credentials: { ielts: { overall: 9.5 } } },
              { birthYear: 1200 },
              { expertise: [] },
              { availability: ["Tuesday evening"] },
            ][variant % 5],
          },
        ],
      };
  }
}

/**
 * Generates the labelled adversarial fixture set.
 *
 * Cases are spread evenly across {@link ADVERSARIAL_LABELS} so no hostile
 * situation is under-represented.
 *
 * @param options - Seed and total count (rounded up to cover every label).
 */
export function generateAdversarialCases({
  seed,
  count,
}: GenerateRequestsOptions): AdversarialCase[] {
  const rng = new SeededRandom(seed);
  const perLabel = Math.ceil(count / ADVERSARIAL_LABELS.length);
  const cases: AdversarialCase[] = [];

  for (const label of ADVERSARIAL_LABELS) {
    for (let variant = 0; variant < perLabel; variant++) {
      const id = `ADV-${String(cases.length + 1).padStart(3, "0")}`;
      cases.push(buildCase(rng, label, id, variant));
    }
  }

  return cases;
}

/* -------------------------------------------------------------------------- */
/* Distribution summary                                                       */
/* -------------------------------------------------------------------------- */

/** Aggregate shape of a generated request dataset. */
export interface RequestDistribution {
  count: number;
  byDomain: Record<string, number>;
  withCurrentScore: number;
  withTargetScore: number;
  withFocusSkills: number;
  verifiedOnly: number;
  withBudget: number;
  withMinCredential: number;
  withRequiredExpertise: number;
  withFreeText: number;
  availabilitySlots: { min: number; max: number };
}

/**
 * Summarises a request dataset so a human can sanity-check the mix.
 *
 * @param requests - Generated requests.
 */
export function summarizeRequests(requests: readonly StudentRequest[]): RequestDistribution {
  const byDomain: Record<string, number> = {};
  let withCurrentScore = 0;
  let withTargetScore = 0;
  let withFocusSkills = 0;
  let verifiedOnly = 0;
  let withBudget = 0;
  let withMinCredential = 0;
  let withRequiredExpertise = 0;
  let withFreeText = 0;
  let minSlots = Number.POSITIVE_INFINITY;
  let maxSlots = 0;

  for (const request of requests) {
    byDomain[request.goal.domain] = (byDomain[request.goal.domain] ?? 0) + 1;
    if (request.goal.currentScore !== undefined) withCurrentScore++;
    if (request.goal.targetScore !== undefined) withTargetScore++;
    if (request.goal.focusSkills.length > 0) withFocusSkills++;
    if (request.hardConstraints.verifiedOnly) verifiedOnly++;
    if (request.hardConstraints.maxPricePerHour !== undefined) withBudget++;
    if (request.hardConstraints.minCredentialScore !== undefined) withMinCredential++;
    if (request.hardConstraints.requiredExpertise.length > 0) withRequiredExpertise++;
    if (request.additionalPreferences.length > 0) withFreeText++;
    minSlots = Math.min(minSlots, request.availability.length);
    maxSlots = Math.max(maxSlots, request.availability.length);
  }

  return {
    count: requests.length,
    byDomain: Object.fromEntries(Object.entries(byDomain).sort()),
    withCurrentScore,
    withTargetScore,
    withFocusSkills,
    verifiedOnly,
    withBudget,
    withMinCredential,
    withRequiredExpertise,
    withFreeText,
    availabilitySlots: {
      min: Number.isFinite(minSlots) ? minSlots : 0,
      max: maxSlots,
    },
  };
}
