/**
 * Phase 5 — baseline ranker.
 *
 * The property tests named in PLAN.md are the heart of this file:
 *
 * - a better *relevant* score must never reduce the relevant feature;
 * - a better *irrelevant* score must never improve the total;
 * - the same inputs and config must produce the same ranking.
 *
 * Plus the structural guarantees: scores stay in range, weights normalise,
 * missing data is redistributed rather than invented, ties break by an explicit
 * total order, and no eligibility logic leaks into the ranker.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  FEATURE_NAMES,
  applyHardConstraints,
  rankMentors,
  rankingConfig,
  requestAwareWeights,
  validateMentors,
  validateRankingConfig,
  validateStudentRequest,
} from "../src/index.js";
import type { Mentor, RankingConfig, StudentRequest } from "../src/index.js";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

/** Reads a committed dataset file. */
function readData<T>(name: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, name), "utf8")) as T;
}

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

/** Score of a single mentor under a request. */
function scoreOf(request: StudentRequest, mentor: Mentor): number {
  return rankMentors(request, [mentor])[0]?.matchScore as number;
}

/* -------------------------------------------------------------------------- */
/* Property tests from PLAN.md                                                */
/* -------------------------------------------------------------------------- */

describe("property: a better relevant score never hurts", () => {
  const request = makeRequest({ goal: { domain: "IELTS", focusSkills: ["IELTS.WRITING"] } });

  /** Builds a mentor whose IELTS sections are consistent with the overall. */
  function withWriting(writing: number): Mentor {
    const sections = { listening: 7.5, reading: 7.5, writing, speaking: 7.5 };
    const overall = Math.round(((sections.listening + sections.reading + writing + sections.speaking) * 2) / 4) / 2;
    return makeMentor("M1", {
      credentials: { ielts: { overall, ...sections }, sat: null, hsk: null },
    });
  }

  it("never reduces the score as the requested Writing band rises", () => {
    let previous = -Infinity;
    for (const writing of [5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9]) {
      const score = scoreOf(request, withWriting(writing));
      expect(score, `writing ${writing}`).toBeGreaterThanOrEqual(previous);
      previous = score;
    }
  });

  it("strictly prefers the stronger writer, all else equal", () => {
    expect(scoreOf(request, withWriting(8.5))).toBeGreaterThan(scoreOf(request, withWriting(6)));
  });
});

describe("regression: unmeasured must not beat measured", () => {
  const request = makeRequest({ goal: { domain: "IELTS", focusSkills: ["IELTS.WRITING"] } });

  /** Identical mentors apart from their published IELTS detail. */
  function pair(writing: number) {
    const sections = { listening: 7.5, reading: 7.5, writing, speaking: 7.5 };
    const overall =
      Math.round(((sections.listening + sections.reading + writing + sections.speaking) * 2) / 4) / 2;

    return {
      // Publishes only an overall band: we know they teach Writing, not how well.
      unmeasured: makeMentor("UNMEASURED", {
        credentials: { ielts: { overall }, sat: null, hsk: null },
      }),
      // Publishes every band, including a real, non-perfect Writing score.
      measured: makeMentor("MEASURED", {
        credentials: { ielts: { overall, ...sections }, sat: null, hsk: null },
      }),
    };
  }

  it("does not rank an overall-only mentor above one with a real Writing band", () => {
    for (const writing of [6, 6.5, 7, 7.5, 8, 8.5]) {
      const { unmeasured, measured } = pair(writing);
      const ranked = rankMentors(request, [unmeasured, measured]);
      expect(ranked[0]?.mentorId, `writing ${writing}`).toBe("MEASURED");
    }
  });

  it("scores the unmeasured mentor strictly lower on the focus feature", () => {
    const { unmeasured, measured } = pair(7);
    const scoreFor = (mentor: Mentor) =>
      rankMentors(request, [mentor])[0]?.scoreBreakdown.focusSkillStrength as number;

    expect(scoreFor(unmeasured)).toBeLessThan(scoreFor(measured));
    // ...and not zero either: teaching the skill is genuine, observed evidence.
    expect(scoreFor(unmeasured)).toBeGreaterThan(0);
    expect(scoreFor(unmeasured)).toBeLessThan(1);
  });

  it("does not report full coverage when the section band is missing", () => {
    const { unmeasured, measured } = pair(7);
    const coverageFor = (mentor: Mentor) =>
      rankMentors(request, [mentor])[0]?.dataCoverage as number;

    expect(coverageFor(measured)).toBe(1);
    expect(coverageFor(unmeasured)).toBeLessThan(1);
    expect(coverageFor(unmeasured)).toBeGreaterThan(0);
  });

  it("still credits teaching evidence over not teaching the skill at all", () => {
    const teaches = makeMentor("TEACHES", { expertise: ["IELTS.WRITING"] });
    const doesNot = makeMentor("DOES-NOT", { expertise: ["IELTS.READING"] });
    expect(rankMentors(request, [doesNot, teaches])[0]?.mentorId).toBe("TEACHES");
  });
});

