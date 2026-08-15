import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  applyHardConstraints,
  matchMentors,
  validateMentors,
  validateStudentRequest,
  type StudentRequest,
} from "@ed4u/mentor-engine";
import { createTestClient } from "./harness";
import { MENTOR_PROFILE_INCLUDE, toCanonicalMentors } from "../../src/lib/mentor/adapter";
import type { PrismaClient } from "../../src/generated/prisma/client";

/**
 * Asserts that the seeded demo school can actually support the two flagship
 * demos — against the real database, using the real adapter and the real
 * engine.
 *
 * The prototype's seed satisfied "no two rows identical" trivially (ids and
 * prices differed) while being useless for matching: 24 of 25 mentors shared
 * one headline, one skill, one availability pair. The criterion here is
 * therefore behavioural: different canonical requests must produce meaningfully
 * different rankings and different rejections.
 *
 * These run against the seeded demo tenant, which `npm run db:demo:reset`
 * restores deterministically. They read; they never write.
 */

let db: PrismaClient;
let tenantId: string;

beforeAll(async () => {
  db = createTestClient();
  const tenant = await db.tenant.findUniqueOrThrow({ where: { slug: "ed4u-demo" } });
  tenantId = tenant.id;
}, 30_000);

afterAll(async () => {
  await db.$disconnect();
});

async function canonicalMentors() {
  const profiles = await db.mentorProfile.findMany({
    where: { tenantId },
    include: MENTOR_PROFILE_INCLUDE,
    orderBy: { id: "asc" },
  });
  return { profiles, ...toCanonicalMentors(profiles) };
}

function request(over: Partial<StudentRequest> & { requestId: string }): StudentRequest {
  const parsed = validateStudentRequest({
    goal: { domain: "IELTS", focusSkills: [] },
    hardConstraints: {
      verifiedOnly: false,
      requiredExpertise: [],
      requireAllAvailability: false,
    },
    availability: [],
    softPreferences: { teachingStyles: [], languages: [] },
    additionalPreferences: [],
    ...over,
  });
  if (!parsed.ok) {
    throw new Error(`invalid test request: ${JSON.stringify(parsed.issues)}`);
  }
  return parsed.value;
}

describe("tenant configuration", () => {
  it("has an explicit school timezone", async () => {
    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    expect(tenant.timezone).toBe("Asia/Ho_Chi_Minh");
  });
});

describe("mentor data is truthful and engine-ready", () => {
  it("adapts every seeded mentor without a single failure", async () => {
    const { profiles, mentors, failures } = await canonicalMentors();
    expect(profiles.length).toBeGreaterThanOrEqual(20);
    expect(failures).toEqual([]);
    expect(mentors).toHaveLength(profiles.length);
  });

  it("passes the strict canonical schema", async () => {
    const { mentors } = await canonicalMentors();
    const validated = validateMentors(mentors);
    if (!validated.ok) {
      throw new Error(`seed produced invalid mentors: ${JSON.stringify(validated.issues)}`);
    }
    expect(validated.value).toHaveLength(mentors.length);
  });

  it("gives every mentor a real name and a real birth year", async () => {
    const { mentors } = await canonicalMentors();
    for (const mentor of mentors) {
      expect(mentor.name).not.toMatch(/^[0-9a-f-]{36}$/i);
      expect(mentor.birthYear).toBeGreaterThan(1980);
      expect(mentor.birthYear).toBeLessThan(2010);
    }
    // Not everyone born in the same year, which a lazy constant would produce.
    expect(new Set(mentors.map((m) => m.birthYear)).size).toBeGreaterThanOrEqual(5);
  });
});

describe("matching-relevant diversity", () => {
  it("spreads mentors across every axis the engine ranks on", async () => {
    const { mentors } = await canonicalMentors();

    const domains = new Set(mentors.flatMap((m) => m.expertise.map((s) => s.split(".")[0])));
    expect(domains).toEqual(new Set(["IELTS", "SAT", "HSK"]));

    // Distinct expertise *sets*, not just distinct skills.
    const expertiseSets = new Set(mentors.map((m) => [...m.expertise].sort().join("|")));
    expect(expertiseSets.size).toBeGreaterThanOrEqual(12);

    const availabilitySets = new Set(mentors.map((m) => [...m.availability].sort().join("|")));
    expect(availabilitySets.size).toBeGreaterThanOrEqual(12);

    const prices = mentors.map((m) => m.pricePerHour);
    expect(Math.max(...prices) - Math.min(...prices)).toBeGreaterThanOrEqual(300_000);

    // Both verification states must be represented, or `verifiedOnly` is inert.
    expect(mentors.some((m) => m.verified)).toBe(true);
    expect(mentors.some((m) => !m.verified)).toBe(true);

    // Ratings and experience are genuinely optional; the demo must contain both
    // known and unknown so the engine's missing-data handling is visible.
    expect(mentors.some((m) => m.rating !== undefined)).toBe(true);
    expect(mentors.some((m) => m.rating === undefined)).toBe(true);
    expect(mentors.some((m) => m.teachingExperienceMonths === undefined)).toBe(true);
  });

  it("contains all three credential knowledge states", async () => {
    const { mentors } = await canonicalMentors();
    const states = mentors.map((m) => {
      if (!Object.hasOwn(m.credentials, "ielts")) return "UNKNOWN";
      return m.credentials.ielts === null ? "ABSENT" : "PRESENT";
    });
    expect(new Set(states)).toEqual(new Set(["UNKNOWN", "ABSENT", "PRESENT"]));
  });

  it("varies room features instead of giving every room a projector", async () => {
    const values = await db.roomFeatureValue.findMany({
      where: { room: { tenantId } },
      include: { feature: { select: { code: true } } },
    });
    const codesInUse = new Set(values.map((v) => v.feature.code));
    expect(codesInUse.size).toBeGreaterThanOrEqual(4);

    const byRoom = new Map<string, string[]>();
    for (const value of values) {
      byRoom.set(value.roomId, [...(byRoom.get(value.roomId) ?? []), value.feature.code]);
    }
    const featureSets = new Set([...byRoom.values()].map((codes) => [...codes].sort().join("|")));
    expect(featureSets.size).toBeGreaterThanOrEqual(4);
  });
});

