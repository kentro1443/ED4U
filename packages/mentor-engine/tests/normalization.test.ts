/**
 * Phase 2 — ontology, normalization and unknown-input handling.
 *
 * Covers every case listed under "Test Validation" in PLAN.md §Phase 2, plus
 * the invariants the Definition of Done asks for: versioned ontology, closed
 * execution, preserved unknown input, representable ambiguity, reportable
 * contradictions, and computable coverage.
 */

import { describe, expect, it } from "vitest";
import {
  ALIASES_VERSION,
  ALIAS_CATEGORIES,
  DOMAINS,
  GENDERS,
  LANGUAGES,
  ONTOLOGY_VERSION,
  SKILLS,
  TEACHING_STYLES,
  UNRESOLVED_REASONS,
  WEEKDAYS,
  aliases,
  canonicalizeAvailabilitySlot,
  canonicalizePrice,
  canonicalizeSkill,
  computeCoverage,
  foldKey,
  lookupAlias,
  ontology,
  resolveStudentRequest,
  skillsForSuffix,
} from "../src/index.js";
import type { RawStudentRequest, ResolvedRequest } from "../src/index.js";

/** Finds a resolved criterion by its original text. */
function resolvedFor(result: ResolvedRequest, raw: string) {
  return result.resolution.resolved.find((c) => c.raw === raw);
}

/** Finds an unresolved criterion by its original text. */
function unresolvedFor(result: ResolvedRequest, raw: string) {
  return result.resolution.unresolved.find((c) => c.raw === raw);
}

/** A minimal IELTS request, extended per test. */
function request(overrides: RawStudentRequest = {}): RawStudentRequest {
  return { requestId: "R001", goal: { domain: "IELTS" }, ...overrides };
}

/* -------------------------------------------------------------------------- */

describe("ontology versioning and integrity", () => {
  it("is versioned", () => {
    expect(ONTOLOGY_VERSION).toBe("ontology.v1");
    expect(ALIASES_VERSION).toBe("aliases.v1");
    expect(aliases.ontologyVersion).toBe(ONTOLOGY_VERSION);
  });

  it("agrees with the Phase 1 canonical vocabularies", () => {
    expect(ontology.domains).toEqual([...DOMAINS]);
    expect(Object.values(ontology.skills).flat().sort()).toEqual([...SKILLS].sort());
    expect(ontology.teachingStyles).toEqual([...TEACHING_STYLES]);
    expect(ontology.languages).toEqual([...LANGUAGES]);
    expect(ontology.genders).toEqual([...GENDERS]);
    expect(ontology.availability.weekdays).toEqual([...WEEKDAYS]);
  });

  it("keeps the alias tables outside code and pointing at real canonical values", () => {
    const canonicalByCategory: Record<string, readonly string[]> = {
      domain: DOMAINS,
      skill: SKILLS,
      skillSuffix: SKILLS.map((s) => s.split(".")[1] as string),
      teachingStyle: TEACHING_STYLES,
      language: LANGUAGES,
      gender: GENDERS,
      weekday: WEEKDAYS,
    };

    for (const [category, valid] of Object.entries(canonicalByCategory)) {
      const table = aliases[category as keyof typeof aliases] as Record<string, string>;
      for (const [alias, canonical] of Object.entries(table)) {
        expect(valid, `${category} alias "${alias}" -> ${canonical}`).toContain(canonical);
      }
    }
  });

  it("declares every alias category it exposes", () => {
    for (const category of ALIAS_CATEGORIES) {
      expect(Object.keys(aliases)).toContain(category);
    }
  });

  it("routes credential-field aliases to fields the ontology declares", () => {
    for (const canonical of Object.values(aliases.credentialField)) {
      const [domain, field] = canonical.split(".") as [keyof typeof ontology.credentialFields, string];
      expect(ontology.credentialFields[domain].fields).toContain(field);
    }
  });
});

