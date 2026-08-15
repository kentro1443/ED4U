/**
 * Phase 5 — feature engineering.
 *
 * Every feature must be pure, bounded to `[0, 1]`, and explicit about missing
 * data. These tests check each feature in isolation, then sweep the whole
 * fixture set to prove the bounds hold on real data rather than only on
 * hand-picked examples.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  FEATURE_NAMES,
  WEIGHTS_VERSION,
  availabilityFitFeature,
  budgetFitFeature,
  buildFeatures,
  experienceFeature,
  featureApplicability,
  focusSkillStrengthFeature,
  focusSkillStrengthOutcome,
  rankingConfig,
  ratingFeature,
  sectionScoreForSkill,
  subjectExpertiseFeature,
  teachingStyleFitFeature,
  validateMentors,
  validateStudentRequest,
} from "../src/index.js";
import type { Mentor, StudentRequest } from "../src/index.js";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

/** Reads a committed dataset file. */
function readData<T>(name: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, name), "utf8")) as T;
}

/** Builds a validated canonical request. */
function makeRequest(overrides: Record<string, unknown> = {}): StudentRequest {
  const result = validateStudentRequest({
    requestId: "R001",
    goal: { domain: "IELTS", focusSkills: [] },
    hardConstraints: { verifiedOnly: false, requiredExpertise: [], requireAllAvailability: false },
    availability: [],
    softPreferences: { teachingStyles: [], languages: [] },
    additionalPreferences: [],
    ...overrides,
  });
  if (!result.ok) throw new Error(`invalid request fixture: ${JSON.stringify(result.issues)}`);
  return result.value;
}

/** Builds a validated canonical mentor. */
function makeMentor(overrides: Record<string, unknown> = {}): Mentor {
  const result = validateMentors([
    {
      id: "M1",
      name: "Mentor One",
      birthYear: 1998,
      verified: true,
      credentials: { ielts: { overall: 7.5 }, sat: null, hsk: null },
      expertise: ["IELTS.WRITING"],
      availability: ["TUE_19_00", "THU_19_00"],
      pricePerHour: 200_000,
      ...overrides,
    },
  ]);
  if (!result.ok) throw new Error(`invalid mentor fixture: ${JSON.stringify(result.issues)}`);
  return result.value[0] as Mentor;
}

/* -------------------------------------------------------------------------- */

describe("weight configuration", () => {
  it("is versioned and lives outside code", () => {
    expect(WEIGHTS_VERSION).toBe("weights.v1");
  });

  it("declares a weight for every feature, and they sum to 1", () => {
    const weights = rankingConfig.baseWeights as Record<string, number>;
    for (const feature of FEATURE_NAMES) {
      expect(weights[feature], feature).toBeGreaterThan(0);
    }
    const total = FEATURE_NAMES.reduce((sum, f) => sum + (weights[f] as number), 0);
    expect(total).toBeCloseTo(1, 10);
    expect(Object.keys(weights).sort()).toEqual([...FEATURE_NAMES].sort());
  });

  it("states its missing-data policy explicitly", () => {
    expect(rankingConfig.missingDataPolicy.policy).toBe("REDISTRIBUTE");
  });
});