describe("property: an irrelevant score never helps", () => {
  const ieltsRequest = makeRequest({ goal: { domain: "IELTS", focusSkills: ["IELTS.WRITING"] } });

  const base = {
    credentials: { ielts: { overall: 7.5 }, sat: { total: 1200 }, hsk: null },
    expertise: ["IELTS.WRITING", "SAT.MATH"],
  };
  const betterSat = {
    credentials: { ielts: { overall: 7.5 }, sat: { total: 1600, math: 800, readingWriting: 800 }, hsk: null },
    expertise: ["IELTS.WRITING", "SAT.MATH"],
  };

  it("a higher SAT score does not improve an IELTS request", () => {
    expect(scoreOf(ieltsRequest, makeMentor("M1", betterSat))).toBe(
      scoreOf(ieltsRequest, makeMentor("M1", base)),
    );
  });

  it("an added HSK credential does not improve an IELTS request", () => {
    const withHsk = makeMentor("M1", {
      credentials: { ielts: { overall: 7.5 }, sat: null, hsk: { level: 6 } },
      expertise: ["IELTS.WRITING", "HSK.READING"],
    });
    const without = makeMentor("M1", {
      credentials: { ielts: { overall: 7.5 }, sat: null, hsk: null },
      expertise: ["IELTS.WRITING"],
    });
    expect(scoreOf(ieltsRequest, withHsk)).toBe(scoreOf(ieltsRequest, without));
  });

  it("a stronger Speaking band does not improve a Writing-focused request", () => {
    const sections = { listening: 7.5, reading: 7.5, writing: 7.5 };
    const quietSpeaker = makeMentor("M1", {
      credentials: { ielts: { overall: 7.5, ...sections, speaking: 7.5 }, sat: null, hsk: null },
    });
    const loudSpeaker = makeMentor("M1", {
      credentials: { ielts: { overall: 8, ...sections, speaking: 9 }, sat: null, hsk: null },
    });
    const { scoreBreakdown: quiet } = rankMentors(ieltsRequest, [quietSpeaker])[0] as {
      scoreBreakdown: Record<string, number>;
    };
    const { scoreBreakdown: loud } = rankMentors(ieltsRequest, [loudSpeaker])[0] as {
      scoreBreakdown: Record<string, number>;
    };
    expect(loud.focusSkillStrength).toBe(quiet.focusSkillStrength);
  });
});

describe("property: determinism", () => {
  const mentors = readData<Mentor[]>("mentors.mock.json");
  const requests = readData<StudentRequest[]>("requests.mock.json");

  it("returns byte-identical rankings for the same inputs and config", () => {
    for (const request of requests.slice(0, 25)) {
      const { eligible } = applyHardConstraints(request, mentors);
      const first = rankMentors(request, eligible);
      const second = rankMentors(request, eligible);
      expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    }
  });

  it("is independent of the order mentors arrive in", () => {
    const request = requests[0] as StudentRequest;
    const { eligible } = applyHardConstraints(request, mentors);
    expect(eligible.length).toBeGreaterThan(5);

    const forward = rankMentors(request, eligible).map((r) => r.mentorId);
    const reversed = rankMentors(request, [...eligible].reverse()).map((r) => r.mentorId);
    expect(reversed).toEqual(forward);
  });

  it("does not mutate its inputs", () => {
    const request = requests[0] as StudentRequest;
    const { eligible } = applyHardConstraints(request, mentors);
    const before = JSON.stringify({ request, eligible });
    rankMentors(request, eligible);
    expect(JSON.stringify({ request, eligible })).toBe(before);
  });
});

