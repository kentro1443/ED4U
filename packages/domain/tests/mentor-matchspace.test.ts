import { describe, expect, it } from "vitest";
import {
  MATCH_SCORE_DISCLAIMER,
  distanceMonotonic,
  layoutMatchSpace,
  radiusFromScore,
  recheckMentorBooking,
  toEngineCandidates,
  parseSlotPattern,
  nextSlotOccurrence,
} from "../src/index";

describe("Match Space layout", () => {
  const mentors = [
    {
      mentorId: "m-high",
      matchScore: 91,
      eligible: true,
      rejectionReasons: [],
      clusterKey: "IELTS",
    },
    {
      mentorId: "m-mid",
      matchScore: 74,
      eligible: true,
      rejectionReasons: [],
      clusterKey: "IELTS",
    },
    { mentorId: "m-low", matchScore: 40, eligible: true, rejectionReasons: [], clusterKey: "SAT" },
    {
      mentorId: "m-out",
      matchScore: 0,
      eligible: false,
      rejectionReasons: ["exceeds budget"],
      clusterKey: "IELTS",
    },
  ];

  it("places higher scores closer (monotonic in 1 - matchScore)", () => {
    expect(distanceMonotonic(91, 74)).toBe(true);
    expect(radiusFromScore(91)).toBeLessThan(radiusFromScore(74));
    expect(radiusFromScore(74)).toBeLessThan(radiusFromScore(40));
    const layout = layoutMatchSpace({
      requestId: "req-1",
      engineVersion: "mentor-engine-v1.0.0",
      mentors,
    });
    const high = layout.nodes.find((n) => n.mentorId === "m-high");
    const mid = layout.nodes.find((n) => n.mentorId === "m-mid");
    expect(high && mid && high.radius < mid.radius).toBe(true);
    expect(layout.disclaimer).toBe(MATCH_SCORE_DISCLAIMER);
  });

  it("is deterministic for the same request + pool + engine version", () => {
    const a = layoutMatchSpace({
      requestId: "req-1",
      engineVersion: "mentor-engine-v1.0.0",
      mentors,
    });
    const b = layoutMatchSpace({
      requestId: "req-1",
      engineVersion: "mentor-engine-v1.0.0",
      mentors,
    });
    expect(a).toEqual(b);
    const c = layoutMatchSpace({
      requestId: "req-2",
      engineVersion: "mentor-engine-v1.0.0",
      mentors,
    });
    expect(c.nodes[0]?.angle).not.toBe(a.nodes[0]?.angle);
  });
});

describe("mentor adapter and live booking re-check", () => {
  it("filters candidates to the actor tenant", () => {
    const rows = [
      {
        id: "1",
        tenantId: "t1",
        verified: true,
        name: "A",
        expertise: [],
        availability: [],
        pricePerHour: 1,
      },
      {
        id: "2",
        tenantId: "t2",
        verified: true,
        name: "B",
        expertise: [],
        availability: [],
        pricePerHour: 1,
      },
    ];
    expect(toEngineCandidates(rows, "t1").map((r) => r.id)).toEqual(["1"]);
  });

  it("rejects stale availability and non-graduated mentors", () => {
    const live = {
      mentorId: "m1",
      tenantId: "t1",
      verified: true,
      membershipStatus: "GRADUATED" as const,
      availableSlots: ["TUE_19_00"],
      pricePerHour: 200_000,
    };
    const miss = recheckMentorBooking(live, {
      tenantId: "t1",
      studentId: "s1",
      mentorId: "m1",
      slot: "WED_19_00",
      maxPricePerHour: 300_000,
    });
    expect(miss.ok).toBe(false);
    const ok = recheckMentorBooking(live, {
      tenantId: "t1",
      studentId: "s1",
      mentorId: "m1",
      slot: "TUE_19_00",
      maxPricePerHour: 300_000,
    });
    expect(ok.ok).toBe(true);
    const notGrad = recheckMentorBooking(
      { ...live, membershipStatus: "ACTIVE" },
      { tenantId: "t1", studentId: "s1", mentorId: "m1", slot: "TUE_19_00", maxPricePerHour: null },
    );
    expect(notGrad.ok).toBe(false);
  });

  it("parses slot pattern and calculates next concrete occurrence in timezone", () => {
    const parsed = parseSlotPattern("TUE_19_00");
    expect(parsed.weekday).toBe(2);
    expect(parsed.hour).toBe(19);
    expect(parsed.minute).toBe(0);

    const fromDate = new Date("2026-08-16T00:00:00.000Z"); // Sunday
    const { startAt, endAt } = nextSlotOccurrence("TUE_19_00", "Asia/Ho_Chi_Minh", fromDate);
    expect(startAt.getTime()).toBeLessThan(endAt.getTime());
    expect(endAt.getTime() - startAt.getTime()).toBe(60 * 60 * 1000);
  });

  it("resolves mentor sessions across an IANA DST transition without adding fake 24h days", () => {
    // 2026-03-07 12:00 in New York, one day before the DST spring-forward.
    const fromDate = new Date("2026-03-07T17:00:00.000Z");
    const { startAt, endAt } = nextSlotOccurrence("SUN_09_00", "America/New_York", fromDate);
    expect(startAt.toISOString()).toBe("2026-03-08T13:00:00.000Z");
    expect(endAt.toISOString()).toBe("2026-03-08T14:00:00.000Z");
  });
});