describe("subjectExpertise", () => {
  it("rises with a stronger credential in the requested domain", () => {
    const weak = makeMentor({ credentials: { ielts: { overall: 6 }, sat: null, hsk: null } });
    const strong = makeMentor({ credentials: { ielts: { overall: 8.5 }, sat: null, hsk: null } });
    expect(subjectExpertiseFeature(strong, "IELTS") as number).toBeGreaterThan(
      subjectExpertiseFeature(weak, "IELTS") as number,
    );
  });

  it("is bounded at the ends of the scale", () => {
    const floor = makeMentor({ credentials: { ielts: { overall: 5 }, sat: null, hsk: null } });
    const ceiling = makeMentor({ credentials: { ielts: { overall: 9 }, sat: null, hsk: null } });
    expect(subjectExpertiseFeature(floor, "IELTS")).toBe(0);
    expect(subjectExpertiseFeature(ceiling, "IELTS")).toBe(1);
  });

  it("returns null for an absent or unknown credential, never 0", () => {
    const absent = makeMentor({ credentials: { ielts: null, sat: null, hsk: null } });
    const unknown = makeMentor({ credentials: {} });
    expect(subjectExpertiseFeature(absent, "IELTS")).toBeNull();
    expect(subjectExpertiseFeature(unknown, "IELTS")).toBeNull();
  });

  it("uses each domain's own scale", () => {
    const mentor = makeMentor({
      credentials: { ielts: { overall: 9 }, sat: { total: 1600 }, hsk: { level: 6 } },
      expertise: ["IELTS.WRITING", "SAT.MATH", "HSK.READING"],
    });
    expect(subjectExpertiseFeature(mentor, "IELTS")).toBe(1);
    expect(subjectExpertiseFeature(mentor, "SAT")).toBe(1);
    expect(subjectExpertiseFeature(mentor, "HSK")).toBe(1);
  });
});