describe("different requests produce different answers", () => {
  it("ranks a different top mentor for IELTS, SAT and HSK", async () => {
    const { mentors } = await canonicalMentors();
    const validated = validateMentors(mentors);
    if (!validated.ok) throw new Error("seed mentors failed validation");

    const tops = ["IELTS", "SAT", "HSK"].map((domain) => {
      const result = matchMentors({
        request: request({
          requestId: `top-${domain}`,
          goal: { domain: domain as "IELTS" | "SAT" | "HSK", focusSkills: [] },
        }),
        mentors: validated.value,
        topK: 5,
      });
      expect(result.recommendations.length).toBeGreaterThan(0);
      return result.recommendations[0]!.mentorId;
    });

    expect(new Set(tops).size).toBe(3);
  });

  it("changes the ranking when the budget constraint changes", async () => {
    const { mentors } = await canonicalMentors();
    const validated = validateMentors(mentors);
    if (!validated.ok) throw new Error("seed mentors failed validation");

    const forBudget = (maxPricePerHour: number) => {
      const req = request({
        requestId: `budget-${maxPricePerHour}`,
        goal: { domain: "IELTS", focusSkills: ["IELTS.WRITING"] },
        hardConstraints: {
          verifiedOnly: false,
          requiredExpertise: [],
          requireAllAvailability: false,
          maxPricePerHour,
        },
      });
      return {
        ranking: matchMentors({
          request: req,
          mentors: validated.value,
          topK: 5,
        }).recommendations.map((r) => r.mentorId),
        eligible: applyHardConstraints(req, validated.value).eligible.length,
      };
    };

    const generous = forBudget(700_000);
    const tight = forBudget(200_000);
    expect(generous.ranking).not.toEqual(tight.ranking);
    // A tight budget must exclude candidates, not merely reorder the same ones.
    expect(tight.eligible).toBeLessThan(generous.eligible);
  });

  it("produces different rejections for different hard constraints", async () => {
    const { mentors } = await canonicalMentors();
    const validated = validateMentors(mentors);
    if (!validated.ok) throw new Error("seed mentors failed validation");

    const reject = (over: Parameters<typeof request>[0]) =>
      applyHardConstraints(request(over), validated.value).rejected;

    const unverified = reject({
      requestId: "verified-only",
      goal: { domain: "IELTS", focusSkills: [] },
      hardConstraints: {
        verifiedOnly: true,
        requiredExpertise: [],
        requireAllAvailability: false,
      },
    });
    const credentialled = reject({
      requestId: "min-credential",
      goal: { domain: "IELTS", focusSkills: [] },
      hardConstraints: {
        verifiedOnly: false,
        requiredExpertise: [],
        requireAllAvailability: false,
        minCredentialScore: 8,
      },
    });

    expect(unverified.length).toBeGreaterThan(0);
    expect(credentialled.length).toBeGreaterThan(0);
    // Different constraints must bite differently, and for different reasons.
    expect(new Set(unverified.map((r) => r.mentorId))).not.toEqual(
      new Set(credentialled.map((r) => r.mentorId)),
    );
    const reasons = new Set([
      ...unverified.flatMap((r) => r.reasons),
      ...credentialled.flatMap((r) => r.reasons),
    ]);
    expect(reasons.size).toBeGreaterThanOrEqual(2);
  });

  it("returns no feasible match for a request nobody can serve", async () => {
    const { mentors } = await canonicalMentors();
    const validated = validateMentors(mentors);
    if (!validated.ok) throw new Error("seed mentors failed validation");

    const result = matchMentors({
      request: request({
        requestId: "impossible",
        goal: { domain: "HSK", focusSkills: ["HSK.WRITING"] },
        hardConstraints: {
          verifiedOnly: true,
          requiredExpertise: ["HSK.WRITING"],
          requireAllAvailability: false,
          maxPricePerHour: 50_000,
        },
      }),
      mentors: validated.value,
      topK: 5,
    });

    // Constraints are never relaxed to manufacture a result.
    expect(result.recommendations).toEqual([]);
    expect(result.diagnostics.noFeasibleMatch).toBe(true);
  });
});