describe("text folding", () => {
  it("is case-insensitive", () => {
    expect(foldKey("IELTS")).toBe(foldKey("ielts"));
    expect(foldKey("Kiên Nhẫn")).toBe(foldKey("KIÊN NHẪN"));
  });

  it("ignores whitespace and separator differences", () => {
    expect(foldKey("  ielts   writing ")).toBe("ielts writing");
    expect(foldKey("ielts_writing")).toBe("ielts writing");
    expect(foldKey("ielts-writing")).toBe("ielts writing");
  });

  it("strips Vietnamese diacritics, including đ", () => {
    expect(foldKey("kiên nhẫn")).toBe("kien nhan");
    expect(foldKey("đọc")).toBe("doc");
  });

  it("returns an empty key for blank input", () => {
    expect(foldKey("   ")).toBe("");
  });
});

describe("alias resolution", () => {
  it("resolves English aliases", () => {
    expect(lookupAlias("teachingStyle", "patient")).toEqual(["PATIENT"]);
    expect(lookupAlias("domain", "ielts")).toEqual(["IELTS"]);
    expect(lookupAlias("language", "english")).toEqual(["EN"]);
  });

  it("resolves Vietnamese aliases, accented or not", () => {
    expect(lookupAlias("teachingStyle", "kiên nhẫn")).toEqual(["PATIENT"]);
    expect(lookupAlias("teachingStyle", "kien nhan")).toEqual(["PATIENT"]);
    expect(lookupAlias("language", "tiếng trung")).toEqual(["ZH"]);
    expect(lookupAlias("weekday", "thứ 3")).toEqual(["TUE"]);
  });

  it("resolves case and whitespace variants to the same canonical value", () => {
    for (const variant of ["IELTS Writing", "ielts  writing", "ielts_writing", "IELTS.WRITING"]) {
      expect(canonicalizeSkill(variant)).toEqual({ kind: "MATCH", canonical: "IELTS.WRITING" });
    }
  });

  it("returns no candidates for text outside the tables", () => {
    expect(lookupAlias("teachingStyle", "chill")).toEqual([]);
  });
});

describe("skill canonicalization with and without domain context", () => {
  it("disambiguates a short skill using the known domain", () => {
    expect(canonicalizeSkill("Writing", "IELTS")).toEqual({
      kind: "MATCH",
      canonical: "IELTS.WRITING",
    });
    expect(canonicalizeSkill("viết", "HSK")).toEqual({ kind: "MATCH", canonical: "HSK.WRITING" });
  });

  it("reports ambiguity when no domain disambiguates a short skill", () => {
    expect(canonicalizeSkill("writing")).toEqual({
      kind: "AMBIGUOUS",
      candidates: ["HSK.WRITING", "IELTS.WRITING"],
    });
  });

  it("resolves a short skill that only one domain offers", () => {
    expect(canonicalizeSkill("math")).toEqual({ kind: "MATCH", canonical: "SAT.MATH" });
    expect(skillsForSuffix("SPEAKING")).toEqual(["IELTS.SPEAKING"]);
  });

  it("reports a known skill that the requested domain does not have", () => {
    expect(canonicalizeSkill("speaking", "HSK")).toEqual({
      kind: "NOT_IN_DOMAIN",
      candidates: ["IELTS.SPEAKING"],
    });
  });

  it("reports genuinely unknown skills", () => {
    expect(canonicalizeSkill("grammar", "IELTS")).toEqual({ kind: "UNKNOWN" });
  });
});

describe("availability canonicalization", () => {
  it("accepts the canonical form unchanged", () => {
    expect(canonicalizeAvailabilitySlot("TUE_19_00")).toEqual({
      kind: "MATCH",
      canonical: "TUE_19_00",
    });
  });

  it("accepts English and Vietnamese weekday plus time forms", () => {
    for (const raw of ["tue 19:00", "Tuesday 19h", "thứ 3 19:00", "t3 19h00"]) {
      expect(canonicalizeAvailabilitySlot(raw), raw).toEqual({
        kind: "MATCH",
        canonical: "TUE_19_00",
      });
    }
    expect(canonicalizeAvailabilitySlot("chủ nhật 9:30")).toEqual({
      kind: "MATCH",
      canonical: "SUN_09_30",
    });
  });

  it("rejects a time the weekly grid cannot express", () => {
    expect(canonicalizeAvailabilitySlot("tue 19:45")).toEqual({ kind: "BAD_GRANULARITY" });
  });

  it("does not invent an hour for vague expressions", () => {
    for (const raw of ["tối thứ 3", "tuesday evening", "evening"]) {
      expect(canonicalizeAvailabilitySlot(raw), raw).toEqual({ kind: "UNKNOWN" });
    }
  });
});