describe("focusSkillStrength", () => {
  it("returns null when no focus skills were requested", () => {
    expect(focusSkillStrengthFeature(makeMentor(), [])).toBeNull();
  });

  it("rewards teaching the requested skill", () => {
    const teaches = makeMentor({ expertise: ["IELTS.WRITING"] });
    const doesNot = makeMentor({ expertise: ["IELTS.READING"] });
    expect(focusSkillStrengthFeature(teaches, ["IELTS.WRITING"]) as number).toBeGreaterThan(
      focusSkillStrengthFeature(doesNot, ["IELTS.WRITING"]) as number,
    );
  });

  it("rises with a better band in that very skill", () => {
    const base = {
      expertise: ["IELTS.WRITING"],
      credentials: {
        ielts: { overall: 7.5, listening: 7.5, reading: 7.5, writing: 7, speaking: 7.5 },
        sat: null,
        hsk: null,
      },
    };
    const better = {
      expertise: ["IELTS.WRITING"],
      credentials: {
        ielts: { overall: 8, listening: 7.5, reading: 7.5, writing: 8.5, speaking: 7.5 },
        sat: null,
        hsk: null,
      },
    };
    expect(focusSkillStrengthFeature(makeMentor(better), ["IELTS.WRITING"]) as number).toBeGreaterThan(
      focusSkillStrengthFeature(makeMentor(base), ["IELTS.WRITING"]) as number,
    );
  });

  it("credits only observed evidence when the band is modelled but unpublished", () => {
    // Overall-only IELTS profile: we know they teach Writing, we do not know how
    // well. Teaching earns the taught share — never a perfect score.
    const { taughtWeight, bandWeight } = rankingConfig.focusSkill;
    const taughtShare = taughtWeight / (taughtWeight + bandWeight);

    const overallOnly = makeMentor({ expertise: ["IELTS.WRITING"] });
    const outcome = focusSkillStrengthOutcome(overallOnly, ["IELTS.WRITING"]);
    expect(outcome.value).toBeCloseTo(taughtShare, 10);
    expect(outcome.value).toBeLessThan(1);
    expect(outcome.evidence).toBeCloseTo(taughtShare, 10);

    const notTaught = makeMentor({ expertise: ["IELTS.READING"] });
    expect(focusSkillStrengthFeature(notTaught, ["IELTS.WRITING"])).toBe(0);
  });

  it("reports full evidence when per-skill scores are not part of the domain", () => {
    // HSK certifies one level and has no per-skill scores for anybody, so
    // nothing is missing and teaching evidence is the whole story.
    const mentor = makeMentor({
      credentials: { ielts: null, sat: null, hsk: { level: 5 } },
      expertise: ["HSK.READING"],
    });
    expect(sectionScoreForSkill(mentor, "HSK.READING")).toBeUndefined();
    expect(focusSkillStrengthOutcome(mentor, ["HSK.READING"])).toEqual({ value: 1, evidence: 1 });
  });

  it("reports full evidence when the band is published", () => {
    const measured = makeMentor({
      expertise: ["IELTS.WRITING"],
      credentials: {
        ielts: { overall: 7.5, listening: 7.5, reading: 7.5, writing: 7.5, speaking: 7.5 },
        sat: null,
        hsk: null,
      },
    });
    expect(focusSkillStrengthOutcome(measured, ["IELTS.WRITING"]).evidence).toBe(1);
  });

  it("averages value and evidence across several requested skills", () => {
    const { taughtWeight, bandWeight } = rankingConfig.focusSkill;
    const taughtShare = taughtWeight / (taughtWeight + bandWeight);

    const mentor = makeMentor({ expertise: ["IELTS.WRITING"] });
    const outcome = focusSkillStrengthOutcome(mentor, ["IELTS.WRITING", "IELTS.SPEAKING"]);
    // Teaches one of two, and neither band is published.
    expect(outcome.value).toBeCloseTo(taughtShare / 2, 10);
    expect(outcome.evidence).toBeCloseTo(taughtShare, 10);
  });

  it("never lets an unmeasured mentor beat a measured one on the same skill", () => {
    const unmeasured = makeMentor({ expertise: ["IELTS.WRITING"] });

    // Every publishable band from the scale floor upward.
    for (const writing of [5, 5.5, 6, 6.5, 7, 7.5, 8, 8.5, 9]) {
      const sections = { listening: 7.5, reading: 7.5, writing, speaking: 7.5 };
      const overall =
        Math.round(((sections.listening + sections.reading + writing + sections.speaking) * 2) / 4) / 2;
      const measured = makeMentor({
        expertise: ["IELTS.WRITING"],
        credentials: { ielts: { overall, ...sections }, sat: null, hsk: null },
      });

      expect(
        focusSkillStrengthFeature(measured, ["IELTS.WRITING"]) as number,
        `writing ${writing}`,
      ).toBeGreaterThanOrEqual(focusSkillStrengthFeature(unmeasured, ["IELTS.WRITING"]) as number);
    }
  });

  it("reads only the requested skill's band", () => {
    const sharpWriter = makeMentor({
      expertise: ["IELTS.WRITING"],
      credentials: {
        ielts: { overall: 7.5, listening: 6, reading: 6, writing: 9, speaking: 9 },
        sat: null,
        hsk: null,
      },
    });
    const sharpReader = makeMentor({
      expertise: ["IELTS.WRITING"],
      credentials: {
        ielts: { overall: 7.5, listening: 9, reading: 9, writing: 6, speaking: 6 },
        sat: null,
        hsk: null,
      },
    });
    expect(focusSkillStrengthFeature(sharpWriter, ["IELTS.WRITING"]) as number).toBeGreaterThan(
      focusSkillStrengthFeature(sharpReader, ["IELTS.WRITING"]) as number,
    );
  });
});

describe("availabilityFit", () => {
  const mentor = makeMentor({ availability: ["TUE_19_00", "THU_19_00"] });

  it("returns null when the student stated no availability", () => {
    expect(availabilityFitFeature(mentor, [])).toBeNull();
  });

  it("measures the share of requested slots covered", () => {
    expect(availabilityFitFeature(mentor, ["TUE_19_00", "THU_19_00"])).toBe(1);
    expect(availabilityFitFeature(mentor, ["TUE_19_00", "SAT_09_00"])).toBe(0.5);
    expect(availabilityFitFeature(mentor, ["MON_19_00"])).toBe(0);
  });
});

