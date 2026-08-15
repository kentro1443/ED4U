/**
 * Phase 6 — explainable Top-K ranking.
 *
 * Covers PLAN.md's checklist: the explanation matches the actual credential,
 * budget reasons use the real values, a missing rating never produces rating
 * praise, tradeoffs correctly compare ranked candidates, and the same ranking
 * always produces the same text.
 *
 * The hardest requirement is the negative one — *no explanation can claim
 * unavailable data* — so it is checked by sweeping the whole fixture set and
 * asserting that every sentence about a field is absent whenever that field is.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  applyHardConstraints,
  credentialKnowledge,
  explainRecommendations,
  rankMentors,
  rankingConfig,
  sectionScoreForSkill,
  topKRecommendations,
  validateMentors,
  validateRankingConfig,
  validateStudentRequest,
} from "../src/index.js";
import type { Mentor, MentorRecommendation, RankingConfig, StudentRequest } from "../src/index.js";

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
      credentials: {
        ielts: { overall: 7.5, listening: 7.5, reading: 7.5, writing: 7.5, speaking: 7.5 },
        sat: null,
        hsk: null,
      },
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

/** Explains one mentor on their own. */
function explainOne(request: StudentRequest, mentor: Mentor): MentorRecommendation {
  return topKRecommendations(request, [mentor])[0] as MentorRecommendation;
}

/** All reason text for a recommendation, joined for substring checks. */
function reasonText(recommendation: MentorRecommendation): string {
  return recommendation.reasons.join(" | ");
}

/* -------------------------------------------------------------------------- */
/* Structure                                                                  */
/* -------------------------------------------------------------------------- */