describe("price canonicalization", () => {
  it("accepts non-negative integers and k-suffixed digit strings", () => {
    expect(canonicalizePrice(200000)).toBe(200000);
    expect(canonicalizePrice("200000")).toBe(200000);
    expect(canonicalizePrice("200k")).toBe(200000);
    expect(canonicalizePrice("200.000")).toBe(200000);
    expect(canonicalizePrice(0)).toBe(0);
  });

  it("refuses to guess at prose, ranges and negatives", () => {
    for (const raw of ["khoảng 200k trở lại", "150k-200k", "two hundred thousand", -1, 1.5]) {
      expect(canonicalizePrice(raw), String(raw)).toBeUndefined();
    }
  });
});

/* -------------------------------------------------------------------------- */

describe("request resolution", () => {
  it("reproduces the PLAN.md example", () => {
    const result = resolveStudentRequest({
      requestId: "R001",
      goal: { domain: "ielts", focusSkills: ["Writing"] },
      additionalPreferences: ["mentor nói chuyện chill"],
    });

    expect(result.resolution.resolved).toEqual([
      { kind: "DOMAIN", raw: "ielts", canonical: "IELTS", status: "RESOLVED" },
      { kind: "FOCUS_SKILL", raw: "Writing", canonical: "IELTS.WRITING", status: "RESOLVED" },
    ]);
    expect(result.resolution.unresolved).toEqual([
      {
        kind: "ADDITIONAL_PREFERENCE",
        raw: "mentor nói chuyện chill",
        status: "UNSUPPORTED",
        reason: "NO_CANONICAL_FEATURE",
      },
    ]);
    expect(result.resolution.status).toBe("PARTIALLY_RESOLVED");
    expect(result.request?.goal.focusSkills).toEqual(["IELTS.WRITING"]);
  });

  it("computes coverage as supported / requested criteria", () => {
    // 4 supported criteria out of 5 requested -> 0.80, per PLAN.md.
    const result = resolveStudentRequest({
      requestId: "R001",
      goal: { domain: "IELTS", focusSkills: ["writing"] },
      availability: ["TUE_19_00"],
      softPreferences: { teachingStyles: ["kiên nhẫn"] },
      additionalPreferences: ["mentor vui tính"],
    });

    expect(result.resolution.resolved).toHaveLength(4);
    expect(result.resolution.unresolved).toHaveLength(1);
    expect(result.resolution.coverage).toBe(0.8);
  });

  it("reports full coverage when everything resolves", () => {
    const result = resolveStudentRequest(
      request({ goal: { domain: "IELTS", focusSkills: ["IELTS.WRITING"] } }),
    );
    expect(result.resolution.status).toBe("RESOLVED");
    expect(result.resolution.coverage).toBe(1);
    expect(result.resolution.unresolved).toEqual([]);
  });

  it("computes coverage of 1 for an empty request body", () => {
    expect(computeCoverage(0, 0)).toBe(1);
  });

  it("resolves Vietnamese soft preferences into canonical styles", () => {
    const result = resolveStudentRequest(
      request({ softPreferences: { teachingStyles: ["kiên nhẫn", "Bài Bản"] } }),
    );
    expect(result.request?.softPreferences.teachingStyles).toEqual(["PATIENT", "STRUCTURED"]);
  });

  it("promotes free text to a canonical style when the ontology covers it", () => {
    const result = resolveStudentRequest(request({ additionalPreferences: ["kiên nhẫn"] }));
    expect(resolvedFor(result, "kiên nhẫn")?.canonical).toBe("PATIENT");
    expect(result.request?.softPreferences.teachingStyles).toEqual(["PATIENT"]);
    expect(result.request?.additionalPreferences).toEqual([]);
  });
});

