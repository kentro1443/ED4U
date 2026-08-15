import { describe, expect, it } from "vitest";
import { parseMentorPrompt } from "../src/lib/mentor/parser";
import {
  parseMentorMatchPayload,
  parseMentorRunSnapshot,
  MentorMatchPayloadV1Schema,
  MentorRunSnapshotV1Schema,
} from "../src/lib/mentor/schemas";

describe("Slice 3: Mentor Parser & Schemas Unit Tests", () => {
  it("parses IELTS Writing prompt with score, days, evening and budget", () => {
    const res = parseMentorPrompt(
      "Em IELTS khoảng 6.0, Writing yếu, muốn lên 7.0. Em rảnh tối thứ 3 và thứ 5, ngân sách khoảng 250k/giờ. Em thích mentor dạy có cấu trúc.",
      "req-1",
    );
    expect(res.domain).toBe("IELTS");
    expect(res.focusSkills).toContain("IELTS.WRITING");
    expect(res.currentScore).toBe(6.0);
    expect(res.targetScore).toBe(7.0);
    expect(res.maxPricePerHour).toBe(250_000);
    expect(res.availability).toContain("TUE_19_00");
    expect(res.availability).toContain("THU_19_00");
    expect(res.teachingStyles).toContain("STRUCTURED");
    expect(res.canonicalRequest).toBeDefined();
    expect(res.canonicalRequest?.goal.domain).toBe("IELTS");
  });

  it("parses SAT Math prompt with numeric range and budget in full format", () => {
    const res = parseMentorPrompt(
      "Cần tìm mentor SAT Math, target 1450, rảnh chiều thứ 6, ngân sách tối đa 400.000 đ/giờ, chỉ mentor đã xác minh",
      "req-2",
    );
    expect(res.domain).toBe("SAT");
    expect(res.focusSkills).toContain("SAT.MATH");
    expect(res.targetScore).toBe(1450);
    expect(res.maxPricePerHour).toBe(400_000);
    expect(res.availability).toContain("FRI_14_00");
    expect(res.verifiedOnly).toBe(true);
    expect(res.canonicalRequest).toBeDefined();
  });

  it("keeps the domain unresolved instead of silently defaulting to IELTS", () => {
    const res = parseMentorPrompt("Em muốn tìm mentor rẻ và rảnh buổi tối");
    expect(res.domain).toBeNull();
    expect(res.canonicalRequest).toBeUndefined();
    expect(res.parserNotes.join(" ")).toContain("Chưa xác định");
  });

  it("does not set arbitrary budget for vague phrase 'ngân sách rẻ'", () => {
    const res = parseMentorPrompt("Em muốn học HSK 3 lên 5, cần mentor nhiệt tình, ngân sách rẻ");
    expect(res.domain).toBe("HSK");
    expect(res.currentScore).toBe(3);
    expect(res.targetScore).toBe(5);
    expect(res.maxPricePerHour).toBeUndefined();
    expect(res.teachingStyles).toContain("MOTIVATING");
    expect(res.parserNotes.length).toBeGreaterThan(0);
  });

  it("validates and parses MentorMatchPayloadV1", () => {
    const raw = {
      schemaVersion: "mentor-match-payload.v1",
      rawText: "IELTS 6.0 -> 7.0",
      canonicalRequest: {
        requestId: "req-1",
        goal: { domain: "IELTS", focusSkills: ["IELTS.WRITING"] },
        hardConstraints: {
          verifiedOnly: false,
          requiredExpertise: [],
          requireAllAvailability: false,
        },
        availability: ["TUE_19_00"],
        softPreferences: { teachingStyles: [], languages: ["VI"] },
        additionalPreferences: [],
      },
      createdAt: new Date().toISOString(),
    };

    const parsed = parseMentorMatchPayload(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.canonicalRequest.goal.domain).toBe("IELTS");
  });

  it("validates and parses MentorRunSnapshotV1", () => {
    const raw = {
      schemaVersion: "mentor-run-snapshot.v1",
      engineVersion: "mentor-engine-v1.0.0",
      result: {
        engineVersion: "mentor-engine-v1.0.0",
        packageVersion: "1.0.0",
        schemaVersion: "1.0.0",
        configVersions: { ontology: "1", aliases: "1", weights: "1" },
        requestResolution: {
          status: "RESOLVED",
          coverage: 1,
          resolved: [],
          unresolved: [],
        },
        recommendations: [
          {
            mentorId: "m-1",
            rank: 1,
            matchScore: 92,
            scoreBreakdown: { SUBJECT_EXPERTISE: 0.95 },
            appliedWeights: { SUBJECT_EXPERTISE: 1.0 },
            reasons: ["IELTS 8.5"],
            tradeoffs: [],
            dataCoverage: 0.9,
          },
        ],
        diagnostics: {
          candidateCount: 10,
          eligibleCount: 8,
          latencyMs: 1.2,
        },
      },
      hardConstraintSnapshot: {
        eligible: ["m-1"],
        rejected: [{ mentorId: "m-2", reasons: ["PRICE"] }],
      },
      mentorDisplaySnapshot: [
        {
          mentorId: "m-1",
          fullName: "Nguyễn Văn A",
          headline: "IELTS 8.5",
          clusterKey: "IELTS",
          pricePerHour: 250000,
          verified: true,
        },
      ],
      createdAt: new Date().toISOString(),
    };

    const parsed = parseMentorRunSnapshot(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.result.recommendations[0]?.matchScore).toBe(92);
  });
});
