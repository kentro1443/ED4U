/**
 * Phase 9 — packaging and the integration boundary.
 *
 * These tests guard the promises the package makes to whoever installs it:
 *
 * - `matchMentors` is a stable, single entry point that composes the verified
 *   modules rather than reimplementing them;
 * - the core imports nothing web-shaped, touches no filesystem and opens no
 *   socket while matching;
 * - the published tarball carries every runtime asset and none of the fixtures,
 *   benchmarks, scratch files or tests;
 * - the semantic parser stays optional.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import * as engine from "../src/index.js";
import {
  ENGINE_VERSION,
  PACKAGE_VERSION,
  SCHEMA_VERSION,
  applyHardConstraints,
  exampleMentorAdapter,
  exampleRequestAdapter,
  matchMentors,
  rankMentors,
  satisfiesHardConstraints,
  validateMentors,
  validateStudentRequest,
} from "../src/index.js";
import type { Mentor, MockMentorRow, MockRequestRow, RankingConfig, StudentRequest } from "../src/index.js";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Reads a committed dataset file. */
function readData<T>(name: string): T {
  return JSON.parse(readFileSync(join(PACKAGE_ROOT, "data", name), "utf8")) as T;
}

const mentors = readData<Mentor[]>("mentors.mock.json");
const requests = readData<StudentRequest[]>("requests.mock.json");

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

/* -------------------------------------------------------------------------- */
/* Public surface                                                             */
/* -------------------------------------------------------------------------- */

describe("public surface", () => {
  it("exports the stable entry points", () => {
    for (const name of [
      "matchMentors",
      "validateMentor",
      "validateMentors",
      "validateStudentRequest",
      "resolveStudentRequest",
      "applyHardConstraints",
      "rankMentors",
      "topKRecommendations",
      "explainRecommendations",
      "parseStudentRequest",
    ]) {
      expect(typeof (engine as Record<string, unknown>)[name], name).toBe("function");
    }

    // Objects, not functions: a parser instance and the two adapters.
    expect(typeof engine.deterministicParser.parse).toBe("function");
    expect(typeof engine.exampleMentorAdapter.toCanonicalMentor).toBe("function");
    expect(typeof engine.exampleRequestAdapter.toCanonicalRequest).toBe("function");
  });

  it("reports both the semantic engine version and the package version", () => {
    const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")) as {
      name: string;
      version: string;
    };

    expect(pkg.name).toBe("@ed4u/mentor-engine");
    // The semantic contract version and the artifact version are different
    // things and both must be recoverable.
    expect(ENGINE_VERSION).toBe("mentor-engine-v1.0.0");
    expect(SCHEMA_VERSION).toBe("mentor-engine-schema-v1.0.0");
    expect(pkg.version).toMatch(/^1\.0\.0/);
    expect(PACKAGE_VERSION).toBe(pkg.version);
  });
});

/* -------------------------------------------------------------------------- */
/* matchMentors                                                               */
/* -------------------------------------------------------------------------- */

