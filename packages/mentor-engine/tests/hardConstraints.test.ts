/**
 * Phase 4 — hard constraint filter.
 *
 * Covers the boundary cases named in PLAN.md §Phase 4, the three-state
 * credential semantics, the labelled Phase 3 adversarial fixtures turned into
 * executable assertions, and the invariant the whole engine rests on:
 *
 * > hard constraint violation rate = 0%
 *
 * The invariant is checked with an *independent* re-implementation of the
 * constraints, so a bug in the filter cannot hide behind the filter's own
 * bookkeeping.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  CONSTRAINT_ORDER,
  FILTER_REASONS,
  applyHardConstraints,
  credentialKnowledge,
  headlineCredentialScore,
  satisfiesHardConstraints,
  validateMentors,
  validateStudentRequest,
} from "../src/index.js";
import type { FilterReason, MatchDiagnostics, Mentor, StudentRequest } from "../src/index.js";
import type { AdversarialCase } from "../scripts/generateRequests.js";

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "data");

/** Reads a committed dataset file. */
function readData<T>(name: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, name), "utf8")) as T;
}

/* -------------------------------------------------------------------------- */
/* Builders                                                                   */
/* -------------------------------------------------------------------------- */

/** Builds a validated canonical request, failing loudly on a bad fixture. */
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