describe("recommendation structure", () => {
  const mentors = readData<Mentor[]>("mentors.mock.json");
  const request = makeRequest({
    hardConstraints: {
      verifiedOnly: false,
      maxPricePerHour: 400_000,
      requiredExpertise: [],
      requireAllAvailability: false,
    },
    softPreferences: { teachingStyles: ["PATIENT"], languages: [] },
  });

  it("carries rank, score, breakdown, reasons, tradeoffs and coverage", () => {
    const { eligible } = applyHardConstraints(request, mentors);
    const recommendations = topKRecommendations(request, eligible, { topK: 5 });

    expect(recommendations).toHaveLength(5);
    recommendations.forEach((recommendation, index) => {
      expect(recommendation.rank).toBe(index + 1);
      expect(recommendation.matchScore).toBeGreaterThanOrEqual(0);
      expect(recommendation.matchScore).toBeLessThanOrEqual(100);
      expect(Object.keys(recommendation.scoreBreakdown).length).toBeGreaterThan(0);
      expect(recommendation.dataCoverage).toBeGreaterThanOrEqual(0);
      expect(recommendation.dataCoverage).toBeLessThanOrEqual(1);
      expect(Array.isArray(recommendation.tradeoffs)).toBe(true);
    });
  });

  it("gives every recommendation at least one factual reason", () => {
    const requests = readData<StudentRequest[]>("requests.mock.json").slice(0, 60);
    let checked = 0;

    for (const each of requests) {
      const { eligible } = applyHardConstraints(each, mentors);
      for (const recommendation of topKRecommendations(each, eligible, { topK: 3 })) {
        expect(recommendation.reasons.length, recommendation.mentorId).toBeGreaterThan(0);
        for (const reason of recommendation.reasons) expect(reason.trim().length).toBeGreaterThan(0);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });

  it("still explains a mentor with almost nothing on record", () => {
    const bare = makeMentor("BARE", {
      credentials: {},
      rating: undefined,
      sessionsCompleted: undefined,
      teachingExperienceMonths: undefined,
      teachingStyles: undefined,
      verified: false,
    });
    const recommendation = explainOne(makeRequest(), bare);

    expect(recommendation.reasons.length).toBeGreaterThan(0);
    // The only true thing left to say is what they teach.
    expect(reasonText(recommendation)).toContain("Teaches IELTS Writing");
    expect(recommendation.tradeoffs).toContain("No rating on record yet");
    expect(recommendation.tradeoffs).toContain("No IELTS credential on record");
  });

  it("keeps Top-K output stable and truncated in rank order", () => {
    const { eligible } = applyHardConstraints(request, mentors);
    const all = topKRecommendations(request, eligible);
    const top3 = topKRecommendations(request, eligible, { topK: 3 });

    // Ranking, scores and reasons are unaffected by truncation...
    expect(top3.map((r) => [r.mentorId, r.rank, r.matchScore])).toEqual(
      all.slice(0, 3).map((r) => [r.mentorId, r.rank, r.matchScore]),
    );
    expect(top3.map((r) => r.reasons)).toEqual(all.slice(0, 3).map((r) => r.reasons));
  });

  it("only ever compares against mentors the student can actually see", () => {
    const { eligible } = applyHardConstraints(request, mentors);
    const top3 = topKRecommendations(request, eligible, { topK: 3 });
    const shown = new Set(top3.map((r) => r.mentorId));

    // Tradeoffs are scoped to the returned set: naming a mentor outside the
    // Top-K would point the student at someone they were never offered.
    for (const recommendation of top3) {
      for (const tradeoff of recommendation.tradeoffs) {
        const named = /\b(M\d{4})\b/.exec(tradeoff)?.[1];
        if (named !== undefined) expect(shown, tradeoff).toContain(named);
      }
    }
  });

  it("refuses to explain a mentor it was not given", () => {
    const ranked = rankMentors(makeRequest(), [makeMentor("PRESENT")]);
    expect(() => explainRecommendations(makeRequest(), ranked, [])).toThrow(/unknown mentor/i);
  });
});

/* -------------------------------------------------------------------------- */
/* Reasons are factual                                                        */
/* -------------------------------------------------------------------------- */

describe("reasons match the record", () => {
  it("states the actual credential, on the domain's own scale", () => {
    const ielts = explainOne(
      makeRequest({ goal: { domain: "IELTS", focusSkills: [] } }),
      makeMentor("M1", { credentials: { ielts: { overall: 8 }, sat: null, hsk: null } }),
    );
    expect(reasonText(ielts)).toContain("IELTS 8.0 overall");

    const sat = explainOne(
      makeRequest({ goal: { domain: "SAT", focusSkills: [] } }),
      makeMentor("M2", {
        credentials: { ielts: null, sat: { total: 1520, math: 800, readingWriting: 720 }, hsk: null },
        expertise: ["SAT.MATH"],
      }),
    );
    expect(reasonText(sat)).toContain("SAT 1520 total");

    const hsk = explainOne(
      makeRequest({ goal: { domain: "HSK", focusSkills: [] } }),
      makeMentor("M3", {
        credentials: { ielts: null, sat: null, hsk: { level: 5 } },
        expertise: ["HSK.READING"],
      }),
    );
    expect(reasonText(hsk)).toContain("HSK level 5");
  });

  it("mentions a credential minimum only when one was requested", () => {
    const mentor = makeMentor("M1", { credentials: { ielts: { overall: 8 }, sat: null, hsk: null } });

    expect(
      reasonText(explainOne(makeRequest({ goal: { domain: "IELTS", focusSkills: [] } }), mentor)),
    ).not.toContain("you asked for");

    const withMinimum = makeRequest({
      goal: { domain: "IELTS", focusSkills: [] },
      hardConstraints: {
        verifiedOnly: false,
        minCredentialScore: 7,
        requiredExpertise: [],
        requireAllAvailability: false,
      },
    });
    expect(reasonText(explainOne(withMinimum, mentor))).toContain("at or above the 7.0 you asked for");
  });

  it("uses the real numbers in the budget reason", () => {
    const request = makeRequest({
      hardConstraints: {
        verifiedOnly: false,
        maxPricePerHour: 200_000,
        requiredExpertise: [],
        requireAllAvailability: false,
      },
    });
    const recommendation = explainOne(request, makeMentor("M1", { pricePerHour: 180_000 }));

    expect(reasonText(recommendation)).toContain("180,000 VND/hour is within your 200,000 VND budget");
  });

  it("says nothing about budget when no budget was stated", () => {
    expect(reasonText(explainOne(makeRequest(), makeMentor("M1")))).not.toContain("budget");
  });

  it("reports the real slot overlap, partial or complete", () => {
    const mentor = makeMentor("M1", { availability: ["TUE_19_00"] });

    const oneOfOne = explainOne(makeRequest({ availability: ["TUE_19_00"] }), mentor);
    expect(reasonText(oneOfOne)).toContain("Available at your requested time (TUE_19_00)");

    const oneOfTwo = explainOne(
      makeRequest({ availability: ["TUE_19_00", "THU_19_00"] }),
      mentor,
    );
    expect(reasonText(oneOfTwo)).toContain("Available at 1 of your 2 requested times (TUE_19_00)");
    expect(reasonText(oneOfTwo)).not.toContain("Available at all");
  });

  it("names the focus skill band only when it is published", () => {
    const measured = makeMentor("MEASURED", {
      credentials: {
        ielts: { overall: 8, listening: 8, reading: 8, writing: 8, speaking: 8 },
        sat: null,
        hsk: null,
      },
    });
    expect(reasonText(explainOne(makeRequest(), measured))).toContain(
      "IELTS Writing 8.0 matches your focus on IELTS Writing",
    );

    const unmeasured = makeMentor("UNMEASURED", {
      credentials: { ielts: { overall: 8 }, sat: null, hsk: null },
    });
    const text = reasonText(explainOne(makeRequest(), unmeasured));
    // Teaching it is observed; a band is not. Say only what was observed.
    expect(text).toContain("Teaches IELTS Writing");
    expect(text).not.toMatch(/IELTS Writing \d/);
  });

  it("reports experience exactly as recorded", () => {
    const both = explainOne(
      makeRequest(),
      makeMentor("M1", { sessionsCompleted: 38, teachingExperienceMonths: 12 }),
    );
    expect(reasonText(both)).toContain("38 completed sessions over 12 months of teaching");

    const sessionsOnly = explainOne(
      makeRequest(),
      makeMentor("M2", { sessionsCompleted: 1, teachingExperienceMonths: undefined }),
    );
    expect(reasonText(sessionsOnly)).toContain("1 completed session");

    const monthsOnly = explainOne(
      makeRequest(),
      makeMentor("M3", { sessionsCompleted: undefined, teachingExperienceMonths: 5 }),
    );
    expect(reasonText(monthsOnly)).toContain("5 months of teaching experience");
  });

  it("mentions only the teaching styles that actually matched", () => {
    const request = makeRequest({
      softPreferences: { teachingStyles: ["PATIENT", "INTENSIVE"], languages: [] },
    });
    const mentor = makeMentor("M1", { teachingStyles: ["PATIENT", "ANALYTICAL"] });
    const text = reasonText(explainOne(request, mentor));

    expect(text).toContain("Teaching style matches your preference: PATIENT");
    expect(text).not.toContain("INTENSIVE");
    expect(text).not.toContain("ANALYTICAL");
  });

  it("claims verification only for verified mentors", () => {
    // A sparse profile, so the low-priority verification fact is not crowded
    // out by higher-weighted ones under the reason cap.
    const sparse = {
      credentials: {},
      rating: undefined,
      sessionsCompleted: undefined,
      teachingExperienceMonths: undefined,
      teachingStyles: undefined,
    };

    expect(
      reasonText(explainOne(makeRequest(), makeMentor("V", { ...sparse, verified: true }))),
    ).toContain("verified by ED4U");
    expect(
      reasonText(explainOne(makeRequest(), makeMentor("U", { ...sparse, verified: false }))),
    ).not.toContain("verified by ED4U");
    expect(explainOne(makeRequest(), makeMentor("U", { ...sparse, verified: false })).tradeoffs).toContain(
      "Not yet verified by ED4U",
    );
  });

  it("leads with the most decision-relevant fact", () => {
    // focusSkillStrength carries the largest boosted weight, so it comes first.
    const recommendation = explainOne(makeRequest(), makeMentor("M1"));
    expect(recommendation.reasons[0]).toContain("IELTS Writing");
  });
});

/* -------------------------------------------------------------------------- */
/* Never claims what it does not have                                         */
/* -------------------------------------------------------------------------- */

describe("missing data is never praised or invented", () => {
  it("never produces rating praise for an unrated mentor", () => {
    const unrated = makeMentor("UNRATED", { rating: undefined });
    const recommendation = explainOne(makeRequest(), unrated);

    expect(reasonText(recommendation)).not.toMatch(/rated/i);
    expect(recommendation.tradeoffs).toContain("No rating on record yet");
  });

  it("never mentions a credential the mentor does not have on record", () => {
    const unknown = explainOne(makeRequest(), makeMentor("UNKNOWN", { credentials: {} }));
    expect(reasonText(unknown)).not.toContain("IELTS 7");
    expect(reasonText(unknown)).not.toContain("overall");
    expect(unknown.tradeoffs).toContain("No IELTS credential on record");

    const absent = explainOne(
      makeRequest(),
      makeMentor("ABSENT", { credentials: { ielts: null, sat: null, hsk: null } }),
    );
    expect(reasonText(absent)).not.toContain("overall");
    expect(absent.tradeoffs).toContain("Holds no IELTS credential");
  });

  it("distinguishes an unknown credential from one the mentor says they lack", () => {
    const unknown = explainOne(makeRequest(), makeMentor("U", { credentials: {} }));
    const absent = explainOne(
      makeRequest(),
      makeMentor("A", { credentials: { ielts: null, sat: null, hsk: null } }),
    );
    expect(unknown.tradeoffs).not.toEqual(absent.tradeoffs);
  });

  it("discloses an unpublished band rather than glossing over it", () => {
    const unmeasured = makeMentor("M1", {
      credentials: { ielts: { overall: 8 }, sat: null, hsk: null },
    });
    expect(explainOne(makeRequest(), unmeasured).tradeoffs).toContain(
      "No published IELTS Writing score",
    );
  });

  it("does not treat an HSK skill as having a missing band", () => {
    // HSK has no per-skill scores for anybody; nothing is missing.
    const request = makeRequest({ goal: { domain: "HSK", focusSkills: ["HSK.READING"] } });
    const mentor = makeMentor("M1", {
      credentials: { ielts: null, sat: null, hsk: { level: 5 } },
      expertise: ["HSK.READING"],
    });
    expect(explainOne(request, mentor).tradeoffs.join(" ")).not.toContain("No published");
  });

  it("never asserts a fact absent from the record, across the fixture set", () => {
    const mentors = readData<Mentor[]>("mentors.mock.json");
    const requests = readData<StudentRequest[]>("requests.mock.json").slice(0, 80);
    let checked = 0;

    for (const request of requests) {
      const { eligible } = applyHardConstraints(request, mentors);
      const byId = new Map(eligible.map((mentor) => [mentor.id, mentor]));

      for (const recommendation of topKRecommendations(request, eligible, { topK: 3 })) {
        const mentor = byId.get(recommendation.mentorId) as Mentor;
        const text = reasonText(recommendation);
        checked++;

        if (mentor.rating === undefined) expect(text, mentor.id).not.toMatch(/rated/i);
        if (mentor.sessionsCompleted === undefined) {
          expect(text, mentor.id).not.toMatch(/completed session/i);
        }
        if (mentor.teachingExperienceMonths === undefined) {
          expect(text, mentor.id).not.toMatch(/months of teaching/i);
        }
        if (mentor.teachingStyles === undefined) {
          expect(text, mentor.id).not.toMatch(/teaching style matches/i);
        }
        if (!mentor.verified) expect(text, mentor.id).not.toMatch(/verified by/i);
        if (credentialKnowledge(mentor.credentials, request.goal.domain) !== "PRESENT") {
          expect(text, mentor.id).not.toMatch(/overall|total|level \d/i);
        }
        for (const skill of request.goal.focusSkills) {
          if (sectionScoreForSkill(mentor, skill) === undefined) {
            // No numeric band may be attached to a skill we never measured.
            expect(text, `${mentor.id} ${skill}`).not.toMatch(
              new RegExp(`${skill.split(".")[1] ?? ""}\\s+\\d`, "i"),
            );
          }
        }
      }
    }

    expect(checked).toBeGreaterThan(100);
  });

  it("quotes only numbers that appear in the mentor's record", () => {
    const mentors = readData<Mentor[]>("mentors.mock.json");
    const request = makeRequest({
      hardConstraints: {
        verifiedOnly: false,
        maxPricePerHour: 400_000,
        requiredExpertise: [],
        requireAllAvailability: false,
      },
    });
    const { eligible } = applyHardConstraints(request, mentors);
    const byId = new Map(eligible.map((mentor) => [mentor.id, mentor]));

    for (const recommendation of topKRecommendations(request, eligible, { topK: 20 })) {
      const mentor = byId.get(recommendation.mentorId) as Mentor;
      const priceText = `${mentor.pricePerHour.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")} VND`;
      const budgetReason = recommendation.reasons.find((reason) => reason.includes("budget"));
      expect(budgetReason, mentor.id).toContain(priceText);
      expect(budgetReason, mentor.id).toContain("400,000 VND budget");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Tradeoffs                                                                  */
/* -------------------------------------------------------------------------- */

describe("tradeoffs compare real ranked candidates", () => {
  const request = makeRequest({
    hardConstraints: {
      verifiedOnly: false,
      maxPricePerHour: 500_000,
      requiredExpertise: [],
      requireAllAvailability: false,
    },
  });

  it("names the mentor it is comparing against, with both figures", () => {
    const junior = makeMentor("JUNIOR", { sessionsCompleted: 12, rating: 5 });
    const senior = makeMentor("SENIOR", { sessionsCompleted: 300, rating: 4.9 });

    const recommendations = topKRecommendations(request, [junior, senior]);
    const juniorEntry = recommendations.find((r) => r.mentorId === "JUNIOR") as MentorRecommendation;

    expect(juniorEntry.tradeoffs).toContain("Fewer completed sessions than SENIOR (12 vs 300)");
  });

  it("reports a cheaper alternative with real prices", () => {
    const cheap = makeMentor("CHEAP", { pricePerHour: 150_000 });
    const dear = makeMentor("DEAR", { pricePerHour: 450_000 });

    const dearEntry = topKRecommendations(request, [cheap, dear]).find(
      (r) => r.mentorId === "DEAR",
    ) as MentorRecommendation;

    expect(dearEntry.tradeoffs).toContain("Costs more per hour than CHEAP (450,000 VND vs 150,000 VND)");
  });

  it("reports a stronger credential elsewhere", () => {
    const weaker = makeMentor("WEAKER", {
      credentials: { ielts: { overall: 7 }, sat: null, hsk: null },
    });
    const stronger = makeMentor("STRONGER", {
      credentials: { ielts: { overall: 8.5 }, sat: null, hsk: null },
    });

    const weakerEntry = topKRecommendations(request, [weaker, stronger]).find(
      (r) => r.mentorId === "WEAKER",
    ) as MentorRecommendation;

    expect(weakerEntry.tradeoffs).toContain("Lower IELTS score than STRONGER (7.0 vs 8.5)");
  });

  it("reports a better schedule fit elsewhere", () => {
    const twoSlots = makeRequest({ availability: ["TUE_19_00", "THU_19_00"] });
    const partial = makeMentor("PARTIAL", { availability: ["TUE_19_00"] });
    const full = makeMentor("FULL", { availability: ["TUE_19_00", "THU_19_00"] });

    const partialEntry = topKRecommendations(twoSlots, [partial, full]).find(
      (r) => r.mentorId === "PARTIAL",
    ) as MentorRecommendation;

    expect(partialEntry.tradeoffs).toContain(
      "Covers fewer of your requested times than FULL (1 of 2 vs 2)",
    );
  });

  it("gives the best candidate no comparative disadvantage it does not have", () => {
    const best = makeMentor("BEST", {
      sessionsCompleted: 500,
      pricePerHour: 100_000,
      credentials: {
        ielts: { overall: 9, listening: 9, reading: 9, writing: 9, speaking: 9 },
        sat: null,
        hsk: null,
      },
    });
    const other = makeMentor("OTHER", { sessionsCompleted: 10, pricePerHour: 400_000 });

    const bestEntry = topKRecommendations(request, [best, other]).find(
      (r) => r.mentorId === "BEST",
    ) as MentorRecommendation;

    expect(bestEntry.tradeoffs.filter((t) => t.includes("OTHER"))).toEqual([]);
  });

  it("never compares against a figure the other mentor does not have", () => {
    const known = makeMentor("KNOWN", { sessionsCompleted: 10 });
    const unknown = makeMentor("UNKNOWN", { sessionsCompleted: undefined });

    for (const recommendation of topKRecommendations(request, [known, unknown])) {
      expect(recommendation.tradeoffs.join(" ")).not.toMatch(/undefined|NaN/);
    }
  });

  it("emits no tradeoff at all for a single fully-documented candidate", () => {
    const solo = makeMentor("SOLO");
    expect(explainOne(request, solo).tradeoffs).toEqual([]);
  });
});

describe("critical disclosures survive the cap", () => {
  const request = makeRequest({
    availability: ["TUE_19_00", "THU_19_00"],
    hardConstraints: {
      verifiedOnly: false,
      maxPricePerHour: 500_000,
      requiredExpertise: [],
      requireAllAvailability: false,
    },
  });

  /**
   * The worst case for the old implementation: an unverified mentor who is
   * simultaneously behind on sessions, price, credential AND schedule, so four
   * comparative tradeoffs are generated and would have filled the cap on their
   * own — silently dropping the fact that nobody has verified this person.
   */
  const outclassed = makeMentor("OUTCLASSED", {
    verified: false,
    sessionsCompleted: 5,
    pricePerHour: 450_000,
    credentials: {
      ielts: { overall: 6.5, listening: 6.5, reading: 6.5, writing: 6.5, speaking: 6.5 },
      sat: null,
      hsk: null,
    },
    availability: ["TUE_19_00"],
  });

  const superior = makeMentor("SUPERIOR", {
    verified: true,
    sessionsCompleted: 400,
    pricePerHour: 150_000,
    credentials: {
      ielts: { overall: 9, listening: 9, reading: 9, writing: 9, speaking: 9 },
      sat: null,
      hsk: null,
    },
    availability: ["TUE_19_00", "THU_19_00"],
  });

  it("keeps the unverified disclosure even when four comparatives compete", () => {
    const entry = topKRecommendations(request, [outclassed, superior]).find(
      (r) => r.mentorId === "OUTCLASSED",
    ) as MentorRecommendation;

    expect(entry.tradeoffs).toContain("Not yet verified by ED4U");
    expect(entry.tradeoffs.length).toBeLessThanOrEqual(4);
    // ...and it leads, because trust outranks routine comparison.
    expect(entry.tradeoffs[0]).toBe("Not yet verified by ED4U");
  });

  it("would have generated enough comparatives to displace it", () => {
    // Proves the regression case is real: all four comparative dimensions fire.
    const verifiedTwin = makeMentor("TWIN", {
      verified: true,
      sessionsCompleted: 5,
      pricePerHour: 450_000,
      credentials: {
        ielts: { overall: 6.5, listening: 6.5, reading: 6.5, writing: 6.5, speaking: 6.5 },
        sat: null,
        hsk: null,
      },
      availability: ["TUE_19_00"],
    });

    const entry = topKRecommendations(request, [verifiedTwin, superior]).find(
      (r) => r.mentorId === "TWIN",
    ) as MentorRecommendation;

    expect(entry.tradeoffs).toHaveLength(4);
    for (const fragment of ["Fewer completed sessions", "Costs more", "Lower IELTS", "Covers fewer"]) {
      expect(entry.tradeoffs.join(" | "), fragment).toContain(fragment);
    }
  });

  it("keeps a missing credential disclosure ahead of comparatives too", () => {
    const noCredential = makeMentor("NO-CRED", {
      credentials: {},
      sessionsCompleted: 5,
      pricePerHour: 450_000,
      availability: ["TUE_19_00"],
    });

    const entry = topKRecommendations(request, [noCredential, superior]).find(
      (r) => r.mentorId === "NO-CRED",
    ) as MentorRecommendation;

    expect(entry.tradeoffs).toContain("No IELTS credential on record");
    expect(entry.tradeoffs.indexOf("No IELTS credential on record")).toBeLessThan(
      entry.tradeoffs.findIndex((t) => t.includes("Costs more")),
    );
  });

  it("still respects the configured cap when criticals alone could exceed it", () => {
    const tightCap = {
      ...rankingConfig,
      explanation: { ...rankingConfig.explanation, maxTradeoffs: 1 },
    };

    const entry = topKRecommendations(request, [outclassed, superior], { config: tightCap }).find(
      (r) => r.mentorId === "OUTCLASSED",
    ) as MentorRecommendation;

    expect(entry.tradeoffs).toEqual(["Not yet verified by ED4U"]);
  });

  it("emits no tradeoffs when the cap is zero", () => {
    const noTradeoffs = {
      ...rankingConfig,
      explanation: { ...rankingConfig.explanation, maxTradeoffs: 0 },
    };

    for (const entry of topKRecommendations(request, [outclassed, superior], { config: noTradeoffs })) {
      expect(entry.tradeoffs).toEqual([]);
    }
  });
});

describe("explanation configuration is validated", () => {
  const ranked = rankMentors(makeRequest(), [makeMentor("M1")]);

  /** Builds a config with a patched explanation block. */
  function withExplanation(explanation: unknown): RankingConfig {
    return { ...rankingConfig, explanation } as RankingConfig;
  }

  const INVALID = [
    ["negative maxReasons", { maxReasons: -1, maxTradeoffs: 4 }, /explanation\.maxReasons/],
    ["zero maxReasons", { maxReasons: 0, maxTradeoffs: 4 }, /explanation\.maxReasons/],
    ["fractional maxReasons", { maxReasons: 2.5, maxTradeoffs: 4 }, /whole number/],
    ["NaN maxReasons", { maxReasons: Number.NaN, maxTradeoffs: 4 }, /explanation\.maxReasons/],
    ["infinite maxReasons", { maxReasons: Number.POSITIVE_INFINITY, maxTradeoffs: 4 }, /explanation\.maxReasons/],
    ["missing maxReasons", { maxTradeoffs: 4 }, /explanation\.maxReasons/],
    ["negative maxTradeoffs", { maxReasons: 5, maxTradeoffs: -1 }, /explanation\.maxTradeoffs/],
    ["fractional maxTradeoffs", { maxReasons: 5, maxTradeoffs: 1.5 }, /whole number/],
    ["NaN maxTradeoffs", { maxReasons: 5, maxTradeoffs: Number.NaN }, /explanation\.maxTradeoffs/],
    ["string maxTradeoffs", { maxReasons: 5, maxTradeoffs: "four" }, /explanation\.maxTradeoffs/],
  ] as const;

  it.each(INVALID)("rejects %s", (_label, explanation, pattern) => {
    expect(() => validateRankingConfig(withExplanation(explanation))).toThrow(pattern);
  });

  it("accepts a zero tradeoff cap, which is a legitimate deployment choice", () => {
    expect(() => validateRankingConfig(withExplanation({ maxReasons: 1, maxTradeoffs: 0 }))).not.toThrow();
  });

  it("validates the config inside explainRecommendations, not only inside rankMentors", () => {
    // explainRecommendations is a public entry point: a stored ranking can be
    // re-explained without ever touching the ranker.
    expect(() =>
      explainRecommendations(makeRequest(), ranked, [makeMentor("M1")], {
        config: withExplanation({ maxReasons: 0, maxTradeoffs: 4 }),
      }),
    ).toThrow(/explanation\.maxReasons/);

    expect(() =>
      explainRecommendations(makeRequest(), ranked, [makeMentor("M1")], {
        config: { ...rankingConfig, budget: { floorAtMax: 5 } },
      }),
    ).toThrow(/budget\.floorAtMax/);
  });
});

describe("recommendations are self-auditable", () => {
  const mentors = readData<Mentor[]>("mentors.mock.json");
  const requests = readData<StudentRequest[]>("requests.mock.json").slice(0, 40);

  it("reproduces matchScore from appliedWeights and scoreBreakdown alone", () => {
    let checked = 0;

    for (const request of requests) {
      const { eligible } = applyHardConstraints(request, mentors);
      for (const recommendation of topKRecommendations(request, eligible, { topK: 5 })) {
        const recomputed =
          100 *
          Object.entries(recommendation.appliedWeights).reduce((sum, [feature, weight]) => {
            const value = recommendation.scoreBreakdown[feature];
            expect(value, `${recommendation.mentorId}.${feature}`).toBeDefined();
            if (value === undefined) throw new Error(`missing scoreBreakdown.${feature}`);
            return sum + weight * value;
          }, 0);

        expect(
          Math.abs(recomputed - recommendation.matchScore),
          `${request.requestId}/${recommendation.mentorId}`,
        ).toBeLessThanOrEqual(0.005);
        checked++;
      }
    }

    expect(checked).toBeGreaterThan(50);
  });

  it("carries applied weights at full precision, summing to 1", () => {
    const request = requests[0] as StudentRequest;
    const { eligible } = applyHardConstraints(request, mentors);

    for (const recommendation of topKRecommendations(request, eligible, { topK: 5 })) {
      const weights = Object.values(recommendation.appliedWeights);
      expect(weights.reduce((sum, w) => sum + w, 0)).toBeCloseTo(1, 12);
      expect(Object.keys(recommendation.appliedWeights).sort()).toEqual(
        Object.keys(recommendation.scoreBreakdown).sort(),
      );
    }
  });

  it("survives a JSON round-trip and is still auditable", () => {
    const request = requests[0] as StudentRequest;
    const { eligible } = applyHardConstraints(request, mentors);
    const stored = JSON.parse(
      JSON.stringify(topKRecommendations(request, eligible, { topK: 3 })),
    ) as MentorRecommendation[];

    for (const recommendation of stored) {
      const recomputed =
        100 *
        Object.entries(recommendation.appliedWeights).reduce(
          (sum, [feature, weight]) => sum + weight * (recommendation.scoreBreakdown[feature] as number),
          0,
        );
      expect(Math.abs(recomputed - recommendation.matchScore)).toBeLessThanOrEqual(0.005);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Language and determinism                                                   */
/* -------------------------------------------------------------------------- */

describe("language discipline", () => {
  it("never describes the score as a probability or a confidence", () => {
    const mentors = readData<Mentor[]>("mentors.mock.json");
    const requests = readData<StudentRequest[]>("requests.mock.json").slice(0, 60);

    const banned = [
      "probability", "confidence", "confident", "chance", "likely", "guarantee",
      "guaranteed", "will succeed", "success rate", "odds", "predict",
    ];

    for (const request of requests) {
      const { eligible } = applyHardConstraints(request, mentors);
      for (const recommendation of topKRecommendations(request, eligible, { topK: 3 })) {
        const text = [...recommendation.reasons, ...recommendation.tradeoffs].join(" ").toLowerCase();
        for (const word of banned) {
          expect(text, `${recommendation.mentorId}: "${word}"`).not.toContain(word);
        }
      }
    }
  });

  it("caps reasons and tradeoffs so the output stays readable", () => {
    const mentors = readData<Mentor[]>("mentors.mock.json");
    const request = makeRequest({
      hardConstraints: {
        verifiedOnly: false,
        maxPricePerHour: 500_000,
        requiredExpertise: [],
        requireAllAvailability: false,
      },
      softPreferences: { teachingStyles: ["PATIENT"], languages: [] },
    });
    const { eligible } = applyHardConstraints(request, mentors);

    for (const recommendation of topKRecommendations(request, eligible, { topK: 10 })) {
      expect(recommendation.reasons.length).toBeLessThanOrEqual(5);
      expect(recommendation.tradeoffs.length).toBeLessThanOrEqual(4);
    }
  });
});

describe("determinism", () => {
  const mentors = readData<Mentor[]>("mentors.mock.json");
  const requests = readData<StudentRequest[]>("requests.mock.json").slice(0, 30);

  it("produces the same explanation for the same ranking", () => {
    for (const request of requests) {
      const { eligible } = applyHardConstraints(request, mentors);
      const first = topKRecommendations(request, eligible, { topK: 5 });
      const second = topKRecommendations(request, eligible, { topK: 5 });
      expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    }
  });

  it("is independent of the order candidates arrive in", () => {
    const request = requests[0] as StudentRequest;
    const { eligible } = applyHardConstraints(request, mentors);

    const forward = topKRecommendations(request, eligible, { topK: 5 });
    const reversed = topKRecommendations(request, [...eligible].reverse(), { topK: 5 });
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(forward));
  });

  it("does not mutate its inputs", () => {
    const request = requests[0] as StudentRequest;
    const { eligible } = applyHardConstraints(request, mentors);
    const before = JSON.stringify({ request, eligible });
    topKRecommendations(request, eligible, { topK: 5 });
    expect(JSON.stringify({ request, eligible })).toBe(before);
  });

  it("is JSON-serializable end to end", () => {
    const request = requests[0] as StudentRequest;
    const { eligible } = applyHardConstraints(request, mentors);
    const recommendations = topKRecommendations(request, eligible, { topK: 5 });
    expect(JSON.parse(JSON.stringify(recommendations))).toEqual(recommendations);
  });

  it("explains a stored ranking the same way it explains a fresh one", () => {
    const request = requests[1] as StudentRequest;
    const { eligible } = applyHardConstraints(request, mentors);
    const ranked = rankMentors(request, eligible, { topK: 5 });

    expect(explainRecommendations(request, ranked, eligible)).toEqual(
      topKRecommendations(request, eligible, { topK: 5 }),
    );
  });
});