/* -------------------------------------------------------------------------- */
/* Weights                                                                    */
/* -------------------------------------------------------------------------- */

describe("request-aware weighting", () => {
  it("raises the focus-skill weight when the student names a focus skill", () => {
    const withFocus = requestAwareWeights(
      makeRequest({ goal: { domain: "IELTS", focusSkills: ["IELTS.WRITING"] } }),
    );
    const withoutFocus = requestAwareWeights(
      makeRequest({ goal: { domain: "IELTS", focusSkills: [] } }),
    );
    expect(withFocus.focusSkillStrength).toBeGreaterThan(withoutFocus.focusSkillStrength);
    expect(withFocus.subjectExpertise).toBe(withoutFocus.subjectExpertise);
  });

  it("raises the teaching-style weight when styles are named", () => {
    const withStyles = requestAwareWeights(
      makeRequest({ softPreferences: { teachingStyles: ["PATIENT"], languages: [] } }),
    );
    const without = requestAwareWeights(makeRequest());
    expect(withStyles.teachingStyleFit).toBeGreaterThan(without.teachingStyleFit);
  });

  it("normalises the weights actually applied to sum to 1", () => {
    const mentors = readData<Mentor[]>("mentors.mock.json").slice(0, 60);
    const request = makeRequest();
    for (const ranked of rankMentors(request, mentors)) {
      const total = Object.values(ranked.weights).reduce((sum, w) => sum + w, 0);
      // Weights are rounded to 2dp for reporting, so allow rounding slack.
      expect(total).toBeCloseTo(1, 1);
    }
  });

  it("accepts the shipped configuration", () => {
    expect(() => validateRankingConfig()).not.toThrow();
  });

  it("rejects a malformed weight table instead of scoring with it", () => {
    const negative = {
      ...rankingConfig,
      baseWeights: { ...rankingConfig.baseWeights, rating: -1 },
    };
    expect(() => validateRankingConfig(negative)).toThrow(/baseWeights\.rating/);

    const zeroed = {
      ...rankingConfig,
      baseWeights: Object.fromEntries(FEATURE_NAMES.map((f) => [f, 0])),
    } as unknown as RankingConfig;
    expect(() => validateRankingConfig(zeroed)).toThrow(/positive/);

    const missing = {
      ...rankingConfig,
      baseWeights: { ...rankingConfig.baseWeights, rating: undefined },
    } as unknown as RankingConfig;
    expect(() => validateRankingConfig(missing)).toThrow(/finite number/);

    const unknownFeature = {
      ...rankingConfig,
      baseWeights: { ...rankingConfig.baseWeights, charisma: 0.2 },
    } as unknown as RankingConfig;
    expect(() => validateRankingConfig(unknownFeature)).toThrow(/unknown feature/);
  });

  /**
   * Malformed configuration beyond baseWeights.
   *
   * Each of these used to sail through and produce a plausible-looking but
   * unreproducible score: a negative boost drives a weight negative, a
   * collapsed scale divides by zero, a zero rate flattens a feature for
   * everyone.
   */
  const MALFORMED_CONFIGS: [string, Record<string, unknown>, RegExp][] = [
    ["negative focusSkillBoost", { requestAware: { ...rankingConfig.requestAware, focusSkillBoost: -1 } }, /requestAware\.focusSkillBoost/],
    ["zero focusSkillBoost", { requestAware: { ...rankingConfig.requestAware, focusSkillBoost: 0 } }, /requestAware\.focusSkillBoost/],
    ["non-finite teachingStyleBoost", { requestAware: { ...rankingConfig.requestAware, teachingStyleBoost: Number.POSITIVE_INFINITY } }, /requestAware\.teachingStyleBoost/],
    ["collapsed credential scale", { credentialScale: { ...rankingConfig.credentialScale, IELTS: { floor: 9, ceiling: 9 } } }, /credentialScale\.IELTS/],
    ["inverted credential scale", { credentialScale: { ...rankingConfig.credentialScale, SAT: { floor: 1600, ceiling: 400 } } }, /credentialScale\.SAT/],
    ["missing HSK scale", { credentialScale: { ...rankingConfig.credentialScale, HSK: undefined } }, /credentialScale\.HSK/],
    ["collapsed section scale", { sectionScale: { ...rankingConfig.sectionScale, IELTS: { floor: 5, ceiling: 5 } } }, /sectionScale\.IELTS/],
    ["negative focusSkill sub-weight", { focusSkill: { taughtWeight: -0.4, bandWeight: 0.6 } }, /focusSkill\.taughtWeight/],
    ["zero focusSkill sub-weights", { focusSkill: { taughtWeight: 0, bandWeight: 0 } }, /focusSkill weights/],
    ["negative experience weight", { experience: { ...rankingConfig.experience, sessionsWeight: -1 } }, /experience\.sessionsWeight/],
    ["zero experience weights", { experience: { ...rankingConfig.experience, sessionsWeight: 0, monthsWeight: 0 } }, /experience weights/],
    ["zero experience rate", { experience: { ...rankingConfig.experience, sessionsRate: 0 } }, /experience\.sessionsRate/],
    ["negative months rate", { experience: { ...rankingConfig.experience, monthsRate: -0.1 } }, /experience\.monthsRate/],
    ["inverted rating bounds", { rating: { floor: 5, ceiling: 3 } }, /rating/],
    ["budget floor above 1", { budget: { floorAtMax: 1.5 } }, /budget\.floorAtMax/],
    ["negative budget floor", { budget: { floorAtMax: -0.1 } }, /budget\.floorAtMax/],
    ["non-numeric budget floor", { budget: { floorAtMax: "low" } }, /budget\.floorAtMax/],
  ];

  it.each(MALFORMED_CONFIGS)("rejects %s", (_label, patch, pattern) => {
    const broken = { ...rankingConfig, ...patch };
    expect(() => validateRankingConfig(broken)).toThrow(pattern);
  });

  it("refuses to rank with a malformed config rather than scoring zero", () => {
    const broken = {
      ...rankingConfig,
      requestAware: { ...rankingConfig.requestAware, focusSkillBoost: -1 },
    };
    expect(() => rankMentors(makeRequest(), [makeMentor("M1")], { config: broken })).toThrow(
      /focusSkillBoost/,
    );
  });

  it("honours a caller-supplied config, changing the outcome", () => {
    const withBudget = makeRequest({
      goal: { domain: "IELTS", focusSkills: [] },
      availability: [],
      hardConstraints: {
        verifiedOnly: false,
        maxPricePerHour: 500_000,
        requiredExpertise: [],
        requireAllAvailability: false,
      },
    });

    // CHEAP is only cheap; DEAR is better on every other axis. The two configs
    // must therefore disagree about who wins.
    const cheap = makeMentor("CHEAP", {
      pricePerHour: 50_000,
      rating: 3,
      sessionsCompleted: 5,
      teachingExperienceMonths: 3,
      credentials: { ielts: { overall: 6 }, sat: null, hsk: null },
    });
    const dear = makeMentor("DEAR", {
      pricePerHour: 480_000,
      rating: 5,
      sessionsCompleted: 400,
      teachingExperienceMonths: 90,
      credentials: { ielts: { overall: 9 }, sat: null, hsk: null },
    });

    const budgetHeavy = {
      ...rankingConfig,
      baseWeights: {
        subjectExpertise: 0.05,
        focusSkillStrength: 0.05,
        availabilityFit: 0.05,
        budgetFit: 0.75,
        experience: 0.05,
        rating: 0.03,
        teachingStyleFit: 0.02,
      },
    };

    expect(rankMentors(withBudget, [cheap, dear]).map((r) => r.mentorId)).toEqual([
      "DEAR",
      "CHEAP",
    ]);
    expect(
      rankMentors(withBudget, [cheap, dear], { config: budgetHeavy }).map((r) => r.mentorId),
    ).toEqual(["CHEAP", "DEAR"]);
  });
});