describe("unknown and unsupported input is preserved, never dropped", () => {
  it("keeps an unknown preference verbatim in both the report and the request", () => {
    const raw = "muốn mentor nói chuyện chill";
    const result = resolveStudentRequest(request({ additionalPreferences: [raw] }));

    expect(unresolvedFor(result, raw)).toEqual({
      kind: "ADDITIONAL_PREFERENCE",
      raw,
      status: "UNSUPPORTED",
      reason: "NO_CANONICAL_FEATURE",
    });
    expect(result.request?.additionalPreferences).toEqual([raw]);
  });

  it("reports an unsupported certificate rather than ignoring the request", () => {
    const result = resolveStudentRequest({ requestId: "R001", goal: { domain: "TOEFL" } });
    expect(unresolvedFor(result, "TOEFL")).toMatchObject({
      status: "UNSUPPORTED",
      reason: "UNSUPPORTED_DOMAIN",
    });
    // No domain means nothing is executable — the engine must not guess IELTS.
    expect(result.request).toBeNull();
    expect(result.resolution.status).toBe("UNRESOLVED");
  });

  it("reports an unsupported certificate mentioned as free text", () => {
    const result = resolveStudentRequest(request({ additionalPreferences: ["TOEIC 800"] }));
    expect(unresolvedFor(result, "TOEIC 800")?.reason).toBe("NO_CANONICAL_FEATURE");
  });

  it("accounts for every supplied criterion exactly once", () => {
    const result = resolveStudentRequest({
      requestId: "R001",
      goal: { domain: "IELTS", currentScore: 6, targetScore: 7, focusSkills: ["writing"] },
      hardConstraints: { verifiedOnly: true, maxPricePerHour: "200k" },
      availability: ["thứ 3 19:00", "tối thứ 5"],
      softPreferences: { teachingStyles: ["kiên nhẫn"], languages: ["klingon"] },
      additionalPreferences: ["mentor vui tính"],
    });

    // 10 criteria supplied: domain, current, target, focus, verifiedOnly,
    // budget, 2 slots, style, language, free text.
    const total =
      result.resolution.resolved.length + result.resolution.unresolved.length;
    expect(total).toBe(11);
    expect(result.resolution.unresolved.map((c) => c.raw).sort()).toEqual([
      "klingon",
      "mentor vui tính",
      "tối thứ 5",
    ]);
  });

  it("uses only reason codes from the published list", () => {
    const result = resolveStudentRequest({
      goal: { domain: "TOEFL", focusSkills: [""], currentScore: "six" },
      hardConstraints: { maxPricePerHour: ["200k", "150k"], verifiedOnly: "yes" },
      availability: ["tue 19:45"],
      softPreferences: { gender: ["nữ", "nam"] },
      additionalPreferences: ["chill"],
    });

    for (const criterion of result.resolution.unresolved) {
      expect(UNRESOLVED_REASONS).toContain(criterion.reason);
    }
  });
});

describe("non-executable requests", () => {
  it("reports a missing domain as missing data, not as an unsupported value", () => {
    const result = resolveStudentRequest({});
    expect(result.resolution.unresolved).toEqual([
      {
        kind: "DOMAIN",
        raw: "undefined",
        status: "MISSING_DATA",
        reason: "MISSING_DOMAIN_CONTEXT",
      },
    ]);
    expect(result.resolution.status).toBe("UNRESOLVED");
    expect(result.request).toBeNull();
  });

  it("surfaces schema issues instead of emitting a half-valid request", () => {
    const result = resolveStudentRequest({ goal: { domain: "IELTS" } });
    expect(result.request).toBeNull();
    expect(result.issues).toEqual([
      { path: "requestId", code: "custom", message: "Identifier must not be empty" },
    ]);
    // The resolution report is still complete and useful.
    expect(result.resolution.resolved).toHaveLength(1);
  });
});