describe("budgetFit", () => {
  const mentor = makeMentor({ pricePerHour: 200_000 });

  it("returns null when no budget was stated", () => {
    expect(budgetFitFeature(mentor, undefined)).toBeNull();
  });

  it("falls as price approaches the budget, and never below the floor", () => {
    const atMax = budgetFitFeature(mentor, 200_000) as number;
    const halfway = budgetFitFeature(mentor, 400_000) as number;
    const free = budgetFitFeature(makeMentor({ pricePerHour: 0 }), 200_000) as number;

    expect(atMax).toBeCloseTo(rankingConfig.budget.floorAtMax, 10);
    expect(halfway).toBeGreaterThan(atMax);
    expect(free).toBe(1);
  });

  it("is monotonically non-increasing in price", () => {
    let previous = 1;
    for (const price of [0, 50_000, 100_000, 150_000, 200_000]) {
      const value = budgetFitFeature(makeMentor({ pricePerHour: price }), 200_000) as number;
      expect(value).toBeLessThanOrEqual(previous + 1e-12);
      previous = value;
    }
  });
});

describe("experience", () => {
  it("returns null when neither sessions nor months are recorded", () => {
    expect(experienceFeature(makeMentor())).toBeNull();
  });

  it("saturates rather than growing without limit", () => {
    const at = (sessions: number) =>
      experienceFeature(makeMentor({ sessionsCompleted: sessions, teachingExperienceMonths: 0 })) as number;

    // PLAN.md's anchors: 0 -> 0, 5 -> ~0.4, 20 -> ~0.8, 50+ -> ~1.0, measured on
    // the sessions component alone.
    const sessionsOnly = (sessions: number) => {
      const value = at(sessions);
      const months0 = 0;
      const { sessionsWeight, monthsWeight } = rankingConfig.experience;
      return (value * (sessionsWeight + monthsWeight) - monthsWeight * months0) / sessionsWeight;
    };

    expect(sessionsOnly(0)).toBe(0);
    expect(sessionsOnly(5)).toBeCloseTo(0.4, 1);
    expect(sessionsOnly(20)).toBeCloseTo(0.8, 1);
    expect(sessionsOnly(50)).toBeGreaterThan(0.98);
    expect(sessionsOnly(500)).toBeLessThanOrEqual(1);

    // Diminishing returns: the first 20 sessions are worth more than the next 20.
    expect(sessionsOnly(20) - sessionsOnly(0)).toBeGreaterThan(sessionsOnly(40) - sessionsOnly(20));
  });

  it("is monotonic in both sessions and months", () => {
    const more = makeMentor({ sessionsCompleted: 40, teachingExperienceMonths: 24 });
    const fewer = makeMentor({ sessionsCompleted: 5, teachingExperienceMonths: 24 });
    const shorter = makeMentor({ sessionsCompleted: 40, teachingExperienceMonths: 3 });

    expect(experienceFeature(more) as number).toBeGreaterThan(experienceFeature(fewer) as number);
    expect(experienceFeature(more) as number).toBeGreaterThan(experienceFeature(shorter) as number);
  });

  it("uses whichever signal is available", () => {
    expect(experienceFeature(makeMentor({ sessionsCompleted: 30 }))).not.toBeNull();
    expect(experienceFeature(makeMentor({ teachingExperienceMonths: 30 }))).not.toBeNull();
  });
});

describe("rating", () => {
  it("returns null for an unrated mentor, never 0", () => {
    expect(ratingFeature(makeMentor())).toBeNull();
  });

  it("normalises over the usable range and is monotonic", () => {
    expect(ratingFeature(makeMentor({ rating: 3, sessionsCompleted: 10 }))).toBe(0);
    expect(ratingFeature(makeMentor({ rating: 5, sessionsCompleted: 10 }))).toBe(1);
    expect(ratingFeature(makeMentor({ rating: 2, sessionsCompleted: 10 }))).toBe(0);
    expect(ratingFeature(makeMentor({ rating: 4.5, sessionsCompleted: 10 })) as number).toBeGreaterThan(
      ratingFeature(makeMentor({ rating: 4, sessionsCompleted: 10 })) as number,
    );
  });
});