/* -------------------------------------------------------------------------- */
/* Missing data                                                               */
/* -------------------------------------------------------------------------- */

describe("missing-data policy", () => {
  const request = makeRequest({
    goal: { domain: "IELTS", focusSkills: ["IELTS.WRITING"] },
    softPreferences: { teachingStyles: ["PATIENT"], languages: [] },
  });

  it("omits features with no data from the breakdown rather than zeroing them", () => {
    const unrated = makeMentor("M1", { rating: undefined });
    const [ranked] = rankMentors(request, [unrated]);
    expect(ranked?.scoreBreakdown.rating).toBeUndefined();
    expect(ranked?.weights.rating).toBeUndefined();
  });

  it("redistributes the missing weight, so a gap is not a penalty", () => {
    // Same mentor, one with a rating and one without; the rated one is average.
    const rated = makeMentor("RATED", { rating: 4 });
    const unrated = makeMentor("UNRATED", { rating: undefined });

    const rankedRated = rankMentors(request, [rated])[0];
    const rankedUnrated = rankMentors(request, [unrated])[0];

    // Removing an average-scoring feature must not collapse the score.
    expect(rankedUnrated?.matchScore).toBeGreaterThan(0);
    expect(Math.abs((rankedUnrated?.matchScore ?? 0) - (rankedRated?.matchScore ?? 0))).toBeLessThan(20);
  });

  it("reports lower dataCoverage when evidence is missing", () => {
    // Fully evidenced: every band published, so focusSkillStrength is not
    // merely non-null but completely observed.
    const complete = makeMentor("COMPLETE", {
      credentials: {
        ielts: { overall: 7.5, listening: 7.5, reading: 7.5, writing: 7.5, speaking: 7.5 },
        sat: null,
        hsk: null,
      },
    });
    const sparse = makeMentor("SPARSE", {
      rating: undefined,
      sessionsCompleted: undefined,
      teachingExperienceMonths: undefined,
      teachingStyles: undefined,
      credentials: {},
    });

    const ranked = rankMentors(request, [complete, sparse]);
    const coverageOf = (id: string) => ranked.find((r) => r.mentorId === id)?.dataCoverage as number;

    expect(coverageOf("COMPLETE")).toBe(1);
    expect(coverageOf("SPARSE")).toBeLessThan(1);
    expect(coverageOf("SPARSE")).toBeGreaterThan(0);
  });

  it("does not count inapplicable features against a mentor", () => {
    // No budget stated: budgetFit is inapplicable, not missing.
    const bare = makeRequest({ goal: { domain: "IELTS", focusSkills: [] }, availability: [] });
    const [ranked] = rankMentors(bare, [makeMentor("M1")]);
    expect(ranked?.dataCoverage).toBe(1);
  });

  it("scores 0 with zero coverage when nothing at all is known", () => {
    const blank = makeRequest({ goal: { domain: "IELTS", focusSkills: [] }, availability: [] });
    const unknown = makeMentor("UNKNOWN", {
      credentials: {},
      rating: undefined,
      sessionsCompleted: undefined,
      teachingExperienceMonths: undefined,
      teachingStyles: undefined,
    });
    const [ranked] = rankMentors(blank, [unknown]);
    expect(ranked?.matchScore).toBe(0);
    expect(ranked?.dataCoverage).toBe(0);
    expect(ranked?.scoreBreakdown).toEqual({});
  });
});

