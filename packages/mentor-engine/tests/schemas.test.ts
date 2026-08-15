/**
 * Phase 1 — canonical domain model & validation.
 *
 * Every case listed under "Test Validation" in PLAN.md §Phase 1 is covered
 * here, plus the request-side cross-field rules.
 */

import { describe, expect, it } from "vitest";
import {
  AVAILABILITY_SLOT_PATTERN,
  DOMAINS,
  ENGINE_VERSION,
  SCHEMA_BOUNDS,
  SCHEMA_VERSION,
  credentialKnowledge,
  domainOfSkill,
  getCredential,
  ieltsOverallFromSections,
  isAvailabilitySlot,
  validateMentor,
  validateMentors,
  validateStudentRequest,
} from "../src/index.js";
import type { ValidationIssue } from "../src/index.js";
import {
  hskMentor,
  ieltsMentor,
  ieltsRequest,
  minimalMentor,
  minimalRequest,
  multiDomainMentor,
  satMentor,
  withField,
} from "./fixtures.js";

/** Asserts validation failed and returns the issues for further assertions. */
function expectInvalid(result: { ok: boolean; issues?: ValidationIssue[] }): ValidationIssue[] {
  expect(result.ok).toBe(false);
  return result.issues ?? [];
}

describe("versioning", () => {
  it("exposes stable schema and engine version constants", () => {
    expect(SCHEMA_VERSION).toBe("mentor-engine-schema-v1.0.0");
    expect(ENGINE_VERSION).toBe("mentor-engine-v1.0.0");
  });
});

describe("valid mentors", () => {
  it("accepts a valid IELTS mentor", () => {
    const result = validateMentor(ieltsMentor);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.credentials.ielts?.writing).toBe(7.5);
      expect(result.value.expertise).toEqual(["IELTS.WRITING", "IELTS.READING"]);
    }
  });

  it("accepts a valid SAT mentor", () => {
    expect(validateMentor(satMentor).ok).toBe(true);
  });

  it("accepts a valid HSK mentor", () => {
    expect(validateMentor(hskMentor).ok).toBe(true);
  });

  it("accepts a multi-domain mentor", () => {
    const result = validateMentor(multiDomainMentor);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.credentials.hsk?.level).toBe(4);
      expect(result.value.credentials.sat?.total).toBe(1450);
    }
  });

  it("accepts a mentor with every optional field omitted", () => {
    const result = validateMentor(minimalMentor);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Absent means unknown: no default is invented for the caller.
      expect(result.value.rating).toBeUndefined();
      expect(result.value.teachingStyles).toBeUndefined();
      expect(result.value.credentials.ielts).toBeUndefined();
    }
  });

  it("accepts an explicit null credential (known absent)", () => {
    expect(validateMentor(withField(hskMentor, "credentials.ielts", null)).ok).toBe(true);
  });

  it("accepts a free mentor (price 0) and an empty availability list", () => {
    expect(validateMentor(multiDomainMentor).ok).toBe(true);
    expect(validateMentor(hskMentor).ok).toBe(true);
  });
});