describe("ambiguity", () => {
  it("represents an ambiguous short skill with its candidates", () => {
    const result = resolveStudentRequest({ goal: { focusSkills: ["writing"] } });
    expect(unresolvedFor(result, "writing")).toEqual({
      kind: "FOCUS_SKILL",
      raw: "writing",
      status: "AMBIGUOUS",
      reason: "MISSING_DOMAIN_CONTEXT",
      candidates: ["HSK.WRITING", "IELTS.WRITING"],
    });
  });

  it("resolves the same short skill once the domain is known", () => {
    const result = resolveStudentRequest(request({ goal: { domain: "IELTS", focusSkills: ["writing"] } }));
    expect(resolvedFor(result, "writing")?.canonical).toBe("IELTS.WRITING");
    expect(result.resolution.unresolved).toEqual([]);
  });

  it("reports a skill the goal domain does not offer", () => {
    const result = resolveStudentRequest(request({ goal: { domain: "HSK", focusSkills: ["speaking"] } }));
    expect(unresolvedFor(result, "speaking")).toMatchObject({
      status: "REJECTED",
      reason: "SKILL_NOT_IN_DOMAIN",
      candidates: ["IELTS.SPEAKING"],
    });
    expect(result.request?.goal.focusSkills).toEqual([]);
  });

  it("reports missing data when a score has no domain to be measured on", () => {
    const result = resolveStudentRequest({ goal: { currentScore: 6 } });
    expect(unresolvedFor(result, "6")).toMatchObject({
      status: "MISSING_DATA",
      reason: "MISSING_DOMAIN_CONTEXT",
    });
  });
});