/* -------------------------------------------------------------------------- */
/* Ordering                                                                   */
/* -------------------------------------------------------------------------- */

describe("ranking output", () => {
  const mentors = readData<Mentor[]>("mentors.mock.json");
  const request = readData<StudentRequest[]>("requests.mock.json")[0] as StudentRequest;

  it("returns ranks 1..n in descending score order", () => {
    const { eligible } = applyHardConstraints(request, mentors);
    const ranked = rankMentors(request, eligible);

    expect(ranked.map((r) => r.rank)).toEqual(ranked.map((_, i) => i + 1));
    for (let i = 1; i < ranked.length; i++) {
      expect((ranked[i - 1] as { matchScore: number }).matchScore).toBeGreaterThanOrEqual(
        (ranked[i] as { matchScore: number }).matchScore,
      );
    }
  });

  it("is exactly reproducible from the returned breakdown and weights", () => {
    // The audit property: anyone holding the response can recompute the score.
    // Only the final display rounding (2dp) may differ.
    const { eligible } = applyHardConstraints(request, mentors);
    expect(eligible.length).toBeGreaterThan(5);

    for (const ranked of rankMentors(request, eligible)) {
      const recomputed =
        100 *
        Object.entries(ranked.weights).reduce((sum, [feature, weight]) => {
          const value = ranked.scoreBreakdown[feature as keyof typeof ranked.scoreBreakdown];
          expect(value, `${ranked.mentorId}.${feature} has a weight but no value`).toBeDefined();
          return sum + weight * (value as number);
        }, 0);

      expect(Math.abs(recomputed - ranked.matchScore), ranked.mentorId).toBeLessThanOrEqual(0.005);
    }
  });

  it("returns applied weights that sum to exactly 1 at full precision", () => {
    const { eligible } = applyHardConstraints(request, mentors);
    for (const ranked of rankMentors(request, eligible)) {
      const total = Object.values(ranked.weights).reduce((sum, w) => sum + w, 0);
      expect(total, ranked.mentorId).toBeCloseTo(1, 12);
    }
  });

  it("reports breakdown and weights unrounded, so no residue is unaccounted for", () => {
    // A rounded breakdown would leave up to half a point of unexplainable
    // difference; assert at least one value carries more than 2 decimals.
    const { eligible } = applyHardConstraints(request, mentors);
    const numbers = rankMentors(request, eligible).flatMap((r) => [
      ...Object.values(r.scoreBreakdown),
      ...Object.values(r.weights),
    ]);
    expect(numbers.some((n) => Math.abs(n * 100 - Math.round(n * 100)) > 1e-9)).toBe(true);
  });

  it("keeps every score inside [0, 100]", () => {
    for (const ranked of rankMentors(request, mentors)) {
      expect(ranked.matchScore).toBeGreaterThanOrEqual(0);
      expect(ranked.matchScore).toBeLessThanOrEqual(100);
      expect(Number.isFinite(ranked.matchScore)).toBe(true);
    }
  });

  it("never emits a mentor twice", () => {
    const ids = rankMentors(request, mentors).map((r) => r.mentorId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("truncates to topK without changing the order", () => {
    const { eligible } = applyHardConstraints(request, mentors);
    const all = rankMentors(request, eligible);
    const top3 = rankMentors(request, eligible, { topK: 3 });

    expect(top3).toHaveLength(Math.min(3, all.length));
    expect(top3).toEqual(all.slice(0, top3.length));
    expect(rankMentors(request, eligible, { topK: 0 })).toEqual([]);
  });

  it("breaks ties by the documented total order, not by input order", () => {
    // Identical mentors except id: the tie-break must fall through to mentorId.
    const twins = ["M-C", "M-A", "M-B"].map((id) => makeMentor(id));
    const ranked = rankMentors(makeRequest(), twins);

    expect(ranked.map((r) => r.matchScore)).toEqual([
      ranked[0]?.matchScore,
      ranked[0]?.matchScore,
      ranked[0]?.matchScore,
    ]);
    expect(ranked.map((r) => r.mentorId)).toEqual(["M-A", "M-B", "M-C"]);
  });

  it("prefers the better-evidenced mentor when scores genuinely tie", () => {
    // Constructing a real tie with unequal coverage: Z-SPARSE has no rating, so
    // its score is the weighted mean of the remaining features. Give Y-EVIDENCED
    // a rating whose feature value equals exactly that mean, and both land on
    // the same score — but only one of them is fully evidenced.
    const bare = makeRequest({ goal: { domain: "IELTS", focusSkills: [] }, availability: [] });

    const shared = {
      credentials: { ielts: { overall: 7.5 }, sat: null, hsk: null },
      sessionsCompleted: 30,
      teachingExperienceMonths: 18,
      pricePerHour: 200_000,
    };

    const sparse = makeMentor("Z-SPARSE", { ...shared, rating: undefined });
    const sparseScore = rankMentors(bare, [sparse])[0]?.matchScore as number;

    // rating feature value = (rating - floor) / (ceiling - floor); solve for the
    // rating that reproduces the sparse mentor's own score.
    const { floor, ceiling } = rankingConfig.rating;
    const evidenced = makeMentor("Y-EVIDENCED", {
      ...shared,
      rating: floor + (sparseScore / 100) * (ceiling - floor),
    });

    const ranked = rankMentors(bare, [sparse, evidenced]);

    // A real tie on the primary key...
    expect(ranked[0]?.matchScore).toBe(ranked[1]?.matchScore);
    // ...broken by coverage, not by id (Y sorts before Z, so id would agree —
    // check the coverages actually differ, which is what makes this a test).
    expect(ranked[0]?.dataCoverage).toBeGreaterThan(ranked[1]?.dataCoverage as number);
    expect(ranked.map((r) => r.mentorId)).toEqual(["Y-EVIDENCED", "Z-SPARSE"]);

    // And the same tie resolves the same way with the ids swapped, proving the
    // coverage key outranks the id key rather than merely agreeing with it.
    const flippedSparse = makeMentor("A-SPARSE", { ...shared, rating: undefined });
    const flippedScore = rankMentors(bare, [flippedSparse])[0]?.matchScore as number;
    const flippedEvidenced = makeMentor("B-EVIDENCED", {
      ...shared,
      rating: floor + (flippedScore / 100) * (ceiling - floor),
    });
    const flipped = rankMentors(bare, [flippedSparse, flippedEvidenced]);

    expect(flipped[0]?.matchScore).toBe(flipped[1]?.matchScore);
    expect(flipped.map((r) => r.mentorId)).toEqual(["B-EVIDENCED", "A-SPARSE"]);
  });

  it("prefers the cheaper mentor when everything else ties", () => {
    const bare = makeRequest({ goal: { domain: "IELTS", focusSkills: [] }, availability: [] });
    const cheap = makeMentor("Z-CHEAP", { pricePerHour: 100_000 });
    const dear = makeMentor("A-DEAR", { pricePerHour: 300_000 });
    // No budget stated, so price affects nothing but the tie-break; the cheaper
    // mentor wins despite sorting later by id.
    expect(rankMentors(bare, [dear, cheap]).map((r) => r.mentorId)).toEqual(["Z-CHEAP", "A-DEAR"]);
  });
});

describe("separation from eligibility", () => {
  const mentors = readData<Mentor[]>("mentors.mock.json");

  it("ranks every mentor it is handed and removes nobody", () => {
    const request = makeRequest();
    expect(rankMentors(request, mentors)).toHaveLength(mentors.length);
  });

  it("ranks a mentor who would fail a hard constraint, rather than filtering them", () => {
    // The ranker must not second-guess eligibility: that lives in one place.
    const request = makeRequest({
      hardConstraints: {
        verifiedOnly: true,
        maxPricePerHour: 100_000,
        requiredExpertise: [],
        requireAllAvailability: false,
      },
    });
    const ineligible = makeMentor("INELIGIBLE", { verified: false, pricePerHour: 900_000 });

    const ranked = rankMentors(request, [ineligible]);
    expect(ranked).toHaveLength(1);
    expect(applyHardConstraints(request, [ineligible]).eligible).toEqual([]);
  });

  it("emits no eligibility vocabulary in its output", () => {
    const request = makeRequest();
    const serialized = JSON.stringify(rankMentors(request, mentors.slice(0, 20)));
    for (const forbidden of ["eligible", "rejected", "filteredOut", "NO_FEASIBLE_MATCH", "verified"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe("end-to-end over the benchmark set", () => {
  const mentors = readData<Mentor[]>("mentors.mock.json");
  const requests = readData<StudentRequest[]>("requests.mock.json").slice(0, 150);

  it("produces a valid, complete ranking for every request", () => {
    let ranked = 0;

    for (const request of requests) {
      const { eligible, status } = applyHardConstraints(request, mentors);
      const results = rankMentors(request, eligible, { topK: 5 });

      if (status === "NO_FEASIBLE_MATCH") {
        expect(results).toEqual([]);
        continue;
      }

      expect(results.length).toBeGreaterThan(0);
      ranked++;

      for (const result of results) {
        expect(result.matchScore).toBeGreaterThanOrEqual(0);
        expect(result.matchScore).toBeLessThanOrEqual(100);
        expect(result.dataCoverage).toBeGreaterThanOrEqual(0);
        expect(result.dataCoverage).toBeLessThanOrEqual(1);
        expect(Object.keys(result.scoreBreakdown).length).toBeGreaterThan(0);
        for (const [feature, value] of Object.entries(result.scoreBreakdown)) {
          expect(FEATURE_NAMES).toContain(feature);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      }
    }

    expect(ranked).toBeGreaterThan(50);
  });
});