describe("credential knowledge semantics (omitted = UNKNOWN, null = ABSENT, object = PRESENT)", () => {
  /** Parses a mentor fixture, failing the test if it is invalid. */
  function parse(input: unknown) {
    const result = validateMentor(input);
    if (!result.ok) throw new Error(`fixture failed validation: ${JSON.stringify(result.issues)}`);
    return result.value;
  }

  it("reports PRESENT for a supplied credential object", () => {
    expect(credentialKnowledge(parse(ieltsMentor).credentials, "IELTS")).toBe("PRESENT");
    expect(credentialKnowledge(parse(hskMentor).credentials, "HSK")).toBe("PRESENT");
  });

  it("reports ABSENT for an explicit null", () => {
    expect(credentialKnowledge(parse(ieltsMentor).credentials, "SAT")).toBe("ABSENT");
    expect(credentialKnowledge(parse(ieltsMentor).credentials, "HSK")).toBe("ABSENT");
  });

  it("reports UNKNOWN for an omitted key", () => {
    // hskMentor omits ielts/sat entirely; minimalMentor omits all three.
    expect(credentialKnowledge(parse(hskMentor).credentials, "IELTS")).toBe("UNKNOWN");
    expect(credentialKnowledge(parse(hskMentor).credentials, "SAT")).toBe("UNKNOWN");
    for (const domain of DOMAINS) {
      expect(credentialKnowledge(parse(minimalMentor).credentials, domain)).toBe("UNKNOWN");
    }
  });

  it("keeps ABSENT and UNKNOWN distinguishable after validation", () => {
    const absent = parse(withField(minimalMentor, "credentials", { ielts: null }));
    const unknown = parse(withField(minimalMentor, "credentials", {}));

    expect(credentialKnowledge(absent.credentials, "IELTS")).toBe("ABSENT");
    expect(credentialKnowledge(unknown.credentials, "IELTS")).toBe("UNKNOWN");
    // Both read as falsy — which is exactly why callers must not use truthiness.
    expect(absent.credentials.ielts ?? undefined).toBeUndefined();
    expect(unknown.credentials.ielts).toBeUndefined();
  });

  it("does not materialise omitted credential keys during validation", () => {
    const parsed = parse(withField(minimalMentor, "credentials", { ielts: null }));
    expect(Object.hasOwn(parsed.credentials, "ielts")).toBe(true);
    expect(Object.hasOwn(parsed.credentials, "sat")).toBe(false);
    expect(Object.hasOwn(parsed.credentials, "hsk")).toBe(false);
  });

  it("survives a JSON round-trip without collapsing ABSENT into UNKNOWN", () => {
    const original = parse(withField(minimalMentor, "credentials", { ielts: null }));
    const roundTripped = parse(JSON.parse(JSON.stringify(original)));
    expect(credentialKnowledge(roundTripped.credentials, "IELTS")).toBe("ABSENT");
    expect(credentialKnowledge(roundTripped.credentials, "SAT")).toBe("UNKNOWN");
  });

  it("getCredential returns the credential only when present", () => {
    const mentor = parse(ieltsMentor);
    expect(getCredential(mentor.credentials, "IELTS")).toEqual(
      expect.objectContaining({ overall: 8.0 }),
    );
    expect(getCredential(mentor.credentials, "SAT")).toBeUndefined();
    expect(getCredential(parse(minimalMentor).credentials, "SAT")).toBeUndefined();
  });
});

describe("credential range validation", () => {
  it("rejects IELTS 9.5 (above the maximum band)", () => {
    const issues = expectInvalid(
      validateMentor(withField(ieltsMentor, "credentials.ielts.overall", 9.5)),
    );
    expect(issues[0]?.path).toBe("credentials.ielts.overall");
  });

  it("rejects IELTS 7.3 (not a half-band step)", () => {
    const issues = expectInvalid(
      validateMentor(withField(ieltsMentor, "credentials.ielts.overall", 7.3)),
    );
    expect(issues[0]?.message).toMatch(/multiple of 0\.5/);
  });

  it("rejects a negative IELTS band", () => {
    expectInvalid(validateMentor(withField(ieltsMentor, "credentials.ielts.writing", -1)));
  });

  it("accepts the IELTS boundary bands 0.0 and 9.0", () => {
    // Overall-only credentials, so this exercises the range and nothing else —
    // overriding `overall` alone on a four-section fixture would (correctly)
    // trip the internal-consistency rule instead.
    for (const overall of [0, 9]) {
      expect(validateMentor(withField(ieltsMentor, "credentials.ielts", { overall })).ok).toBe(true);
    }
  });

  it("rejects SAT 1700 (above the maximum total)", () => {
    const issues = expectInvalid(validateMentor(withField(satMentor, "credentials.sat", { total: 1700 })));
    expect(issues[0]?.path).toBe("credentials.sat.total");
  });

  it("rejects a SAT section score of 900", () => {
    expectInvalid(
      validateMentor(withField(satMentor, "credentials.sat", { total: 1500, math: 900, readingWriting: 600 })),
    );
  });

  it("rejects a SAT total inconsistent with its section scores", () => {
    const issues = expectInvalid(
      validateMentor(withField(satMentor, "credentials.sat", { total: 1600, math: 800, readingWriting: 700 })),
    );
    expect(issues[0]?.message).toMatch(/math \+ readingWriting/);
  });

  it("rejects HSK 7 (above the maximum level)", () => {
    const issues = expectInvalid(validateMentor(withField(hskMentor, "credentials.hsk.level", 7)));
    expect(issues[0]?.path).toBe("credentials.hsk.level");
  });

  it("rejects a non-integer HSK level", () => {
    expectInvalid(validateMentor(withField(hskMentor, "credentials.hsk.level", 4.5)));
  });

  it("accepts the HSK boundary levels 1 and 6", () => {
    expect(validateMentor(withField(hskMentor, "credentials.hsk.level", 1)).ok).toBe(true);
    expect(validateMentor(withField(hskMentor, "credentials.hsk.level", 6)).ok).toBe(true);
  });
});