/** Builds a validated canonical mentor, failing loudly on a bad fixture. */
function makeMentor(id: string, overrides: Record<string, unknown> = {}): Mentor {
  const result = validateMentors([
    {
      id,
      name: `Mentor ${id}`,
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

/** Returns the reasons recorded for one mentor, or `[]` if they were eligible. */
function reasonsFor(
  result: ReturnType<typeof applyHardConstraints>,
  mentorId: string,
): FilterReason[] {
  return result.rejected.find((r) => r.mentorId === mentorId)?.reasons ?? [];
}

/* -------------------------------------------------------------------------- */
/* Reason vocabulary and response contract                                    */
/* -------------------------------------------------------------------------- */

describe("filter reason vocabulary", () => {
  it("keeps the three credential reasons distinct", () => {
    for (const reason of ["CREDENTIAL_MINIMUM", "CREDENTIAL_ABSENT", "CREDENTIAL_UNKNOWN"]) {
      expect(FILTER_REASONS).toContain(reason);
    }
  });

  it("evaluates exactly the published vocabulary, with no duplicates", () => {
    expect([...CONSTRAINT_ORDER].sort()).toEqual([...FILTER_REASONS].sort());
    expect(new Set(CONSTRAINT_ORDER).size).toBe(CONSTRAINT_ORDER.length);
  });

  it("is documented in the README, so the docs cannot drift from the code", () => {
    const readme = readFileSync(join(DATA_DIR, "..", "README.md"), "utf8");
    for (const reason of FILTER_REASONS) {
      expect(readme, `README should document ${reason}`).toContain(reason);
    }
  });

  it("produces diagnostics that satisfy the canonical MatchDiagnostics contract", () => {
    const result = applyHardConstraints(makeRequest(), [makeMentor("M1")]);

    // Assignability is the real assertion here: if MatchDiagnostics ever loses
    // filteredOutByReason, this stops compiling rather than silently dropping
    // the field when later phases assemble a MatchResponse.
    const diagnostics: MatchDiagnostics = {
      candidateCount: result.diagnostics.candidateCount,
      eligibleCount: result.diagnostics.eligibleCount,
      filteredOut: result.diagnostics.filteredOut,
      filteredOutByReason: result.diagnostics.filteredOutByReason,
      latencyMs: 0,
    };

    expect(diagnostics.filteredOutByReason).toEqual({});
    expect(diagnostics.eligibleCount).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Boundaries                                                                 */
/* -------------------------------------------------------------------------- */

describe("price boundary", () => {
  const request = makeRequest({
    hardConstraints: {
      verifiedOnly: false,
      maxPricePerHour: 200_000,
      requiredExpertise: [],
      requireAllAvailability: false,
    },
  });

  it("allows a price exactly at the maximum", () => {
    const result = applyHardConstraints(request, [makeMentor("M1", { pricePerHour: 200_000 })]);
    expect(result.eligible.map((m) => m.id)).toEqual(["M1"]);
  });

  it("rejects a price 1 VND over the maximum", () => {
    const result = applyHardConstraints(request, [makeMentor("M1", { pricePerHour: 200_001 })]);
    expect(result.eligible).toEqual([]);
    expect(reasonsFor(result, "M1")).toEqual(["PRICE"]);
  });

  it("allows any price when no budget is stated", () => {
    const noBudget = makeRequest();
    const result = applyHardConstraints(noBudget, [makeMentor("M1", { pricePerHour: 5_000_000 })]);
    expect(result.eligible).toHaveLength(1);
  });

  it("allows a free mentor", () => {
    const result = applyHardConstraints(request, [makeMentor("M1", { pricePerHour: 0 })]);
    expect(result.eligible).toHaveLength(1);
  });
});

describe("credential minimum boundary", () => {
  const request = makeRequest({
    hardConstraints: {
      verifiedOnly: false,
      minCredentialScore: 7,
      requiredExpertise: [],
      requireAllAvailability: false,
    },
  });

  it("allows a credential exactly equal to the minimum", () => {
    const mentor = makeMentor("M1", { credentials: { ielts: { overall: 7 }, sat: null, hsk: null } });
    expect(applyHardConstraints(request, [mentor]).eligible).toHaveLength(1);
  });

  it("rejects a credential half a band below the minimum", () => {
    const mentor = makeMentor("M1", {
      credentials: { ielts: { overall: 6.5 }, sat: null, hsk: null },
    });
    const result = applyHardConstraints(request, [mentor]);
    expect(result.eligible).toEqual([]);
    expect(reasonsFor(result, "M1")).toEqual(["CREDENTIAL_MINIMUM"]);
  });

  it("applies each domain's own scale", () => {
    const satRequest = makeRequest({
      goal: { domain: "SAT", focusSkills: [] },
      hardConstraints: {
        verifiedOnly: false,
        minCredentialScore: 1400,
        requiredExpertise: [],
        requireAllAvailability: false,
      },
    });
    const exact = makeMentor("SAT-EXACT", {
      credentials: { ielts: null, sat: { total: 1400 }, hsk: null },
      expertise: ["SAT.MATH"],
    });
    const below = makeMentor("SAT-BELOW", {
      credentials: { ielts: null, sat: { total: 1390 }, hsk: null },
      expertise: ["SAT.MATH"],
    });

    const result = applyHardConstraints(satRequest, [exact, below]);
    expect(result.eligible.map((m) => m.id)).toEqual(["SAT-EXACT"]);
    expect(reasonsFor(result, "SAT-BELOW")).toEqual(["CREDENTIAL_MINIMUM"]);
  });

  it("ignores credentials in other domains", () => {
    // A perfect SAT score must not satisfy an IELTS minimum.
    const mentor = makeMentor("M1", {
      credentials: { ielts: { overall: 6 }, sat: { total: 1600 }, hsk: null },
    });
    expect(reasonsFor(applyHardConstraints(request, [mentor]), "M1")).toEqual([
      "CREDENTIAL_MINIMUM",
    ]);
  });
});

describe("credential three-state semantics", () => {
  const request = makeRequest({
    hardConstraints: {
      verifiedOnly: false,
      minCredentialScore: 7,
      requiredExpertise: [],
      requireAllAvailability: false,
    },
  });

  it("distinguishes explicitly absent from unknown", () => {
    const absent = makeMentor("ABSENT", { credentials: { ielts: null, sat: null, hsk: null } });
    const unknown = makeMentor("UNKNOWN", { credentials: {} });

    expect(credentialKnowledge(absent.credentials, "IELTS")).toBe("ABSENT");
    expect(credentialKnowledge(unknown.credentials, "IELTS")).toBe("UNKNOWN");

    const result = applyHardConstraints(request, [absent, unknown]);
    expect(result.eligible).toEqual([]);
    expect(reasonsFor(result, "ABSENT")).toEqual(["CREDENTIAL_ABSENT"]);
    expect(reasonsFor(result, "UNKNOWN")).toEqual(["CREDENTIAL_UNKNOWN"]);
    expect(result.diagnostics.filteredOut).toEqual({
      CREDENTIAL_ABSENT: 1,
      CREDENTIAL_UNKNOWN: 1,
    });
  });

  it("never assumes an unknown credential meets the minimum", () => {
    const unknown = makeMentor("M1", { credentials: {} });
    expect(applyHardConstraints(request, [unknown]).eligible).toEqual([]);
    expect(satisfiesHardConstraints(request, unknown)).toBe(false);
  });

  it("keeps a mentor with an unknown credential when no minimum is requested", () => {
    // Missing data is a ranking and explanation concern, not an eligibility one.
    const unknown = makeMentor("M1", { credentials: {} });
    const result = applyHardConstraints(makeRequest(), [unknown]);
    expect(result.eligible.map((m) => m.id)).toEqual(["M1"]);
  });

  it("reads the headline score per domain", () => {
    const mentor = makeMentor("M1", {
      credentials: { ielts: { overall: 8 }, sat: { total: 1500 }, hsk: { level: 5 } },
      expertise: ["IELTS.WRITING", "SAT.MATH", "HSK.READING"],
    });
    expect(headlineCredentialScore(mentor.credentials, "IELTS")).toBe(8);
    expect(headlineCredentialScore(mentor.credentials, "SAT")).toBe(1500);
    expect(headlineCredentialScore(mentor.credentials, "HSK")).toBe(5);
  });
});

describe("verification", () => {
  it("removes unverified mentors when verifiedOnly is true", () => {
    const request = makeRequest({
      hardConstraints: { verifiedOnly: true, requiredExpertise: [], requireAllAvailability: false },
    });
    const result = applyHardConstraints(request, [
      makeMentor("VERIFIED", { verified: true }),
      makeMentor("UNVERIFIED", { verified: false }),
    ]);
    expect(result.eligible.map((m) => m.id)).toEqual(["VERIFIED"]);
    expect(reasonsFor(result, "UNVERIFIED")).toEqual(["UNVERIFIED"]);
  });

  it("allows unverified mentors when verifiedOnly is false", () => {
    const result = applyHardConstraints(makeRequest(), [makeMentor("M1", { verified: false })]);
    expect(result.eligible.map((m) => m.id)).toEqual(["M1"]);
  });
});

describe("domain eligibility", () => {
  it("removes mentors who do not teach the requested domain", () => {
    const satOnly = makeMentor("SAT-ONLY", {
      credentials: { ielts: null, sat: { total: 1500 }, hsk: null },
      expertise: ["SAT.MATH"],
    });
    const result = applyHardConstraints(makeRequest(), [satOnly]);
    expect(result.eligible).toEqual([]);
    expect(reasonsFor(result, "SAT-ONLY")).toEqual(["DOMAIN"]);
  });

  it("keeps multi-domain mentors for each domain they teach", () => {
    const multi = makeMentor("MULTI", {
      credentials: { ielts: { overall: 7.5 }, sat: { total: 1500 }, hsk: { level: 5 } },
      expertise: ["IELTS.WRITING", "SAT.MATH", "HSK.READING"],
    });

    for (const [domain, skill] of [
      ["IELTS", "IELTS.WRITING"],
      ["SAT", "SAT.MATH"],
      ["HSK", "HSK.READING"],
    ] as const) {
      const request = makeRequest({ goal: { domain, focusSkills: [skill] } });
      expect(applyHardConstraints(request, [multi]).eligible.map((m) => m.id)).toEqual(["MULTI"]);
    }
  });

  it("judges domain eligibility on expertise, not on holding a credential", () => {
    // Teaching a domain without a filed certificate is plausible; if the student
    // wants proof, that is what minCredentialScore is for.
    const noCredential = makeMentor("M1", { credentials: {}, expertise: ["IELTS.WRITING"] });
    expect(applyHardConstraints(makeRequest(), [noCredential]).eligible).toHaveLength(1);
  });
});

describe("availability overlap", () => {
  const mentor = makeMentor("M1", { availability: ["TUE_19_00", "THU_19_00"] });

  it("accepts a single overlapping slot by default", () => {
    const request = makeRequest({ availability: ["TUE_19_00", "SAT_09_00"] });
    expect(applyHardConstraints(request, [mentor]).eligible).toHaveLength(1);
  });

  it("rejects a mentor with no overlapping slot", () => {
    const request = makeRequest({ availability: ["MON_19_00", "SAT_09_00"] });
    const result = applyHardConstraints(request, [mentor]);
    expect(result.eligible).toEqual([]);
    expect(reasonsFor(result, "M1")).toEqual(["AVAILABILITY"]);
  });

  it("requires every slot when requireAllAvailability is true", () => {
    const partial = makeRequest({
      availability: ["TUE_19_00", "SAT_09_00"],
      hardConstraints: { verifiedOnly: false, requiredExpertise: [], requireAllAvailability: true },
    });
    expect(applyHardConstraints(partial, [mentor]).eligible).toEqual([]);
    expect(reasonsFor(applyHardConstraints(partial, [mentor]), "M1")).toEqual(["AVAILABILITY"]);

    const full = makeRequest({
      availability: ["TUE_19_00", "THU_19_00"],
      hardConstraints: { verifiedOnly: false, requiredExpertise: [], requireAllAvailability: true },
    });
    expect(applyHardConstraints(full, [mentor]).eligible).toHaveLength(1);
  });

  it("does not constrain anything when the student states no availability", () => {
    const noSlots = makeRequest({ availability: [] });
    const busy = makeMentor("BUSY", { availability: [] });
    expect(applyHardConstraints(noSlots, [mentor, busy]).eligible).toHaveLength(2);
  });

  it("removes a mentor with no published availability when slots are requested", () => {
    const request = makeRequest({ availability: ["TUE_19_00"] });
    const busy = makeMentor("BUSY", { availability: [] });
    expect(reasonsFor(applyHardConstraints(request, [busy]), "BUSY")).toEqual(["AVAILABILITY"]);
  });
});

describe("required expertise", () => {
  it("requires every listed skill, not just one", () => {
    const request = makeRequest({
      goal: { domain: "IELTS", focusSkills: [] },
      hardConstraints: {
        verifiedOnly: false,
        requiredExpertise: ["IELTS.WRITING", "IELTS.SPEAKING"],
        requireAllAvailability: false,
      },
    });

    const both = makeMentor("BOTH", { expertise: ["IELTS.WRITING", "IELTS.SPEAKING"] });
    const one = makeMentor("ONE", { expertise: ["IELTS.WRITING"] });

    const result = applyHardConstraints(request, [both, one]);
    expect(result.eligible.map((m) => m.id)).toEqual(["BOTH"]);
    expect(reasonsFor(result, "ONE")).toEqual(["REQUIRED_EXPERTISE"]);
  });
});

/* -------------------------------------------------------------------------- */
/* Multiple failures, diagnostics, determinism                                */
/* -------------------------------------------------------------------------- */

describe("multiple simultaneous failures", () => {
  const request = makeRequest({
    goal: { domain: "IELTS", focusSkills: [] },
    availability: ["MON_08_00"],
    hardConstraints: {
      verifiedOnly: true,
      maxPricePerHour: 100_000,
      minCredentialScore: 8,
      requiredExpertise: ["IELTS.SPEAKING"],
      requireAllAvailability: false,
    },
  });

  const hopeless = makeMentor("HOPELESS", {
    verified: false,
    pricePerHour: 500_000,
    credentials: { ielts: { overall: 6.5 }, sat: null, hsk: null },
    expertise: ["IELTS.WRITING"],
    availability: ["SUN_20_00"],
  });

  it("records every failed constraint, in the fixed constraint order", () => {
    const reasons = reasonsFor(applyHardConstraints(request, [hopeless]), "HOPELESS");
    expect(reasons).toEqual([
      "UNVERIFIED",
      "PRICE",
      "AVAILABILITY",
      "CREDENTIAL_MINIMUM",
      "REQUIRED_EXPERTISE",
    ]);
    const positions = reasons.map((r) => CONSTRAINT_ORDER.indexOf(r));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("counts a mentor once in filteredOut and once per reason in filteredOutByReason", () => {
    const { diagnostics } = applyHardConstraints(request, [hopeless]);
    expect(diagnostics.filteredOut).toEqual({ UNVERIFIED: 1 });
    expect(diagnostics.filteredOutByReason).toEqual({
      UNVERIFIED: 1,
      PRICE: 1,
      AVAILABILITY: 1,
      CREDENTIAL_MINIMUM: 1,
      REQUIRED_EXPERTISE: 1,
    });
  });

  it("keeps filteredOut summing to candidateCount - eligibleCount", () => {
    const mentors = readData<Mentor[]>("mentors.mock.json");
    const { diagnostics } = applyHardConstraints(request, mentors);
    const total = Object.values(diagnostics.filteredOut).reduce((a, b) => a + b, 0);
    expect(total).toBe(diagnostics.candidateCount - diagnostics.eligibleCount);
  });
});

describe("duplicate mentor ids", () => {
  it("keeps the first occurrence and rejects the repeat as INVALID_RECORD", () => {
    const first = makeMentor("DUP");
    const repeat = makeMentor("DUP", { pricePerHour: 150_000 });
    const result = applyHardConstraints(makeRequest(), [first, repeat]);

    expect(result.eligible.map((m) => m.id)).toEqual(["DUP"]);
    expect(result.rejected).toEqual([{ mentorId: "DUP", reasons: ["INVALID_RECORD"] }]);
  });

  it("never emits the same mentor twice", () => {
    const mentors = [makeMentor("A"), makeMentor("A"), makeMentor("A")];
    const { eligible } = applyHardConstraints(makeRequest(), mentors);
    expect(new Set(eligible.map((m) => m.id)).size).toBe(eligible.length);
  });
});

describe("no feasible match", () => {
  it("reports NO_FEASIBLE_MATCH instead of relaxing a constraint", () => {
    const request = makeRequest({
      hardConstraints: {
        verifiedOnly: false,
        maxPricePerHour: 1_000,
        requiredExpertise: [],
        requireAllAvailability: false,
      },
    });
    const mentors = readData<Mentor[]>("mentors.mock.json");
    const result = applyHardConstraints(request, mentors);

    expect(result.status).toBe("NO_FEASIBLE_MATCH");
    expect(result.eligible).toEqual([]);
    expect(result.diagnostics.eligibleCount).toBe(0);
    // The cheapest mentor is still recorded as filtered, not quietly admitted.
    expect(result.diagnostics.filteredOut.PRICE).toBeGreaterThan(0);
  });

  it("reports NO_FEASIBLE_MATCH for an empty candidate set", () => {
    const result = applyHardConstraints(makeRequest(), []);
    expect(result.status).toBe("NO_FEASIBLE_MATCH");
    expect(result.diagnostics).toEqual({
      candidateCount: 0,
      eligibleCount: 0,
      filteredOut: {},
      filteredOutByReason: {},
    });
  });

  it("reports FEASIBLE as soon as one mentor survives", () => {
    const result = applyHardConstraints(makeRequest(), [makeMentor("M1")]);
    expect(result.status).toBe("FEASIBLE");
  });
});

describe("purity and determinism", () => {
  const mentors = readData<Mentor[]>("mentors.mock.json");
  const request = makeRequest({
    availability: ["TUE_19_00"],
    hardConstraints: {
      verifiedOnly: true,
      maxPricePerHour: 300_000,
      requiredExpertise: [],
      requireAllAvailability: false,
    },
  });

  it("returns byte-identical output for identical inputs", () => {
    const a = applyHardConstraints(request, mentors);
    const b = applyHardConstraints(request, mentors);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("does not mutate its inputs", () => {
    const mentorsSnapshot = JSON.stringify(mentors);
    const requestSnapshot = JSON.stringify(request);
    applyHardConstraints(request, mentors);
    expect(JSON.stringify(mentors)).toBe(mentorsSnapshot);
    expect(JSON.stringify(request)).toBe(requestSnapshot);
  });

  it("preserves input order and does no ranking", () => {
    const { eligible } = applyHardConstraints(request, mentors);
    const inputOrder = mentors.filter((m) => eligible.some((e) => e.id === m.id)).map((m) => m.id);
    expect(eligible.map((m) => m.id)).toEqual(inputOrder);

    // A filter that ranked would order by something; assert prices are NOT sorted.
    const prices = eligible.map((m) => m.pricePerHour);
    expect(prices).not.toEqual([...prices].sort((a, b) => a - b));
  });

  it("emits no score, weight or rank anywhere in its output", () => {
    const serialized = JSON.stringify(applyHardConstraints(request, mentors.slice(0, 20)));
    for (const forbidden of ["matchScore", "scoreBreakdown", '"rank"', "weight"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* The invariant                                                              */
/* -------------------------------------------------------------------------- */

describe("hard constraint violation rate", () => {
  /**
   * Independent re-implementation of every hard constraint.
   *
   * Deliberately does not call the filter's own helpers: if both sides shared
   * code, a wrong shared rule would agree with itself and the invariant would
   * prove nothing.
   */
  function violates(request: StudentRequest, mentor: Mentor): string | undefined {
    const { goal, hardConstraints: hard, availability } = request;

    if (!mentor.expertise.some((skill) => skill.startsWith(`${goal.domain}.`))) return "DOMAIN";
    if (hard.verifiedOnly && !mentor.verified) return "UNVERIFIED";
    if (hard.maxPricePerHour !== undefined && mentor.pricePerHour > hard.maxPricePerHour) {
      return "PRICE";
    }

    if (availability.length > 0) {
      const shared = availability.filter((slot) => mentor.availability.includes(slot));
      if (hard.requireAllAvailability) {
        if (shared.length !== availability.length) return "AVAILABILITY";
      } else if (shared.length === 0) {
        return "AVAILABILITY";
      }
    }

    if (hard.minCredentialScore !== undefined) {
      const key = goal.domain.toLowerCase() as "ielts" | "sat" | "hsk";
      const credential = mentor.credentials[key];
      if (credential === undefined || credential === null) return "CREDENTIAL_MISSING";
      const score =
        key === "ielts"
          ? (credential as { overall: number }).overall
          : key === "sat"
            ? (credential as { total: number }).total
            : (credential as { level: number }).level;
      if (score < hard.minCredentialScore) return "CREDENTIAL_MINIMUM";
    }

    for (const skill of hard.requiredExpertise) {
      if (!mentor.expertise.includes(skill)) return "REQUIRED_EXPERTISE";
    }

    return undefined;
  }

  it("is exactly 0% across the full benchmark set", () => {
    const mentors = readData<Mentor[]>("mentors.mock.json");
    const requests = readData<StudentRequest[]>("requests.mock.json");

    let checked = 0;
    let eligibleTotal = 0;
    let infeasible = 0;
    const violations: string[] = [];

    for (const request of requests) {
      const result = applyHardConstraints(request, mentors);
      if (result.status === "NO_FEASIBLE_MATCH") infeasible++;
      eligibleTotal += result.eligible.length;

      for (const mentor of result.eligible) {
        checked++;
        const violation = violates(request, mentor);
        if (violation !== undefined) {
          violations.push(`${request.requestId}/${mentor.id}: ${violation}`);
        }
      }
    }

    expect(violations).toEqual([]);
    // The invariant is only meaningful if the filter actually admitted mentors.
    expect(checked).toBeGreaterThan(10_000);
    expect(eligibleTotal).toBeGreaterThan(0);
    // ...and only meaningful if it also rejected everyone sometimes.
    expect(infeasible).toBeGreaterThan(0);
  });

  it("agrees with the exported audit hook on every candidate", () => {
    const mentors = readData<Mentor[]>("mentors.mock.json").slice(0, 120);
    const requests = readData<StudentRequest[]>("requests.mock.json").slice(0, 60);

    for (const request of requests) {
      const result = applyHardConstraints(request, mentors);
      const eligibleIds = new Set(result.eligible.map((m) => m.id));
      for (const mentor of mentors) {
        expect(satisfiesHardConstraints(request, mentor)).toBe(eligibleIds.has(mentor.id));
      }
    }
  });

  it("never admits a mentor the filter also rejected", () => {
    const mentors = readData<Mentor[]>("mentors.mock.json");
    const requests = readData<StudentRequest[]>("requests.mock.json").slice(0, 100);

    for (const request of requests) {
      const { eligible, rejected, diagnostics } = applyHardConstraints(request, mentors);
      const eligibleIds = new Set(eligible.map((m) => m.id));
      for (const { mentorId, reasons } of rejected) {
        expect(reasons.length).toBeGreaterThan(0);
        // A duplicate id is the one case where the same id legitimately appears
        // as both eligible (first copy) and rejected (the repeat).
        if (!reasons.includes("INVALID_RECORD")) expect(eligibleIds.has(mentorId)).toBe(false);
      }
      expect(eligible.length + rejected.length).toBe(diagnostics.candidateCount);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Adversarial fixtures as executable assertions                              */
/* -------------------------------------------------------------------------- */

describe("Phase 3 adversarial fixtures, executed", () => {
  const cases = readData<AdversarialCase[]>("adversarial.mock.json");
  const pool = readData<Mentor[]>("mentors.mock.json");

  /** Returns every case carrying a given label. */
  function casesFor(label: string): AdversarialCase[] {
    const matching = cases.filter((c) => c.label === label);
    expect(matching.length).toBeGreaterThan(0);
    return matching;
  }

  /** Validates a case's request, failing the test if the fixture is malformed. */
  function requestOf(adversarialCase: AdversarialCase): StudentRequest {
    const result = validateStudentRequest(adversarialCase.request);
    if (!result.ok) {
      throw new Error(`${adversarialCase.id}: ${JSON.stringify(result.issues)}`);
    }
    return result.value;
  }

  /** Validates a case's mentor payload, failing the test if malformed. */
  function mentorsOf(adversarialCase: AdversarialCase): Mentor[] {
    const result = validateMentors(adversarialCase.mentors);
    if (!result.ok) throw new Error(`${adversarialCase.id}: ${JSON.stringify(result.issues)}`);
    return result.value;
  }

  it("NO_MENTOR_WITHIN_BUDGET: nobody is admitted, and PRICE is the reason", () => {
    for (const adversarialCase of casesFor("NO_MENTOR_WITHIN_BUDGET")) {
      const result = applyHardConstraints(requestOf(adversarialCase), pool);
      expect(result.status, adversarialCase.id).toBe("NO_FEASIBLE_MATCH");
      expect(result.diagnostics.filteredOutByReason.PRICE).toBe(pool.length);
    }
  });

  it("NO_COMPATIBLE_AVAILABILITY: nobody is admitted on AVAILABILITY", () => {
    for (const adversarialCase of casesFor("NO_COMPATIBLE_AVAILABILITY")) {
      const result = applyHardConstraints(requestOf(adversarialCase), pool);
      expect(result.status, adversarialCase.id).toBe("NO_FEASIBLE_MATCH");
      expect(result.diagnostics.filteredOutByReason.AVAILABILITY).toBe(pool.length);
    }
  });

  it("ALL_CANDIDATES_UNVERIFIED: every candidate is removed as UNVERIFIED", () => {
    for (const adversarialCase of casesFor("ALL_CANDIDATES_UNVERIFIED")) {
      const mentors = mentorsOf(adversarialCase);
      const result = applyHardConstraints(requestOf(adversarialCase), mentors);
      expect(result.status, adversarialCase.id).toBe("NO_FEASIBLE_MATCH");
      expect(result.diagnostics.filteredOutByReason.UNVERIFIED).toBe(mentors.length);
      for (const rejection of result.rejected) expect(rejection.reasons).toContain("UNVERIFIED");
    }
  });

  it("MISSING_CREDENTIAL: removed as UNKNOWN, never as ABSENT", () => {
    for (const adversarialCase of casesFor("MISSING_CREDENTIAL")) {
      const mentors = mentorsOf(adversarialCase);
      const result = applyHardConstraints(requestOf(adversarialCase), mentors);

      expect(result.status, adversarialCase.id).toBe("NO_FEASIBLE_MATCH");
      expect(result.diagnostics.filteredOutByReason.CREDENTIAL_UNKNOWN).toBe(mentors.length);
      expect(result.diagnostics.filteredOutByReason.CREDENTIAL_ABSENT).toBeUndefined();
      expect(result.diagnostics.filteredOutByReason.CREDENTIAL_MINIMUM).toBeUndefined();
    }
  });

  it("MISSING_CREDENTIAL: the same mentors stay eligible without a minimum", () => {
    for (const adversarialCase of casesFor("MISSING_CREDENTIAL")) {
      const mentors = mentorsOf(adversarialCase);
      const request = makeRequest({ requestId: adversarialCase.id });
      const result = applyHardConstraints(request, mentors);
      // Unknown data removes a mentor only when a constraint actually needs it.
      expect(result.eligible).toHaveLength(mentors.length);
    }
  });

  it("EMPTY_PREFERENCE_SET: a bare domain still yields candidates", () => {
    for (const adversarialCase of casesFor("EMPTY_PREFERENCE_SET")) {
      const request = requestOf(adversarialCase);
      const result = applyHardConstraints(request, pool);
      expect(result.status, adversarialCase.id).toBe("FEASIBLE");
      for (const mentor of result.eligible) {
        expect(mentor.expertise.some((s) => s.startsWith(`${request.goal.domain}.`))).toBe(true);
      }
      // Only the domain constraint may have fired.
      expect(Object.keys(result.diagnostics.filteredOut)).toEqual(["DOMAIN"]);
    }
  });

  it("IMPOSSIBLE_HARD_CONSTRAINTS: infeasible, with several reasons recorded", () => {
    for (const adversarialCase of casesFor("IMPOSSIBLE_HARD_CONSTRAINTS")) {
      const result = applyHardConstraints(requestOf(adversarialCase), pool);
      expect(result.status, adversarialCase.id).toBe("NO_FEASIBLE_MATCH");
      expect(Object.keys(result.diagnostics.filteredOutByReason).length).toBeGreaterThan(2);
      // Every candidate is accounted for; none is admitted "closest wins".
      expect(result.rejected).toHaveLength(pool.length);
    }
  });

  it("RARE_DOMAIN_COMBINATION: the shortage is reported, not substituted", () => {
    for (const adversarialCase of casesFor("RARE_DOMAIN_COMBINATION")) {
      const mentors = mentorsOf(adversarialCase);
      const request = requestOf(adversarialCase);
      const result = applyHardConstraints(request, mentors);

      expect(result.status, adversarialCase.id).toBe("NO_FEASIBLE_MATCH");
      // No mentor from another domain is offered as a consolation prize.
      expect(result.eligible).toEqual([]);
      expect(result.diagnostics.filteredOutByReason.DOMAIN).toBeGreaterThan(0);
    }
  });

  it("DUPLICATE_MENTOR_IDS: rejected at validation, and de-duplicated if forced through", () => {
    for (const adversarialCase of casesFor("DUPLICATE_MENTOR_IDS")) {
      // The dataset is invalid, and validateMentors is what an adapter would call.
      expect(validateMentors(adversarialCase.mentors).ok, adversarialCase.id).toBe(false);

      // Even if a caller ignores that, the filter must not emit a mentor twice.
      const raw = adversarialCase.mentors as unknown[];
      const forced = raw.map((mentor) => {
        const result = validateMentors([mentor]);
        if (!result.ok) throw new Error(`${adversarialCase.id}: unexpected invalid record`);
        return result.value[0] as Mentor;
      });

      const result = applyHardConstraints(makeRequest(), forced);
      const ids = result.eligible.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(result.diagnostics.filteredOutByReason.INVALID_RECORD).toBe(1);
    }
  });

  it("UNKNOWN_SKILL and CORRUPTED_RECORD never reach the filter", () => {
    for (const adversarialCase of [...casesFor("UNKNOWN_SKILL"), ...casesFor("CORRUPTED_RECORD")]) {
      const requestValid =
        adversarialCase.request === undefined ||
        validateStudentRequest(adversarialCase.request).ok;
      const mentorsValid =
        adversarialCase.mentors === undefined || validateMentors(adversarialCase.mentors).ok;

      // Validation is the boundary; the filter is only ever handed clean input.
      expect(requestValid && mentorsValid, adversarialCase.id).toBe(false);
    }
  });
});