describe("matchMentors", () => {
  const request = makeRequest({
    hardConstraints: {
      verifiedOnly: true,
      maxPricePerHour: 400_000,
      requiredExpertise: [],
      requireAllAvailability: false,
    },
  });

  it("returns a complete, versioned response", () => {
    const response = matchMentors({ request, mentors, topK: 3 });

    expect(response.engineVersion).toBe(ENGINE_VERSION);
    expect(response.packageVersion).toBe(PACKAGE_VERSION);
    expect(response.schemaVersion).toBe(SCHEMA_VERSION);
    expect(response.configVersions).toEqual({
      ontology: "ontology.v1",
      aliases: "aliases.v1",
      weights: "weights.v1",
    });
    expect(response.recommendations).toHaveLength(3);
    expect(response.diagnostics.candidateCount).toBe(mentors.length);
    expect(response.diagnostics.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("reports the exact custom ranking-config version that produced the result", () => {
    const custom: RankingConfig = structuredClone(engine.rankingConfig);
    custom.version = "weights.release-hardening-test";
    custom.baseWeights = {
      subjectExpertise: 0,
      focusSkillStrength: 0,
      availabilityFit: 0,
      budgetFit: 1,
      experience: 0,
      rating: 0,
      teachingStyleFit: 0,
    };

    const normal = matchMentors({ request, mentors, topK: 3 });
    const changed = matchMentors({ request, mentors, topK: 3, config: custom });

    expect(changed.configVersions.weights).toBe("weights.release-hardening-test");
    expect(changed.recommendations.map((r) => r.mentorId)).not.toEqual(
      normal.recommendations.map((r) => r.mentorId),
    );

    const invalidVersion: RankingConfig = structuredClone(custom);
    invalidVersion.version = "   ";
    expect(() => matchMentors({ request, mentors, config: invalidVersion })).toThrow(/version/);
  });

  it("rejects invalid public topK values instead of inheriting Array.slice semantics", () => {
    for (const topK of [0, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => matchMentors({ request, mentors, topK }), String(topK)).toThrow(/topK/);
    }
    expect(() =>
      matchMentors({ request, mentors, topK: "3" } as unknown as engine.MatchMentorsInput),
    ).toThrow(/topK/);

    expect(matchMentors({ request, mentors, topK: 1 }).recommendations).toHaveLength(1);
    const oversized = matchMentors({ request, mentors, topK: 100_000 });
    expect(oversized.recommendations).toHaveLength(oversized.diagnostics.eligibleCount);
  });

  it("composes the verified modules rather than reimplementing them", () => {
    // Same inputs through the pieces must give the same answer as the facade.
    const { eligible } = applyHardConstraints(request, mentors);
    const ranked = rankMentors(request, eligible, { topK: 3 });
    const response = matchMentors({ request, mentors, topK: 3 });

    expect(response.recommendations.map((r) => r.mentorId)).toEqual(ranked.map((r) => r.mentorId));
    expect(response.diagnostics.eligibleCount).toBe(eligible.length);
  });

  it("contains no filtering or ranking logic of its own", () => {
    const source = readFileSync(join(PACKAGE_ROOT, "src/engine.ts"), "utf8");
    for (const forbidden of ["verifiedOnly", "pricePerHour", "baseWeights", "matchScore ="]) {
      expect(source, forbidden).not.toContain(forbidden);
    }
  });

  it("reports NO_FEASIBLE_MATCH explicitly instead of relaxing anything", () => {
    const impossible = makeRequest({
      hardConstraints: {
        verifiedOnly: true,
        maxPricePerHour: 1_000,
        requiredExpertise: [],
        requireAllAvailability: false,
      },
    });
    const response = matchMentors({ request: impossible, mentors });

    expect(response.recommendations).toEqual([]);
    expect(response.diagnostics.noFeasibleMatch).toBe(true);
    expect(response.diagnostics.eligibleCount).toBe(0);
    expect((response.diagnostics.filteredOut.PRICE ?? 0)).toBeGreaterThan(0);
  });

  it("omits noFeasibleMatch when a match was found", () => {
    expect(matchMentors({ request, mentors }).diagnostics.noFeasibleMatch).toBeUndefined();
  });

  it("describes an already-canonical request honestly", () => {
    // Nothing needed interpreting, which is not the same as a fabricated success.
    const response = matchMentors({ request, mentors });
    expect(response.requestResolution).toEqual({
      status: "RESOLVED",
      coverage: 1,
      resolved: [],
      unresolved: [],
    });
  });

  it("carries a resolution report through when one was produced", () => {
    const resolved = engine.resolveStudentRequest({
      requestId: "R001",
      goal: { domain: "ielts", focusSkills: ["Writing"] },
      additionalPreferences: ["mentor vui tính"],
    });
    const response = matchMentors({
      request: resolved.request as StudentRequest,
      mentors,
      resolution: resolved.resolution,
    });

    expect(response.requestResolution.coverage).toBeLessThan(1);
    expect(response.requestResolution.unresolved[0]?.raw).toBe("mentor vui tính");
  });

  it("has deterministic decision output and JSON round-trips exactly", () => {
    const first = matchMentors({ request, mentors, topK: 5 });
    const second = matchMentors({ request, mentors, topK: 5 });

    // Latency is observational telemetry; the decision payload must be byte-identical.
    const strip = (response: typeof first) => ({
      ...response,
      diagnostics: { ...response.diagnostics, latencyMs: 0 },
    });
    expect(JSON.stringify(strip(second))).toBe(JSON.stringify(strip(first)));
    expect(JSON.parse(JSON.stringify(first))).toEqual(first);
  });

  it("never returns a mentor that violates a hard constraint", () => {
    for (const each of requests.slice(0, 100)) {
      const response = matchMentors({ request: each, mentors, topK: 5 });
      for (const recommendation of response.recommendations) {
        const mentor = mentors.find((m) => m.id === recommendation.mentorId) as Mentor;
        expect(satisfiesHardConstraints(each, mentor), `${each.requestId}/${mentor.id}`).toBe(true);
      }
    }
  });

  it("works for IELTS, SAT and HSK", () => {
    for (const domain of ["IELTS", "SAT", "HSK"] as const) {
      const response = matchMentors({
        request: makeRequest({ goal: { domain, focusSkills: [] }, availability: [] }),
        mentors,
        topK: 2,
      });
      expect(response.recommendations.length, domain).toBeGreaterThan(0);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Purity                                                                     */
/* -------------------------------------------------------------------------- */

describe("the core stays pure", () => {
  /** Every shipped source file. */
  const sourceFiles = execFileSync("find", ["src", "-name", "*.ts"], {
    cwd: PACKAGE_ROOT,
    encoding: "utf8",
  })
    .trim()
    .split("\n");

  it("imports no database, web framework or HTTP client", () => {
    const banned = [
      "@prisma/client", "next/", "next.js", "@supabase", "express",
      "node:http", "node:https", "axios", "node-fetch", "undici",
    ];
    for (const file of sourceFiles) {
      const source = readFileSync(join(PACKAGE_ROOT, file), "utf8");
      for (const token of banned) {
        expect(source.includes(`from "${token}`), `${file} imports ${token}`).toBe(false);
      }
    }
  });

  it("writes no files and opens no sockets while matching", () => {
    const banned = ["writeFileSync", "appendFileSync", "mkdirSync", "createWriteStream", "fetch("];
    for (const file of sourceFiles) {
      const source = readFileSync(join(PACKAGE_ROOT, file), "utf8");
      for (const token of banned) {
        expect(source.includes(token), `${file} uses ${token}`).toBe(false);
      }
    }
  });

  it("reads the filesystem only through static JSON config imports", () => {
    for (const file of sourceFiles) {
      const source = readFileSync(join(PACKAGE_ROOT, file), "utf8");
      // `readFileSync` at match time would make the engine environment-dependent.
      expect(source.includes("readFileSync"), file).toBe(false);
    }
  });

  it("keeps the parser optional: the core never imports it", () => {
    for (const file of sourceFiles) {
      if (file.includes("src/parsing/") || file.endsWith("src/index.ts")) continue;
      const source = readFileSync(join(PACKAGE_ROOT, file), "utf8");
      expect(source.includes("parsing/"), `${file} imports the parser`).toBe(false);
    }
  });

  it("matches without any parser involvement", () => {
    const response = matchMentors({ request: makeRequest(), mentors, topK: 1 });
    expect(response.recommendations).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Adapters                                                                   */
/* -------------------------------------------------------------------------- */

describe("adapter example", () => {
  /** A row whose credentials have been confirmed. */
  const confirmedRow: MockMentorRow = {
    id: "DB-1",
    tenantId: "tenant-a",
    fullName: "Nguyen Minh Anh",
    birthYear: 2000,
    identityVerifiedAt: "2026-01-01",
    credentialsConfirmedAt: "2026-01-02",
    ieltsOverall: 8,
    ieltsListening: 8.5,
    ieltsReading: 8,
    ieltsWriting: 7.5,
    ieltsSpeaking: 8,
    satTotal: null,
    satMath: null,
    satReadingWriting: null,
    hskLevel: null,
    teachesSkills: ["ielts writing", "IELTS.READING"],
    availability: [{ weekday: "tue", startTime: "19:00" }],
    hourlyRateVnd: 350_000,
    monthsTeaching: 24,
    completedSessions: 120,
    averageRating: 4.8,
    teachingStyleTags: ["PATIENT"],
    lastLoginAt: "2026-02-01",
    profileViews: 512,
  };

  /** The same mentor, but nobody has ever checked their credentials. */
  const unconfirmedRow: MockMentorRow = {
    ...confirmedRow,
    id: "DB-2",
    credentialsConfirmedAt: null,
    ieltsOverall: null,
    ieltsListening: null,
    ieltsReading: null,
    ieltsWriting: null,
    ieltsSpeaking: null,
    monthsTeaching: null,
    completedSessions: null,
    averageRating: null,
    teachingStyleTags: null,
  };

  it("produces mentors that pass canonical validation", () => {
    const result = validateMentors([
      exampleMentorAdapter.toCanonicalMentor(confirmedRow),
      exampleMentorAdapter.toCanonicalMentor(unconfirmedRow),
    ]);
    expect(result.ok, JSON.stringify(result.ok ? [] : result.issues)).toBe(true);
  });

  it("distinguishes KNOWN ABSENT from UNKNOWN, the way the database means it", () => {
    const confirmed = exampleMentorAdapter.toCanonicalMentor(confirmedRow);
    const unconfirmed = exampleMentorAdapter.toCanonicalMentor(unconfirmedRow);

    // Confirmed profile, no SAT row: they hold none.
    expect(engine.credentialKnowledge(confirmed.credentials, "IELTS")).toBe("PRESENT");
    expect(engine.credentialKnowledge(confirmed.credentials, "SAT")).toBe("ABSENT");
    // Never checked: we simply do not know, which is a different claim.
    expect(engine.credentialKnowledge(unconfirmed.credentials, "IELTS")).toBe("UNKNOWN");
    expect(engine.credentialKnowledge(unconfirmed.credentials, "SAT")).toBe("UNKNOWN");
  });

  it("canonicalises host vocabulary rather than passing it through", () => {
    const mentor = exampleMentorAdapter.toCanonicalMentor(confirmedRow);
    expect(mentor.expertise).toEqual(["IELTS.WRITING", "IELTS.READING"]);
    expect(mentor.availability).toEqual(["TUE_19_00"]);
  });

  it("leaves optional fields absent rather than defaulting them to zero", () => {
    const mentor = exampleMentorAdapter.toCanonicalMentor(unconfirmedRow);
    expect(mentor.rating).toBeUndefined();
    expect(mentor.sessionsCompleted).toBeUndefined();
    expect(mentor.teachingStyles).toBeUndefined();
  });

  it("never forwards tenant, identity or analytics data to the engine", () => {
    const mentor = exampleMentorAdapter.toCanonicalMentor(confirmedRow);
    const serialized = JSON.stringify(mentor);
    for (const leak of ["tenant-a", "lastLoginAt", "profileViews", "2026-02-01"]) {
      expect(serialized, leak).not.toContain(leak);
    }
  });

  it("converts a request row and drops the student's email", () => {
    const row: MockRequestRow = {
      id: "REQ-1",
      tenantId: "tenant-a",
      studentEmail: "student@example.com",
      examType: "ielts",
      currentScore: 6,
      targetScore: 7,
      focusSkills: ["writing"],
      requireVerified: true,
      budgetPerHourVnd: 400_000,
      minimumCredential: null,
      availability: [{ weekday: "tue", startTime: "19:00" }],
      preferredStyles: ["PATIENT"],
      freeTextNotes: "mentor vui tính",
    };

    const request = exampleRequestAdapter.toCanonicalRequest(row);
    const validated = validateStudentRequest(request);
    expect(validated.ok, JSON.stringify(validated.ok ? [] : validated.issues)).toBe(true);
    expect(JSON.stringify(request)).not.toContain("student@example.com");
    expect(JSON.stringify(request)).not.toContain("tenant-a");
    // Free text is carried, not interpreted.
    expect(request.additionalPreferences).toEqual(["mentor vui tính"]);
  });

  it("runs end to end from database rows", () => {
    const adapted = validateMentors([exampleMentorAdapter.toCanonicalMentor(confirmedRow)]);
    if (!adapted.ok) throw new Error("adapter produced an invalid mentor");

    const response = matchMentors({ request: makeRequest(), mentors: adapted.value, topK: 1 });
    expect(response.recommendations[0]?.mentorId).toBe("DB-1");
    expect(response.recommendations[0]?.reasons.length).toBeGreaterThan(0);
  });

  it("imports no ORM or web framework", () => {
    const source = readFileSync(join(PACKAGE_ROOT, "src/adapters/exampleAdapter.ts"), "utf8");
    for (const token of ["prisma", "next", "supabase", "express"]) {
      expect(source.toLowerCase().includes(`from "${token}`), token).toBe(false);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Tarball                                                                    */
/* -------------------------------------------------------------------------- */

describe("published tarball", () => {
  // The tarball only contains dist/ if a build has happened. Build here rather
  // than depending on the order commands were run in.
  if (!existsSync(join(PACKAGE_ROOT, "dist", "index.js"))) {
    execFileSync("npm", ["run", "build"], { cwd: PACKAGE_ROOT, stdio: ["ignore", "pipe", "inherit"] });
  }

  /** Files `npm pack` would publish. */
  const packed = (
    JSON.parse(
      execFileSync("npm", ["pack", "--dry-run", "--json"], {
        cwd: PACKAGE_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }),
    ) as { files: { path: string }[] }[]
  )[0]?.files.map((file) => file.path) as string[];

  it("ships the compiled entry point and its types", () => {
    expect(packed).toContain("dist/index.js");
    expect(packed).toContain("dist/index.d.ts");
  });

  it("ships every JSON config the runtime imports", () => {
    // These are imported with import attributes; without them the package is
    // installable but broken at first call.
    for (const asset of [
      "config/ontology.v1.json",
      "config/aliases.v1.json",
      "config/weights.v1.json",
    ]) {
      expect(packed, asset).toContain(asset);
    }
  });

  it("ships no fixtures, benchmarks, scratch files or tests", () => {
    const forbidden = packed.filter(
      (path) =>
        path.startsWith("data/") ||
        path.startsWith("tests/") ||
        path.startsWith("scripts/") ||
        path.startsWith("src/") ||
        path === "playground.ts" ||
        path.endsWith(".test.ts"),
    );
    expect(forbidden).toEqual([]);
  });

  it("declares no web, database or test dependency at runtime", () => {
    const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, "package.json"), "utf8")) as {
      dependencies: Record<string, string>;
    };
    expect(Object.keys(pkg.dependencies)).toEqual(["zod"]);
  });
});