describe("IELTS internal consistency", () => {
  /** Builds a mentor carrying the given IELTS credential. */
  function withIelts(credential: Record<string, number>) {
    return withField(ieltsMentor, "credentials.ielts", credential);
  }

  it("computes the overall band with IELTS rounding (ties up)", () => {
    // Mean exactly on a quarter rounds up to the next half band.
    expect(ieltsOverallFromSections({ listening: 7, reading: 7, writing: 7.5, speaking: 7.5 })).toBe(
      7.5,
    );
    // 7.25 -> 7.5
    expect(ieltsOverallFromSections({ listening: 8, reading: 7, writing: 7, speaking: 7 })).toBe(7.5);
    // 7.75 -> 8.0
    expect(ieltsOverallFromSections({ listening: 8, reading: 8, writing: 8, speaking: 7 })).toBe(8);
    // 7.125 -> 7.0 (below the quarter, rounds down)
    expect(ieltsOverallFromSections({ listening: 7.5, reading: 7, writing: 7, speaking: 7 })).toBe(7);
    expect(ieltsOverallFromSections({ listening: 9, reading: 9, writing: 9, speaking: 9 })).toBe(9);
    expect(ieltsOverallFromSections({ listening: 0, reading: 0, writing: 0, speaking: 0 })).toBe(0);
  });

  it("accepts a credential whose overall matches its four sections", () => {
    expect(
      validateMentor(
        withIelts({ overall: 7.5, listening: 8, reading: 7.5, writing: 7, speaking: 7.5 }),
      ).ok,
    ).toBe(true);
  });

  /**
   * Real records from the seed-42 dataset before the rule existed. Each one
   * declared an overall its own sections do not support.
   */
  const PREVIOUSLY_ACCEPTED_INCONSISTENT = [
    { id: "M0003", overall: 7, listening: 7, reading: 6.5, writing: 6.5, speaking: 6.5, implied: 6.5 },
    { id: "M0020", overall: 7, listening: 7.5, reading: 7.5, writing: 7, speaking: 7.5, implied: 7.5 },
    { id: "M0024", overall: 7, listening: 7, reading: 7, writing: 6, speaking: 6.5, implied: 6.5 },
    { id: "M0027", overall: 8, listening: 7.5, reading: 8, writing: 7, speaking: 7.5, implied: 7.5 },
  ] as const;

  it.each(PREVIOUSLY_ACCEPTED_INCONSISTENT)(
    "rejects $id: declared $overall, sections imply $implied",
    ({ id: _id, implied, ...credential }) => {
      const issues = expectInvalid(validateMentor(withIelts({ ...credential })));
      expect(issues[0]?.path).toBe("credentials.ielts.overall");
      expect(issues[0]?.message).toContain(`implied by its four section bands`);
      expect(issues[0]?.message).toContain(String(implied));
    },
  );

  it("rejects an overall that is too high or too low by one band", () => {
    const sections = { listening: 7, reading: 7, writing: 7, speaking: 7 };
    expect(validateMentor(withIelts({ overall: 7, ...sections })).ok).toBe(true);
    expectInvalid(validateMentor(withIelts({ overall: 7.5, ...sections })));
    expectInvalid(validateMentor(withIelts({ overall: 6.5, ...sections })));
  });

  it("still accepts an overall-only credential", () => {
    expect(validateMentor(withIelts({ overall: 7.5 })).ok).toBe(true);
  });

  it("still accepts partially specified sections, which cannot be checked", () => {
    // One unknown section means the average is unknowable; do not guess at it.
    expect(validateMentor(withIelts({ overall: 8, listening: 6, reading: 6 })).ok).toBe(true);
    expect(
      validateMentor(withIelts({ overall: 8, listening: 6, reading: 6, writing: 6 })).ok,
    ).toBe(true);
  });

  it("checks the rule only once all four sections are present", () => {
    const full = { overall: 8, listening: 6, reading: 6, writing: 6, speaking: 6 };
    expectInvalid(validateMentor(withIelts(full)));
    const { speaking: _speaking, ...partial } = full;
    expect(validateMentor(withIelts(partial)).ok).toBe(true);
  });
});