describe("contradictory structured constraints", () => {
  it("reports two different budgets instead of picking one", () => {
    const result = resolveStudentRequest(
      request({ hardConstraints: { maxPricePerHour: ["200k", 150000] } }),
    );

    expect(result.resolution.unresolved).toHaveLength(2);
    for (const criterion of result.resolution.unresolved) {
      expect(criterion).toMatchObject({
        kind: "BUDGET",
        status: "REJECTED",
        reason: "CONTRADICTORY_BUDGET",
        candidates: ["150000", "200000"],
      });
    }
    expect(result.request?.hardConstraints.maxPricePerHour).toBeUndefined();
  });

  it("accepts repeated budget mentions that agree", () => {
    const result = resolveStudentRequest(
      request({ hardConstraints: { maxPricePerHour: ["200k", 200000] } }),
    );
    expect(result.request?.hardConstraints.maxPricePerHour).toBe(200000);
    expect(result.resolution.unresolved).toEqual([]);
  });

  it("rejects a target score that is not above the current score", () => {
    const result = resolveStudentRequest(
      request({ goal: { domain: "IELTS", currentScore: 7, targetScore: 6.5 } }),
    );
    expect(
      result.resolution.unresolved.some((c) => c.reason === "CONTRADICTORY_SCORE_GOAL"),
    ).toBe(true);
    expect(result.request?.goal.targetScore).toBeUndefined();
    // The observed current score survives; only the impossible goal is dropped.
    expect(result.request?.goal.currentScore).toBe(7);
  });

  it("records a contradictory target exactly once (regression: resolved then rejected)", () => {
    const result = resolveStudentRequest(
      request({ goal: { domain: "IELTS", currentScore: 7, targetScore: 6.5 } }),
    );

    const targets = [...result.resolution.resolved, ...result.resolution.unresolved].filter(
      (c) => c.kind === "TARGET_SCORE",
    );
    expect(targets).toEqual([
      {
        kind: "TARGET_SCORE",
        raw: "6.5",
        status: "REJECTED",
        reason: "CONTRADICTORY_SCORE_GOAL",
      },
    ]);
    // 2 resolved (domain, current) + 1 unresolved (target) -> 0.6667, not 0.75.
    expect(result.resolution.coverage).toBe(0.6667);
  });

  it("rejects an equal target score as contradictory", () => {
    const result = resolveStudentRequest(
      request({ goal: { domain: "IELTS", currentScore: 7, targetScore: 7 } }),
    );
    expect(result.resolution.unresolved.map((c) => c.reason)).toEqual([
      "CONTRADICTORY_SCORE_GOAL",
    ]);
    expect(result.request?.goal.targetScore).toBeUndefined();
  });

  it("gives every criterion exactly one status across the whole report", () => {
    const result = resolveStudentRequest({
      requestId: "R001",
      goal: { domain: "IELTS", currentScore: 7, targetScore: 6.5, focusSkills: ["writing"] },
      hardConstraints: { maxPricePerHour: ["200k", "150k"] },
      softPreferences: { gender: ["nữ", "nam"] },
      additionalPreferences: ["chill"],
      mystery: 1,
    });

    const all = [...result.resolution.resolved, ...result.resolution.unresolved];
    const keys = all.map((c) => `${c.kind}::${c.raw}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("rejects a score that does not exist on the goal domain's scale", () => {
    const result = resolveStudentRequest(
      request({ goal: { domain: "IELTS", targetScore: 1400 } }),
    );
    expect(unresolvedFor(result, "1400")?.reason).toBe("INVALID_SCORE_FOR_DOMAIN");
  });

  it("rejects required expertise from another domain", () => {
    const result = resolveStudentRequest(
      request({ hardConstraints: { requiredExpertise: ["SAT.MATH"] } }),
    );
    expect(unresolvedFor(result, "SAT.MATH")).toMatchObject({
      kind: "REQUIRED_EXPERTISE",
      status: "REJECTED",
      reason: "DOMAIN_MISMATCH",
    });
    expect(result.request?.hardConstraints.requiredExpertise).toEqual([]);
  });

  it("rejects two different gender preferences", () => {
    const result = resolveStudentRequest(request({ softPreferences: { gender: ["nữ", "nam"] } }));
    expect(result.resolution.unresolved.map((c) => c.reason)).toEqual([
      "CONTRADICTORY_PREFERENCE",
      "CONTRADICTORY_PREFERENCE",
    ]);
    expect(result.request?.softPreferences.gender).toBeUndefined();
  });

  it("never coerces a non-boolean into a hard constraint", () => {
    const result = resolveStudentRequest(
      request({ hardConstraints: { verifiedOnly: "yes" } }),
    );
    expect(unresolvedFor(result, "yes")).toMatchObject({
      kind: "VERIFIED_ONLY",
      reason: "INVALID_TYPE",
    });
    expect(result.request?.hardConstraints.verifiedOnly).toBe(false);
  });
});

describe("unknown fields (regression: silently dropped keys)", () => {
  it("reports an unknown field at the request root, with its value", () => {
    const result = resolveStudentRequest(request({ budget: 200000 }));
    expect(unresolvedFor(result, "budget: 200000")).toEqual({
      kind: "UNKNOWN_FIELD",
      raw: "budget: 200000",
      status: "UNSUPPORTED",
      reason: "UNKNOWN_FIELD",
    });
  });

  it("reports unknown fields inside goal, hardConstraints and softPreferences", () => {
    const result = resolveStudentRequest({
      requestId: "R001",
      goal: { domain: "IELTS", deadlineWeeks: 8 },
      hardConstraints: { mustBeUnder25: true },
      softPreferences: { vibe: "chill" },
    });

    expect(result.resolution.unresolved.map((c) => c.raw)).toEqual([
      "goal.deadlineWeeks: 8",
      "hardConstraints.mustBeUnder25: true",
      "softPreferences.vibe: chill",
    ]);
    for (const criterion of result.resolution.unresolved) {
      expect(criterion).toMatchObject({ kind: "UNKNOWN_FIELD", reason: "UNKNOWN_FIELD" });
    }
  });

  it("counts unknown fields against coverage", () => {
    const known = resolveStudentRequest(request());
    expect(known.resolution.coverage).toBe(1);

    const withUnknown = resolveStudentRequest(request({ goal: { domain: "IELTS", vibe: "chill" } }));
    // 1 resolved (domain) + 1 unresolved (goal.vibe) -> 0.5
    expect(withUnknown.resolution.coverage).toBe(0.5);
    expect(withUnknown.resolution.status).toBe("PARTIALLY_RESOLVED");
  });

  it("preserves an unknown field's value verbatim, including objects", () => {
    const result = resolveStudentRequest(request({ schedule: { start: "2026-09-01" } }));
    expect(unresolvedFor(result, 'schedule: {"start":"2026-09-01"}')).toBeDefined();
  });

  it("does not let an unknown field into the canonical request", () => {
    const result = resolveStudentRequest(request({ budget: 200000 }));
    expect(result.request).not.toBeNull();
    expect(Object.hasOwn(result.request as object, "budget")).toBe(false);
  });

  it("reports the unknown field independently of incoming key order", () => {
    const a = resolveStudentRequest({ requestId: "R1", zzz: 1, goal: { domain: "IELTS" }, aaa: 2 });
    const b = resolveStudentRequest({ aaa: 2, goal: { domain: "IELTS" }, zzz: 1, requestId: "R1" });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.resolution.unresolved.map((c) => c.raw)).toEqual(["aaa: 2", "zzz: 1"]);
  });

  it("reports a malformed container instead of treating it as empty", () => {
    const malformed = { requestId: "R1", goal: "IELTS" } as unknown as RawStudentRequest;
    const result = resolveStudentRequest(malformed);
    expect(result.resolution.unresolved).toContainEqual({
      kind: "REQUEST_STRUCTURE",
      raw: "goal: IELTS",
      status: "REJECTED",
      reason: "INVALID_TYPE",
    });
    expect(result.request).toBeNull();
  });
});

describe("empty and duplicate criteria", () => {
  it("rejects blank criteria explicitly", () => {
    const result = resolveStudentRequest(
      request({
        goal: { domain: "IELTS", focusSkills: ["   "] },
        additionalPreferences: [""],
      }),
    );
    expect(result.resolution.unresolved.map((c) => c.reason)).toEqual([
      "EMPTY_CRITERION",
      "EMPTY_CRITERION",
    ]);
  });

  it("counts a repeated criterion once", () => {
    const result = resolveStudentRequest(
      request({
        goal: { domain: "IELTS", focusSkills: ["writing", "Writing", "  writing  "] },
      }),
    );
    expect(result.resolution.resolved.filter((c) => c.kind === "FOCUS_SKILL")).toHaveLength(1);
    expect(result.request?.goal.focusSkills).toEqual(["IELTS.WRITING"]);
    expect(result.resolution.coverage).toBe(1);
  });

  it("counts distinct phrasings of the same canonical value separately but deduplicates the output", () => {
    const result = resolveStudentRequest(
      request({ goal: { domain: "IELTS", focusSkills: ["writing", "ielts writing"] } }),
    );
    // Both were genuinely requested, so both are reported...
    expect(result.resolution.resolved.filter((c) => c.kind === "FOCUS_SKILL")).toHaveLength(2);
    // ...but the canonical request carries the skill once.
    expect(result.request?.goal.focusSkills).toEqual(["IELTS.WRITING"]);
  });
});

describe("determinism", () => {
  const complex: RawStudentRequest = {
    requestId: "R042",
    goal: { domain: "ielts", currentScore: 6, targetScore: 7, focusSkills: ["Writing", "nói"] },
    hardConstraints: {
      verifiedOnly: true,
      maxPricePerHour: "200k",
      minCredentialScore: 7.5,
      requiredExpertise: ["ielts writing"],
    },
    availability: ["thứ 3 19:00", "THU_19_00", "tối thứ 7"],
    softPreferences: { teachingStyles: ["kiên nhẫn", "patient"], languages: ["tiếng anh"] },
    additionalPreferences: ["mentor nói chuyện chill", "TOEIC 800"],
  };

  it("returns byte-identical output for the same input", () => {
    const first = resolveStudentRequest(complex);
    const second = resolveStudentRequest(complex);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("is order-stable and JSON-serializable", () => {
    const result = resolveStudentRequest(complex);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    expect(result.request?.availability).toEqual(["THU_19_00", "TUE_19_00"]);
    expect(result.request?.softPreferences.teachingStyles).toEqual(["PATIENT"]);
  });

  it("does not mutate its input", () => {
    const snapshot = structuredClone(complex);
    resolveStudentRequest(complex);
    expect(complex).toEqual(snapshot);
  });

  it("produces a request that passes Phase 1 validation", () => {
    const result = resolveStudentRequest(complex);
    expect(result.issues).toEqual([]);
    expect(result.request).not.toBeNull();
    expect(result.request?.hardConstraints).toMatchObject({
      verifiedOnly: true,
      maxPricePerHour: 200000,
      minCredentialScore: 7.5,
      requiredExpertise: ["IELTS.WRITING"],
    });
  });
});