describe("teachingStyleFit", () => {
  it("returns null when no styles were requested", () => {
    expect(teachingStyleFitFeature(makeMentor({ teachingStyles: ["PATIENT"] }), [])).toBeNull();
  });

  it("returns null when the mentor declares no styles (unknown, not a mismatch)", () => {
    expect(teachingStyleFitFeature(makeMentor(), ["PATIENT"])).toBeNull();
  });

  it("scores 0 for a declared list that matches nothing", () => {
    const mentor = makeMentor({ teachingStyles: ["INTENSIVE"] });
    expect(teachingStyleFitFeature(mentor, ["PATIENT"])).toBe(0);
  });

  it("measures the share of requested styles matched", () => {
    const mentor = makeMentor({ teachingStyles: ["PATIENT", "STRUCTURED"] });
    expect(teachingStyleFitFeature(mentor, ["PATIENT"])).toBe(1);
    expect(teachingStyleFitFeature(mentor, ["PATIENT", "INTENSIVE"])).toBe(0.5);
  });
});

/* -------------------------------------------------------------------------- */

describe("applicability", () => {
  it("depends only on what the student stated", () => {
    expect(featureApplicability(makeRequest())).toEqual({
      subjectExpertise: true,
      experience: true,
      rating: true,
      focusSkillStrength: false,
      availabilityFit: false,
      budgetFit: false,
      teachingStyleFit: false,
    });
  });

  it("turns features on as the request states more", () => {
    const rich = makeRequest({
      goal: { domain: "IELTS", focusSkills: ["IELTS.WRITING"] },
      availability: ["TUE_19_00"],
      hardConstraints: {
        verifiedOnly: false,
        maxPricePerHour: 300_000,
        requiredExpertise: [],
        requireAllAvailability: false,
      },
      softPreferences: { teachingStyles: ["PATIENT"], languages: [] },
    });
    expect(Object.values(featureApplicability(rich)).every(Boolean)).toBe(true);
  });
});

describe("purity and bounds on the full fixture set", () => {
  const mentors = readData<Mentor[]>("mentors.mock.json");
  const requests = readData<StudentRequest[]>("requests.mock.json").slice(0, 40);

  it("never returns a value outside [0, 1] or a non-null NaN", () => {
    for (const request of requests) {
      for (const mentor of mentors) {
        const { values } = buildFeatures(request, mentor);
        for (const feature of FEATURE_NAMES) {
          const value = values[feature];
          if (value === null) continue;
          expect(Number.isFinite(value), `${feature} finite`).toBe(true);
          expect(value, `${feature} >= 0`).toBeGreaterThanOrEqual(0);
          expect(value, `${feature} <= 1`).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("returns identical values for identical inputs and mutates nothing", () => {
    const request = requests[0] as StudentRequest;
    const mentor = mentors[0] as Mentor;
    const before = JSON.stringify({ request, mentor });

    expect(JSON.stringify(buildFeatures(request, mentor))).toBe(
      JSON.stringify(buildFeatures(request, mentor)),
    );
    expect(JSON.stringify({ request, mentor })).toBe(before);
  });

  it("leaves inapplicable features null", () => {
    const bare = makeRequest();
    for (const mentor of mentors.slice(0, 50)) {
      const { values, applicable } = buildFeatures(bare, mentor);
      for (const feature of FEATURE_NAMES) {
        if (!applicable[feature]) expect(values[feature], feature).toBeNull();
      }
    }
  });

  it("produces missing values on real data, so the null path is exercised", () => {
    const request = makeRequest({
      goal: { domain: "IELTS", focusSkills: ["IELTS.WRITING"] },
      softPreferences: { teachingStyles: ["PATIENT"], languages: [] },
    });
    const nulls = new Set<string>();
    for (const mentor of mentors) {
      const { values } = buildFeatures(request, mentor);
      for (const feature of FEATURE_NAMES) {
        if (values[feature] === null) nulls.add(feature);
      }
    }
    expect(nulls.has("rating")).toBe(true);
    expect(nulls.has("subjectExpertise")).toBe(true);
    expect(nulls.has("teachingStyleFit")).toBe(true);
  });
});