describe("scalar field validation", () => {
  it("rejects a negative price", () => {
    const issues = expectInvalid(validateMentor(withField(ieltsMentor, "pricePerHour", -1)));
    expect(issues[0]?.path).toBe("pricePerHour");
  });

  it("rejects a non-integer price", () => {
    expectInvalid(validateMentor(withField(ieltsMentor, "pricePerHour", 180000.5)));
  });

  it("rejects a rating above 5", () => {
    const issues = expectInvalid(validateMentor(withField(ieltsMentor, "rating", 5.1)));
    expect(issues[0]?.path).toBe("rating");
  });

  it("rejects a negative rating", () => {
    expectInvalid(validateMentor(withField(ieltsMentor, "rating", -0.1)));
  });

  it("rejects an empty mentor id", () => {
    const issues = expectInvalid(validateMentor(withField(ieltsMentor, "id", "")));
    expect(issues[0]?.path).toBe("id");
  });

  it("rejects a blank (whitespace-only) mentor id", () => {
    expectInvalid(validateMentor(withField(ieltsMentor, "id", "   ")));
  });

  it("rejects an implausible birth year", () => {
    expectInvalid(validateMentor(withField(ieltsMentor, "birthYear", 1800)));
    expectInvalid(validateMentor(withField(ieltsMentor, "birthYear", SCHEMA_BOUNDS.birthYear.max + 1)));
  });

  it("rejects negative teaching experience", () => {
    expectInvalid(validateMentor(withField(ieltsMentor, "teachingExperienceMonths", -3)));
  });
});

describe("enumerated field validation", () => {
  it("rejects an invalid availability slot", () => {
    const issues = expectInvalid(
      validateMentor(withField(ieltsMentor, "availability", ["Tuesday 7pm"])),
    );
    expect(issues[0]?.path).toBe("availability.0");
  });

  it("rejects malformed slot variants", () => {
    for (const slot of ["TUE_19", "TUE_19_15", "TUE_25_00", "tue_19_00", "TUE-19-00"]) {
      expect(isAvailabilitySlot(slot)).toBe(false);
      expectInvalid(validateMentor(withField(ieltsMentor, "availability", [slot])));
    }
  });

  it("accepts every canonical slot boundary", () => {
    for (const slot of ["MON_00_00", "SUN_23_30", "SAT_09_00"]) {
      expect(AVAILABILITY_SLOT_PATTERN.test(slot)).toBe(true);
    }
  });

  it("rejects an unknown skill", () => {
    expectInvalid(validateMentor(withField(ieltsMentor, "expertise", ["IELTS.GRAMMAR"])));
  });

  it("rejects an unknown teaching style", () => {
    expectInvalid(validateMentor(withField(ieltsMentor, "teachingStyles", ["CHILL"])));
  });

  it("rejects an unknown gender value", () => {
    expectInvalid(validateMentor(withField(ieltsMentor, "gender", "F")));
  });

  it("rejects duplicate expertise and duplicate availability entries", () => {
    expectInvalid(
      validateMentor(withField(ieltsMentor, "expertise", ["IELTS.WRITING", "IELTS.WRITING"])),
    );
    expectInvalid(
      validateMentor(withField(ieltsMentor, "availability", ["TUE_19_00", "TUE_19_00"])),
    );
  });

  it("rejects an empty expertise list", () => {
    expectInvalid(validateMentor(withField(ieltsMentor, "expertise", [])));
  });

  it("rejects unknown top-level keys instead of silently dropping them", () => {
    const issues = expectInvalid(validateMentor({ ...ieltsMentor, hourlyRate: 999 }));
    expect(issues.some((i) => i.message.toLowerCase().includes("unrecognized"))).toBe(true);
  });

  it("rejects a missing required field", () => {
    expectInvalid(validateMentor(withField(ieltsMentor, "verified", undefined)));
    expectInvalid(validateMentor(withField(ieltsMentor, "credentials", undefined)));
  });
});

describe("mentor list validation", () => {
  it("accepts a list of distinct mentors", () => {
    const result = validateMentors([ieltsMentor, satMentor, hskMentor]);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toHaveLength(3);
  });

  it("rejects duplicate mentor ids", () => {
    const issues = expectInvalid(validateMentors([ieltsMentor, satMentor, ieltsMentor]));
    expect(issues[0]?.path).toBe("2.id");
    expect(issues[0]?.message).toMatch(/Duplicate mentor id "M001"/);
  });

  it("reports the index of an invalid record", () => {
    const issues = expectInvalid(
      validateMentors([ieltsMentor, withField(satMentor, "pricePerHour", -5)]),
    );
    expect(issues[0]?.path).toBe("1.pricePerHour");
  });
});

describe("student request validation", () => {
  it("accepts a complete request", () => {
    const result = validateStudentRequest(ieltsRequest);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.hardConstraints.maxPricePerHour).toBe(200000);
      expect(result.value.softPreferences.teachingStyles).toEqual(["PATIENT"]);
    }
  });

  it("applies defaults for omitted optional sections", () => {
    const result = validateStudentRequest(minimalRequest);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.goal.focusSkills).toEqual([]);
      expect(result.value.hardConstraints.verifiedOnly).toBe(false);
      expect(result.value.hardConstraints.requiredExpertise).toEqual([]);
      expect(result.value.availability).toEqual([]);
      expect(result.value.softPreferences.languages).toEqual([]);
      expect(result.value.additionalPreferences).toEqual([]);
    }
  });

  it("preserves free-text criteria verbatim", () => {
    const raw = "muốn mentor nói chuyện chill";
    const result = validateStudentRequest({ ...ieltsRequest, additionalPreferences: [raw] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.additionalPreferences).toEqual([raw]);
  });

  it("rejects an empty request id", () => {
    expectInvalid(validateStudentRequest(withField(ieltsRequest, "requestId", "")));
  });

  it("rejects an unknown domain", () => {
    expectInvalid(validateStudentRequest(withField(ieltsRequest, "goal.domain", "TOEFL")));
  });

  it("rejects a focus skill from another domain", () => {
    const issues = expectInvalid(
      validateStudentRequest(withField(ieltsRequest, "goal.focusSkills", ["SAT.MATH"])),
    );
    expect(issues[0]?.path).toBe("goal.focusSkills.0");
  });

  it("rejects a target score that is invalid on the goal domain's scale", () => {
    const issues = expectInvalid(
      validateStudentRequest(withField(ieltsRequest, "goal.targetScore", 1400)),
    );
    expect(issues[0]?.path).toBe("goal.targetScore");
    expect(issues[0]?.message).toMatch(/not a valid IELTS score/);
  });

  it("validates scores against the SAT scale for SAT goals", () => {
    const satRequest = { requestId: "R003", goal: { domain: "SAT", targetScore: 1500 } };
    expect(validateStudentRequest(satRequest).ok).toBe(true);
    expectInvalid(validateStudentRequest({ ...satRequest, goal: { domain: "SAT", targetScore: 7 } }));
  });

  it("rejects a credential minimum expressed on the wrong scale", () => {
    const issues = expectInvalid(
      validateStudentRequest(withField(ieltsRequest, "hardConstraints.minCredentialScore", 1200)),
    );
    expect(issues[0]?.path).toBe("hardConstraints.minCredentialScore");
  });

  it("rejects required expertise from another domain", () => {
    expectInvalid(
      validateStudentRequest(
        withField(ieltsRequest, "hardConstraints.requiredExpertise", ["HSK.READING"]),
      ),
    );
  });

  it("rejects a negative budget and an invalid availability slot", () => {
    expectInvalid(validateStudentRequest(withField(ieltsRequest, "hardConstraints.maxPricePerHour", -1)));
    expectInvalid(validateStudentRequest(withField(ieltsRequest, "availability", ["THU_19_45"])));
  });

  it("rejects unknown top-level request keys", () => {
    expectInvalid(validateStudentRequest({ ...ieltsRequest, budget: 200000 }));
  });
});

describe("validation reporting", () => {
  it("returns deterministic, sorted issues for the same invalid input", () => {
    const broken = { ...ieltsMentor, id: "", pricePerHour: -5, rating: 9 };
    const first = expectInvalid(validateMentor(broken));
    const second = expectInvalid(validateMentor(broken));
    expect(first).toEqual(second);
    expect(first.map((i) => i.path)).toEqual([...first.map((i) => i.path)].sort());
    expect(first).toHaveLength(3);
  });
});

describe("skill helpers", () => {
  it("derives the owning domain of a canonical skill", () => {
    expect(domainOfSkill("IELTS.WRITING")).toBe("IELTS");
    expect(domainOfSkill("SAT.READING_WRITING")).toBe("SAT");
    expect(domainOfSkill("HSK.LISTENING")).toBe("HSK");
  });
});
